import assert from "node:assert/strict";
import test from "node:test";
import { createCommercialApplication } from "../app";
import { createStore } from "../db/store";
import { farmRecords } from "../db/schema";
import { uid } from "../organizations/service";
import { geometryHash } from "../../server/analysis-jobs.js";
import { claimJob, handleJob, scoped } from "./service";
import { workOne } from "./worker";
import { encryptedBackup, restoreEncryptedBackup } from "../operations/backup";

const base = "http://localhost:5180";
const root = "/api/v1/terra-brain";
const geometry = { type: "Polygon", coordinates: [[[27, 41], [27.001, 41],
  [27.001, 41.001], [27, 41.001], [27, 41]]] };
const scope = { season: 2024, geometryVersion: geometryHash(geometry) };
const provenance = { schemaVersion: 1, ...scope, source: "Isolated test profile", measurementMethod: "Explicit fixture",
  permissionConfirmed: true, origin: "measurement", observedOn: "2025-06-05" };
const soil = { ...provenance, kind: "soil", csv:
  "field_capacity,wilting_point,root_depth_m,initial_depletion_mm,unit\n30,15,1,70,%" };
const weather = { ...provenance, kind: "weather", csv:
  "date,et0_mm,effective_rain_mm,crop_coefficient,temperature_c\n2025-06-01,5,0,1,18\n2025-06-02,5,0,1,19" };
const moisture = { ...provenance, kind: "moisture", csv:
  "date,top_cm,bottom_cm,moisture,unit\n2025-06-01,0,40,25,%\n2025-06-01,40,100,21,%\n2025-06-02,0,40,25,%" };
const weatherForecast = { ...provenance, kind: "forecast_weather", origin: "provider", observedOn: "2025-06-02",
  csv: "date,et0_mm,effective_rain_mm,crop_coefficient,temperature_c\n2025-06-03,5,0,1,18" };

