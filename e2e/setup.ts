import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { hashPassword } from "better-auth/crypto";
import { createStore } from "../commercial/db/store";
import { user, account, farmRecords, farmJobs, farmAnalyses, analysisClaims } from "../commercial/db/schema";
import {
  createOrganization,
  resolveContext,
} from "../commercial/organizations/service";
import { createReport } from "../commercial/reports/service";
import { processReport } from "../commercial/reports/worker";
import { privateObjects } from "../commercial/files/private-store";
import { prepareField } from "../server/fields.js";
import { comparisonRange } from "../server/satellite.js";
import { geometryHash } from "../server/analysis-jobs.js";
import { deriveClaims } from "../commercial/intelligence/claims";
import { fingerprint, parseImport, prepareBalance } from "../commercial/terra-brain/kernel";
import { enqueue, scoped, loadDataset } from "../commercial/terra-brain/service";
import { workOne } from "../commercial/terra-brain/worker";
import { validateGeometry } from "../shared/geometry.js";
export default async function setup() {
  const root = resolve("data", `browser-fixtures-${Date.now()}`),
    directory = resolve(root, "postgres"),
    objects = privateObjects({
      directory: resolve(root, "objects"),
      remote: false,
    });
  await mkdir(root, { recursive: true });
  const store = await createStore({ dataDir: directory, migrate: true });
  let pilotOrg = "";
  try {
    for (const [project, fieldDigit, analysisDigit] of [
      ["desktop", "a", "c"], ["mobile", "b", "d"], ["upgrade", "e", "f"],
    ] as const) {
      const actor = {
        id: `browser-${project}`,
        name: `EXPLICIT BROWSER TEST ${project}`,
        email: `${project}@example.invalid`,
        emailVerified: true,
      };
      await store.db.insert(user).values(actor);
      await store.db.insert(account).values({
        id: `account-${project}`,
        userId: actor.id,
        accountId: actor.id,
        providerId: "credential",
        password: await hashPassword("browser-fixture-password-123"),
      });
      const org = await createOrganization(store.db, actor, {
        name: `TEST WORKSPACE ${project}`,
      });
      const ctx = await resolveContext(store.db, actor, org.id);
      const fieldId = fieldDigit.repeat(32);
      const fieldGeometry = {
          type: "Polygon",
          coordinates: [
            [
              [27.5, 38.5],
              [27.501, 38.5],
              [27.501, 38.501],
              [27.5, 38.501],
              [27.5, 38.5],
            ],
          ],
      };
      const field = prepareField({
        name: `EXPLICIT TEST PARCEL ${project}`,
        crop: "Buğday",
        geometry: fieldGeometry,
      });
      await store.db.insert(farmRecords).values({
        id: fieldId,
        organizationId: org.id,
        kind: "field",
        body: JSON.stringify(field),
      });
      const id = analysisDigit.repeat(32);
      const scenes = project === "upgrade" ? ["2026-10-28", "2026-10-31"].map((date) => ({
        id: "EXPLICIT-RASTER-FIXTURE-" + date, properties: { datetime: date + "T09:00:00.000Z" },
      })) : [];
      const analysis = {
        source: "EXPLICIT SYNTHETIC BROWSER FIXTURE",
        method: "s2-l2a-v3",
        provider: "cdse",
        fetchedAt: new Date().toISOString(),
        resolution: 20,
        range: comparisonRange(),
        comparison: {
          NDVI: {
            previous: { mean: 0, meanCoverage: 0.9, observations: 3 },
            current: { mean: 0.3, meanCoverage: 0.9, observations: 2 },
            delta: 0.3,
          },
          NDMI: { previous: null, current: null, delta: null },
        },
        observations: scenes.map(({ properties }, index) => {
          const date = properties.datetime.slice(0, 10);
          const mean = index ? 0.3 : 0.2;
          const stats = Object.fromEntries(["NDVI", "NDRE", "NDMI", "NDWI"].map((id) => [
            id, { mean, min: 0.05, max: 0.54, coverage: 1, validPixels: 64, totalPixels: 64 },
          ]));
          return {
            from: date + "T00:00:00.000Z",
            to: new Date(Date.parse(date) + 86400000).toISOString(), stats,
          };
        }),
        scenes,
        historyId: id,
      };
      await store.db.insert(farmJobs).values({
        id,
        fieldId,
        organizationId: org.id,
        state: "completed",
        snapshot: JSON.stringify({ field: { ...field, id: fieldId } }),
        geometryHash: geometryHash(JSON.parse(JSON.stringify(field)).geometry),
        result: JSON.stringify(analysis),
        createdAt: new Date().toISOString(),
      });
      if (project === "upgrade") await store.db.insert(farmAnalyses).values({
        fieldId, geometryHash: geometryHash(JSON.parse(JSON.stringify(field)).geometry),
        body: JSON.stringify(analysis),
      });
      const claims = deriveClaims(analysis);
      if (!claims.length) throw new Error("Expected explicit browser fixture claim.");
      await store.db.insert(analysisClaims).values(claims.map((claim) => ({
        ...claim,
        id: randomBytes(16).toString("hex"),
        organizationId: org.id,
        fieldId,
        analysisId: id,
        geometryVersion: geometryHash(JSON.parse(JSON.stringify(field)).geometry),
      })));
      const report = await createReport(
        store.db,
        ctx,
        { analysisId: id },
        `browser-${project}`,
        false,
      );
      await processReport(store, objects, report.id, `browser-run-${project}`);
      if (project === "upgrade") {
        pilotOrg = org.id;
        const source = { org: org.id, field: fieldId, actor: actor.id, legacy: false };
        const geometryVersion = geometryHash(fieldGeometry);
        const context = { season: 2024, geometryVersion };
        const common = { ...context, schemaVersion: 1, source: "EXPLICIT BROWSER FIXTURE",
          measurementMethod: "CSV fixture", permissionConfirmed: true, origin: "measurement", observedOn: "2025-06-02" };
        const inputs = [
          parseImport({ ...common, kind: "soil", csv: "field_capacity,wilting_point,root_depth_m,initial_depletion_mm,unit\n30,15,1,70,%" }),
          parseImport({ ...common, kind: "weather", csv: "date,et0_mm,effective_rain_mm,crop_coefficient,temperature_c\n2025-06-01,5,0,1,18\n2025-06-02,5,0,1,19" }),
        ];
        for (const entry of inputs)
          await scoped(store, org.id, tx => enqueue(tx, source, 2024, geometryVersion,
            "browser-" + entry.kind, entry.digest, { kind: "import", manifest: entry }));
        for (const _ of inputs) await workOne(store, org.id);
        await scoped(store, org.id, async tx => {
          const { rows } = await tx.query("select id,kind from terra_brain.datasets where org_id=$1", [org.id]);
          const soilId = String(rows.find(row => row.kind === "soil")?.id);
          const weatherId = String(rows.find(row => row.kind === "weather")?.id);
          const sources = [await loadDataset(tx, source, 2024, geometryVersion, soilId, "soil"),
            await loadDataset(tx, source, 2024, geometryVersion, weatherId, "weather")];
          const volume = 100_000;
          const payload = { ...context, kind: "water_balance" as const, soilId, weatherId, parameters: {
            sowingDate: "2024-10-20", depletionFraction: 0.5, systemEfficiency: 0.8, baseTemperatureC: 0,
            waterCostMinorPerM3: 200, maxVolumeM3: volume, maxCostMinor: 100_000,
          }, baseline: { name: "A · Temel plan", irrigation: [] },
          alternative: { name: "B · Alternatif plan", irrigation: [{ date: "2025-06-01", grossMm: 10 }] } };
          const manifest = prepareBalance(payload, sources, validateGeometry(fieldGeometry).area * 1000, "2025-06-02T22:00:00Z");
          await enqueue(tx, source, 2024, geometryVersion, "browser-balance", fingerprint(payload),
            { kind: "water_balance", manifest });
        });
        await workOne(store, org.id);
      }
    }
  } finally {
    await store.close();
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: "5182",
    HOST: "127.0.0.1",
    AGROMAX_APP_URL: "http://127.0.0.1:5182",
    AGROMAX_AUTH_SECRET: randomBytes(48).toString("base64url"),
    AGROMAX_LOCAL_DATA_DIR: directory,
    AGROMAX_LOCAL_OBJECT_DIR: resolve(root, "objects"),
    AGROMAX_ENFORCE_QUOTAS: "false",
    SENTINEL_PROVIDER: "cdse",
    SENTINEL_CLIENT_ID: "explicit-browser-fixture",
    SENTINEL_CLIENT_SECRET: "explicit-browser-fixture",
    AGROMAX_ISOLATED_BROWSER_FIXTURE: "true",
    AGROMAX_TERRA_BRAIN_ENABLED: "true",
    AGROMAX_TERRA_BRAIN_ORGS: pilotOrg,
    AGROMAX_LANDSAT_AWS_ENABLED: "false",
    AGROMAX_RESEND_API_KEY: "",
    AGROMAX_MAIL_FROM: "",
    AGROMAX_FILIZ_ENABLED: "false",
  };
  delete env.VERCEL;
  delete env.AGROMAX_DATABASE_URL;
  delete env.AGROMAX_SUPABASE_BUCKET;
  Object.assign(env, { AGROMAX_DEBUG: "true" });
  Object.assign(env, {
    WORKFLOW_TARGET_WORLD: "local",
    WORKFLOW_LOCAL_DATA_DIR: resolve(root, "workflow"),
    WORKFLOW_LOCAL_BASE_URL: "http://127.0.0.1:5182",
  });
  const server = spawn(process.execPath, ["--import", "./e2e/provider-fixture.mjs", process.env.AGROMAX_BROWSER_SERVER_ENTRY || ".output/server/index.mjs"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let logs = "";
  server.stdout?.on("data", (chunk) => {
    logs = (logs + chunk).slice(-4000);
  });
  server.stderr?.on("data", (chunk) => {
    logs = (logs + chunk).slice(-4000);
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch("http://127.0.0.1:5182/api/runtime");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) break;
    await delay(500);
  }
  if (!ready) {
    server.kill();
    throw new Error("Browser fixture server did not become ready: " + logs);
  }
  const smoke = await fetch("http://127.0.0.1:5182/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5182",
    },
    body: JSON.stringify({
      email: "upgrade@example.invalid",
      password: "browser-fixture-password-123",
    }),
  });
  if (!smoke.ok) {
    const data = await smoke.json();
    server.kill();
    throw new Error(
      `Compiled login failed (${smoke.status}): ${JSON.stringify(data)} ${logs}`,
    );
  }
  process.env.AGROMAX_BROWSER_UPGRADE_COOKIE = smoke.headers.getSetCookie()
    .map((value) => value.split(";")[0]).join("; ");
  console.log(
    "Browser tests use isolated, explicitly labeled PostgreSQL and satellite HTTP fixtures.",
  );
  return async () => {
    await writeFile(resolve(root, "server.log"), logs);
    server.kill();
    await delay(300);
  };
}
