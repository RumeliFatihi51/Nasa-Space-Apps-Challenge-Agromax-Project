import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApplication } from "../server/application.js";
import { readFile } from "node:fs/promises";
import { createStore, type SqlClient } from "./db/store";
import { initializeDatabase } from "../server/database.js";
import {
  createAnalysisService,
  geometryHash,
} from "../server/analysis-jobs.js";
import { createPlatformService } from "../server/platform.js";
import { seedGuestDemo } from "../server/demo.js";
import { guestEmail } from "../shared/guest.js";
import { imageAnalysis } from "../server/fields.js";
import { demoRaster } from "../shared/demo-raster.js";
import { domainSchemas } from "../shared/contracts/commercial";
import { indices } from "../shared/metrics.js";
import { parseDraft } from "../shared/platform-contracts.js";
import { coverageFlight } from "../shared/qgc-plan.js";
import { fieldFacts } from "./assistant/service";
import { projectWorkspace } from "./production/snapshot";
import { renderReport } from "./reports/pdf";
import type { ReportSnapshot } from "./reports/service";
import { createSyncHub } from "../src/sync/sync-hub.js";
import { runWaterBalance } from "./simulation/water-balance";

test("SQL demo installs two isolated consistent businesses, preserves identities and is idempotent", async () => {
  const store = await createStore({ migrate: true });
  const adapt = (client: SqlClient): any => ({
    exec: async (sql: string) => {
      for (const statement of sql.split(";").filter((s) => s.trim()))
        await client.query(statement);
    },
    prepare: (sql: string) => {
      const run = (...values: unknown[]) => {
        let i = 0;
        return client.query(
          sql.replace(/\?/g, () => "$" + ++i),
          values,
        );
      };
      return {
        get: async (...v: unknown[]) => (await run(...v)).rows[0],
        all: async (...v: unknown[]) => (await run(...v)).rows,
        run: async (...v: unknown[]) => ({
          changes: (await run(...v)).rowCount || 0,
        }),
      };
    },
    transaction: (callback: any) =>
      store.transaction((client) => callback(adapt(client))),
  });
  const db = adapt(store.raw);
  try {
    await initializeDatabase(db);
    await createAnalysisService(db, { configured: () => false });
    const platform = await createPlatformService(db);
    const installer = await readFile("demo/AGROMAX_SUPABASE_DEMO.sql", "utf8");
    await (
      store.raw as unknown as { exec: (sql: string) => Promise<unknown> }
    ).exec(installer);
    const a = "a".repeat(32),
      b = "b".repeat(32),
      c = "c".repeat(32);
    for (const id of [a, b, c])
      await store.raw.query(
        "insert into users(id,name,email,password) values($1,$2,$3,$4)",
        [id, "DEMO test", guestEmail(id), "unusable-test-password"],
      );
    await seedGuestDemo(db, { id: a, email: guestEmail(a) });
    await seedGuestDemo(db, { id: b, email: guestEmail(b) });
    const before = await store.raw.query("select count(*)::int n from records");
    await seedGuestDemo(db, { id: a, email: guestEmail(a) });
    assert.deepEqual(
      (await store.raw.query("select count(*)::int n from records")).rows,
      before.rows,
    );
    assert.equal(
      (
        await store.raw.query(
          "select count(*)::int n from records where user_id=$1",
          [a],
        )
      ).rows[0]?.n,
      15,
    );
    const fields = await db
      .prepare("select id,body from records where user_id=? and kind='field'")
      .all(a);
    const other = await db
      .prepare("select id from records where user_id=? and kind='field'")
      .all(b);
    assert.ok(
      fields.every(
        (row: any) => !other.some((item: any) => row.id === item.id),
      ),
    );
    const actor = {
      id: a,
      name: "Demo",
      email: guestEmail(a),
      authentication: "legacy-session" as const,
      emailVerified: false,
    };
    const ctx = await projectWorkspace(store, actor);
    for (const row of fields) {
      const field = JSON.parse(row.body),
        hash = geometryHash(field.geometry);
      const context = await platform.fieldContext(a, row.id);
      assert.equal(context.geometryHash, hash);
      assert.equal(context.history.length, 1);
      assert.ok(context.latestAnalysis);
      assert.equal(context.comparison.length, indices.length);
      const files = await platform.records(a, row.id);
      assert.equal(files.length, 12);
      for (const file of files) {
        parseDraft({
          fieldId: row.id,
          kind: file.kind,
          name: file.name,
          payload: file.payload,
        });
        assert.equal(file.fieldSnapshot.geometryHash, hash);
        if (file.kind === "flight_plan")
          assert.ok(
            coverageFlight(field.geometry, field.geometry, file.payload).lanes
              .length > 0,
          );
      }
      const job = await db
        .prepare(
          "select id,result from analysis_jobs where field_id=? and user_id=?",
        )
        .get(row.id, a);
      const { analysis, geometry } = await imageAnalysis(
        db,
        a,
        row.id,
        job.id,
        field,
      );
      assert.equal(geometryHash(geometry), hash);
      for (const scene of analysis.scenes)
        for (const metric of ["NDVI", "NDMI", "NDRE"]) {
          const raster = demoRaster(geometry, scene.demoStep, metric),
            values = raster.values.filter((value): value is number =>
              Number.isFinite(value),
            );
          const stored = analysis.observations.find(
            (item: any) =>
              item.from.slice(0, 10) === scene.properties.datetime.slice(0, 10),
          ).stats[metric].mean;
          assert.ok(
            Math.abs(
              stored -
                values.reduce((a: number, b: number) => a + b, 0) /
                  values.length,
            ) < 1e-9,
          );
        }
      await assert.rejects(imageAnalysis(db, b, row.id, job.id, field), {
        status: 404,
      });
      const domains = await store.raw.query(
        "select kind,data from domain_records where field_id=$1",
        [row.id],
      );
      assert.equal(domains.rows.length, 14);
      for (const domain of domains.rows) {
        if (domain.kind === "water_balance") {
          const d = domain.data as any;
          assert.deepEqual(runWaterBalance(d.input, d.areaM2), d.result);
        } else
          domainSchemas[domain.kind as keyof typeof domainSchemas].parse(
            domain.data,
          );
      }
      const seededReport = (
        await store.raw.query(
          "select snapshot from reports where field_id=$1",
          [row.id],
        )
      ).rows[0]?.snapshot as ReportSnapshot;
      assert.equal(seededReport.analysisId, job.id);
      assert.equal(
        (await renderReport(seededReport)).subarray(0, 4).toString(),
        "%PDF",
      );
      const facts = await fieldFacts(store.db, ctx, row.id, "tr");
      assert.ok(facts.some((item) => item.text.includes("Uçuş planı")));
      assert.ok(
        facts.some((item) => item.text.includes("Temsili laboratuvar")),
      );
    }
    await db
      .prepare("insert into records(id,user_id,kind,body) values(?,?,?,?)")
      .run("d".repeat(32), c, "task", "{}");
    assert.deepEqual(
      (await store.raw.query("select agromax_install_demo($1) as outcome", [c]))
        .rows[0]?.outcome,
      { installed: false, reason: "account_not_empty" },
    );
    assert.equal(
      (
        await db
          .prepare("select count(*) as n from records where user_id=?")
          .get(c)
      ).n,
      1,
    );
    const app = await createApplication({ db });
    const server = http.createServer(app.handle);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address() as { port: number };
      const origin = "http://127.0.0.1:" + address.port;
      const login = await fetch(origin + "/api/guest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(login.status, 201);
      const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
      const get = (path: string) =>
        fetch(origin + "/api/" + path, { headers: { cookie } });
      const records = await (await get("records")).json();
      const parcel = records.find(
        (row: { kind: string }) => row.kind === "field",
      );
      assert.ok(parcel.demo && parcel.name.startsWith("DEMO"));
      assert.equal(
        records.filter((row: { kind: string }) => row.kind === "task").length,
        12,
      );
      const spatial = await (
        await get("platform/fields/" + parcel.id + "/spatial")
      ).json();
      assert.equal(spatial.observations.length, 8);
      const latest = spatial.observations[0];
      const pixels = await fetch(
        origin + "/api/records/" + parcel.id + "/image",
        {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({
            date: latest.date,
            analysisId: latest.id,
            layer: "NDVI",
            format: "values",
          }),
        },
      );
      assert.equal(pixels.status, 200);
      assert.equal((await pixels.json()).demo, true);
      const forecast = await (await get("weather?fieldId=" + parcel.id)).json();
      assert.equal(forecast.demo, true);
      assert.equal(forecast.points.length, 49);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    const privileges = await store.raw
      .query(
        "select has_function_privilege('public','agromax_install_demo(text)','execute') as permitted",
      )
      .catch(() => null);
    if (privileges) assert.equal(privileges.rows[0]?.permitted, false);
  } finally {
    await store.close();
  }
});

test("workspace invalidations ignore another workspace and unsubscribe cleanly", () => {
  const a = createSyncHub(),
    b = createSyncHub();
  a.setScope("first");
  b.setScope("second");
  let count = 0;
  const unsubscribe = b.subscribe(() => count++);
  b.receive(a.publish());
  assert.equal(count, 0);
  b.setScope("first");
  b.receive(a.publish());
  assert.equal(count, 2);
  unsubscribe();
  b.refresh();
  assert.equal(count, 2);
});