test("Terra Brain pilot preserves data, queue leases and isolation through the HTTP contract", async () => {
  const store = await createStore({ url: process.env.AGROMAX_TERRA_TEST_DATABASE_URL, migrate: true });
  try {
    const app = await createCommercialApplication({ store, baseURL: base, rateLimit: false,
      secret: "terra-isolated-fixture-signing-secret-long-123", enforceQuota: false });
    async function call(path: string, cookie = "", body?: unknown, key = uid()) {
      const response = await app.handle(new Request(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { Origin: base, Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": key },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      }));
      return { status: response.status, data: await response.json(),
        cookie: response.headers.getSetCookie().map(item => item.split(";")[0]).join("; "),
        disposition: response.headers.get("content-disposition") };
    }
    const a = await call("/api/guest", "", {});
    const b = await call("/api/guest", "", {});
    assert.equal(a.status, 201, JSON.stringify(a.data));
    assert.equal(b.status, 201, JSON.stringify(b.data));
    const org = (await call("/api/v1/bootstrap", a.cookie)).data.organizations[0].id;
    const id = uid();
    await store.db.insert(farmRecords).values({ id, organizationId: org, kind: "field",
      body: JSON.stringify({ name: "Fixture parcel", kind: "field", crop: "Kışlık buğday", geometry }) });
    const field = root + "/fields/" + id;
    assert.equal((await call(root + "/status")).status, 401);
    assert.equal((await call(root + "/openapi.json", a.cookie)).data.openapi, "3.1.0");
    assert.equal((await call(field + "/observations?season=2024", b.cookie)).status, 404);
    assert.equal((await call(field + "/imports?dryRun=true", a.cookie, soil)).data.rowCount, 1);
    assert.equal((await call(field + "/observations?season=2024", a.cookie)).data.observations.length, 0);
    const invalid = await call(field + "/imports", a.cookie, { ...weather,
      csv: weather.csv + "\n2025-06-02,5,,1,19" });
    assert.equal(invalid.status, 422, JSON.stringify(invalid.data));
    assert.equal(invalid.data.details.errors[0].row, 4);
    const wrongGeometry = await call(field + "/imports", a.cookie, { ...soil, geometryVersion: "a".repeat(64) });
    assert.equal(wrongGeometry.status, 409);
    const key = uid();
    const requests = await Promise.all(Array.from({ length: 20 }, () => call(field + "/imports", a.cookie, soil, key)));
    for (const request of requests) assert.equal(request.status, 202, JSON.stringify(request.data));
    const importId = requests[0]!.data.job.id;
    assert.equal(new Set(requests.map(request => request.data.job.id)).size, 1);
    assert.equal((await call(field + "/imports", a.cookie, weather, key)).status, 409);
    const firstLease = await scoped(store, org, tx => claimJob(tx, org));
    assert.ok(firstLease);
    await scoped(store, org, tx => tx.query("update terra_brain.jobs set lease_until=now()-interval '1 second' where id=$1", [importId]));
    assert.equal(await workOne(store, org), true);
    assert.equal(await handleJob(store, firstLease), "superseded");
    const resultPath = (jobId: string) => root + "/jobs/" + jobId;
    const importResult = await call(resultPath(importId), a.cookie);
    assert.equal(importResult.data.job.attempts, 2);
    const events = await scoped(store, org, tx => tx.query("select kind from terra_brain.events where job_id=$1", [importId]));
    assert.equal(events.rows.filter(row => row.kind === "observation.accepted").length, 1);
    assert.equal((await store.raw.query("select count(*) as count from farm_notifications where job_id=$1", [importId]))
      .rows[0]?.count?.toString(), "1");
    assert.equal((await call(resultPath(importId), b.cookie)).status, 404);
    await store.raw.query("create role terra_test_reader nologin nobypassrls");
    await store.raw.query("grant usage on schema terra_brain to terra_test_reader");
    await store.raw.query("grant select on terra_brain.jobs to terra_test_reader");
    await store.transaction(async tx => {
      await tx.query("set local role terra_test_reader");
      assert.equal((await tx.query("select id from terra_brain.jobs")).rows.length, 0);
      await tx.query("select set_config('agromax.terra_org',$1,true)", [org]);
      assert.deepEqual((await tx.query("select id from terra_brain.jobs")).rows, [{ id: importId }]);
    });
    const soilId = importResult.data.job.result.datasetId;

    const weatherJob = await call(field + "/imports", a.cookie, weather);
    const moistureJob = await call(field + "/imports", a.cookie, moisture);
    assert.equal(weatherJob.status, 202, JSON.stringify(weatherJob.data));
    assert.equal(moistureJob.status, 202, JSON.stringify(moistureJob.data));
    await Promise.all([workOne(store, org), workOne(store, org)]);
    const weatherId = (await call(resultPath(weatherJob.data.job.id), a.cookie)).data.job.result.datasetId;
    const moistureId = (await call(resultPath(moistureJob.data.job.id), a.cookie)).data.job.result.datasetId;
    const payload = { ...scope, kind: "water_balance", soilId, weatherId,
      parameters: { sowingDate: "2024-10-20", depletionFraction: 0.5, systemEfficiency: 0.8,
        baseTemperatureC: 0, waterCostMinorPerM3: 200, maxVolumeM3: 100_000, maxCostMinor: 100_000 },
      baseline: { name: "A", irrigation: [] },
      alternative: { name: "B", irrigation: [{ date: "2025-06-01", grossMm: 10 }] },
      optimization: { allowedDays: ["2025-06-01", "2025-06-02"], depthsMm: [10, 20], maxApplications: 1 } };
    const run = await call(field + "/runs", a.cookie, payload);
    assert.equal(run.status, 202, JSON.stringify(run.data));
    await workOne(store, org);
    const done = await call(resultPath(run.data.job.id), a.cookie);
    assert.equal(done.data.job.state, "succeeded", JSON.stringify(done.data));
    const estimate = done.data.job.result.result;
    assert.equal(estimate.capacityMm, 150);
    // A removes 5 mm daily. B first adds 8 mm net and then removes 5 mm daily.
    assert.ok(Math.abs(estimate.scenarios[0].finalDepletionMm - 80) < 1e-6);
    assert.ok(Math.abs(estimate.scenarios[1].finalDepletionMm - 72) < 1e-6);
    assert.equal(done.data.job.result.optimization.evaluated, 5);
    assert.deepEqual(done.data.job.result.optimization.best.irrigation, []);
    const report = await call(resultPath(run.data.job.id) + "/report", a.cookie);
    assert.equal(report.status, 200);
    assert.match(report.disposition!, /attachment; filename="terra-/);
    assert.equal(report.data.manifest.sources.length, 2);
    assert.equal((await call(resultPath(run.data.job.id) + "/report", b.cookie)).status, 404);

    const evaluation = await call(field + "/runs", a.cookie, { ...scope, kind: "evaluation",
      runId: run.data.job.id, scenarioName: "A", moistureId });
    const replay = await call(field + "/runs", a.cookie, { ...scope, kind: "replay", runId: run.data.job.id });
    const willCancel = await call(field + "/runs", a.cookie, { ...scope, kind: "research" });
    assert.equal(evaluation.status, 202, JSON.stringify(evaluation.data));
    assert.equal(replay.status, 202, JSON.stringify(replay.data));
    assert.equal(willCancel.status, 202, JSON.stringify(willCancel.data));
    await Promise.all([workOne(store, org), workOne(store, org)]);
    const running = await scoped(store, org, tx => claimJob(tx, org));
    assert.ok(running);
    assert.equal(running.id, willCancel.data.job.id);
    assert.equal((await call(resultPath(running.id) + "/cancel", a.cookie, {})).data.job.state, "canceled");
    assert.equal(await handleJob(store, running), "superseded");
    const metrics = (await call(resultPath(evaluation.data.job.id), a.cookie)).data.job.result;
    assert.equal(metrics.count, 1);
    assert.equal(metrics.excluded.length, 1);
    assert.ok(Math.abs(metrics.maeMm - 1) < 1e-6);
    assert.deepEqual((await call(resultPath(replay.data.job.id), a.cookie)).data.job.result.result, estimate);
    assert.equal((await call(field + "/twin?season=2024", a.cookie)).data.twin.fieldId, id);
    assert.equal((await call(field + "/twin", a.cookie)).data.twin.season, 2024);
    const archive = await call(field + "/imports", a.cookie, weatherForecast);
    assert.equal(archive.status, 202, JSON.stringify(archive.data));
    await workOne(store, org);
    const forecastWeather = (await call(resultPath(archive.data.job.id), a.cookie)).data.job.result.datasetId;
    const forecast = await call(field + "/runs", a.cookie, { ...scope, kind: "forecast",
      runId: run.data.job.id, weatherId: forecastWeather, future: { name: "A", irrigation: [] } });
    assert.equal(forecast.status, 202, JSON.stringify(forecast.data));
    await workOne(store, org);
    const forecastList = await call(field + "/forecasts?season=2024", a.cookie);
    assert.equal(forecastList.data.status, "research_only");
    const projected = forecastList.data.forecasts[0].result;
    assert.ok(Math.abs(projected.horizons[0].modelMm - (80 + 5 * 70 / 75)) < 1e-6);
    assert.deepEqual(projected.horizons.map((part: {state: string}) => part.state), ["uncertain", "needs_data", "needs_data"]);
    assert.equal(projected.predictionInterval, null);
    const changed = await call(field + "/runs", a.cookie, { ...scope, kind: "research" });
    assert.equal(changed.status, 202, JSON.stringify(changed.data));
    const editingLease = await scoped(store, org, tx => claimJob(tx, org));
    assert.equal(editingLease?.id, changed.data.job.id);
    const edited = { ...geometry, coordinates: [[[27, 41], [27.002, 41],
      [27.002, 41.001], [27, 41.001], [27, 41]]] };
    await store.raw.query("update farm_records set body=$2 where id=$1", [id, JSON.stringify({
      name: "Revised fixture parcel", kind: "field", geometry: edited,
    })]);
    assert.equal(await handleJob(store, editingLease!), "failed");
    const rejected = (await call(resultPath(changed.data.job.id), a.cookie)).data.job;
    assert.equal(rejected.error.code, "GEOMETRY_CHANGED");
    assert.equal(rejected.result, null);
    const sampleId = uid();
    await store.db.insert(farmRecords).values({ id: sampleId, organizationId: org, kind: "field",
      body: JSON.stringify({ name: "Example parcel", location: "Tekirdağ", demo: true, geometry }) });
    const samplePath = root + "/fields/" + sampleId;
    const sampleSources = await call(samplePath + "/observations?season=2025", a.cookie);
    assert.equal(sampleSources.status, 200);
    assert.equal(sampleSources.data.observations.length, 5);
    assert.ok(sampleSources.data.observations.every((row: { metadata: { synthetic: boolean } }) => row.metadata.synthetic));
    const sampleJobs = await call(samplePath + "/jobs?season=2025", a.cookie);
    const balance = sampleJobs.data.jobs.find((job: { kind: string }) => job.kind === "water_balance");
    assert.equal(sampleJobs.data.jobs.length, 3);
    assert.equal(balance.state, "succeeded");
    assert.equal((await call(resultPath(balance.id) + "/report", a.cookie)).status, 200);
    assert.equal((await call(resultPath(balance.id) + "/report", b.cookie)).status, 404);
    const interactive = await call(samplePath + "/demo-balance?irrigation=31", a.cookie);
    assert.equal(interactive.status, 200);
    assert.equal(interactive.data.irrigation, 31);
    assert.equal(interactive.data.result.scenarios[0].stressDays, 0);
    assert.equal((await call(samplePath + "/demo-balance?irrigation=81", a.cookie)).status, 400);
    assert.equal((await call(samplePath + "/demo-balance", b.cookie)).status, 404);
    const password = "explicit-isolated-pilot-test-backup-key";
    const encrypted = await encryptedBackup(store, password);
    const restored = await createStore({ migrate: true });
    try {
      await restoreEncryptedBackup(restored, encrypted.bytes, password);
      const original = await scoped(store, org, tx => tx.query("select id,manifest,output from terra_brain.jobs where org_id=$1 order by id", [org]));
      const copy = await scoped(restored, org, tx => tx.query("select id,manifest,output from terra_brain.jobs where org_id=$1 order by id", [org]));
      assert.deepEqual(copy.rows, original.rows);
    } finally {
      await restored.close();
    }
  } finally {
    await store.close();
  }
});
