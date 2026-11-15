// Isolated in-memory API tests; no real accounts or provider requests.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createApplication } from "./application.js";
import { geometryHash } from "./analysis-jobs.js";
import { sqliteDatabase } from "./database.js";

test("HTTP accounts, owner boundaries, parser and durable sessions use the shared cloud/local handler", async () => {
  const db = sqliteDatabase(new DatabaseSync(":memory:"));
  const app = await createApplication({ db });
  const server = http.createServer(app.handle);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, cookie, extra = {}) => {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie"),
    };
  };
  try {
    assert.equal((await request("/api/records")).status, 401);
    assert.equal(
      (
        await request("/api/register", {}, null, {
          Origin: "https://other.invalid",
        })
      ).status,
      403,
    );
    const malformed = await fetch(base + "/api/register", {
      method: "POST",
      body: "{",
    });
    assert.equal(malformed.status, 400);
    const guest = await request("/api/guest", {});
    const otherGuest = await request("/api/guest", {});
    assert.equal(guest.status, 201);
    assert.match(guest.cookie, /HttpOnly/);
    assert.equal(guest.data.guest, true);
    assert.notEqual(otherGuest.data.id, guest.data.id);
    assert.equal((await request("/api/guest", {}, guest.cookie)).data.id, guest.data.id);
    const guestParcel = await request("/api/records", { kind: "field", name: "Guest field", area: 10 }, guest.cookie);
    assert.equal(guestParcel.status, 201);
    assert.deepEqual((await request("/api/records", undefined, otherGuest.cookie)).data, []);
    assert.equal((await request("/api/platform/fields/" + guestParcel.data.id, undefined, otherGuest.cookie)).status, 404);
    const credentials = {
      name: "Explicit test fixture",
      email: "fixture@example.invalid",
      password: "isolated-fixture-password-123",
    };
    const a = await request("/api/register", credentials);
    assert.equal(a.status, 200);
    assert.match(a.cookie, /HttpOnly/);
    assert.equal(
      (
        await request("/api/login", {
          ...credentials,
          password: "wrong-password-123",
        })
      ).status,
      401,
    );
    const b = await request("/api/register", {
      ...credentials,
      email: "other-fixture@example.invalid",
    });
    assert.deepEqual(
      (await request("/api/records", undefined, a.cookie)).data,
      [],
    );
    const field = await request(
      "/api/records",
      { kind: "field", name: "Isolated parcel", area: 3 },
      a.cookie,
    );
    assert.equal(field.status, 201);
    assert.equal(
      (
        await request(
          `/api/records/${field.data.id}/analysis`,
          undefined,
          b.cookie,
        )
      ).status,
      404,
    );
    const shape = {type:"Polygon",coordinates:[[[27.5,38.5],[27.501,38.5],[27.501,38.501],[27.5,38.501],[27.5,38.5]]]};
    const missionField = await request("/api/records", {kind:"field",name:"Mission field",geometry:shape}, a.cookie);
    assert.equal(missionField.status,201);
    const review = { geometryHash:geometryHash(shape), waypoints:[[27.5002,38.5002],[27.5008,38.5008]],
      settings:{ altitude:35, speed:5, endurance:22 } };
    const investigation = {fieldId:missionField.data.id,kind:"investigation",name:"Drone review",
      payload:{priority:"normal",region:"Test parcel",requestedData:"Check site",simulationReview:review}};
    const fakeSource = {metric:"NDVI",provider:"cdse",method:"s2-l2a-v3",
      current:{analysisId:"a".repeat(32),date:"2026-10-31"},previous:{analysisId:"b".repeat(32),date:"2026-10-28"}};
    assert.equal((await request("/api/platform/records", {...investigation,payload:{...investigation.payload,
      simulationReview:{...review,satellite:fakeSource}}},a.cookie)).status,422);
    assert.equal((await request("/api/platform/records", {...investigation,payload:{...investigation.payload,
      simulationReview:{...review,waypoints:[[27.5002,38.5002],[27.52,38.51]]}}},a.cookie)).status,400);
    assert.equal((await request("/api/platform/records", investigation,b.cookie)).status,404);
    const storedReview = await request("/api/platform/records", investigation,a.cookie);
    assert.equal(storedReview.status,201);
    assert.deepEqual(storedReview.data.record.payload.simulationReview, review);
    assert.equal(storedReview.data.record.review.machineExecution,false);
    // A separate application instance can read the session and records from storage.
    const restarted = await createApplication({ db });
    const otherServer = http.createServer(restarted.handle);
    await new Promise((resolve) => otherServer.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(
        `http://127.0.0.1:${otherServer.address().port}/api/records`,
        { headers: { Cookie: a.cookie } },
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json())[0].id, field.data.id);
    } finally {
      await new Promise((resolve) => otherServer.close(resolve));
      await restarted.analysisService.waitForIdle();
    }
    await request("/api/logout", {}, a.cookie);
    assert.equal((await request("/api/me", undefined, a.cookie)).status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.analysisService.waitForIdle();
    await db.close();
  }
});
