import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { sqliteDatabase, initializeDatabase } from "./database.js";
import { createAnalysisService, geometryHash } from "./analysis-jobs.js";
import { createPlatformService } from "./platform.js";
import {
  missionEvidence,
  mergeMissionRecords,
} from "../shared/mission-evidence.js";

const fieldId = "a".repeat(32),
  otherField = "b".repeat(32);
const geometry = {
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
const hash = geometryHash(geometry);
const reviewInput = {
  fieldId,
  kind: "investigation",
  name: "Explicit simulation review",
  payload: {
    priority: "normal",
    region: "Fixture field",
    requestedData: "Record field evidence",
    state: "open",
    simulationReview: {
      geometryHash: hash,
      waypoints: [
        [27.5002, 38.5002],
        [27.5008, 38.5008],
      ],
      settings: { altitude: 35, speed: 5, endurance: 22 },
    },
  },
};
const finding = (review, extra = {}) => ({
  fieldId,
  kind: "observation",
  name: "Field finding",
  payload: {
    category: "sensor",
    observedAt: "2026-11-01",
    notes: "Explicit recorded reading",
    coordinate: [27.5002, 38.5002],
    sensor: { device: "Fixture meter", metric: "soilMoisture", value: 0 },
    missionFinding: {
      reviewId: review.id,
      reviewVersion: review.version,
      waypointIndex: 0,
      observedChange: "uncertain",
    },
    ...extra,
  },
});

test("field findings bind the exact reviewed mission revision and remain private, durable and immutable", async () => {
  const db = sqliteDatabase(new DatabaseSync(":memory:"));
  await initializeDatabase(db);
  await createAnalysisService(db, { configured: () => false });
  for (const [id, owner] of [
    [fieldId, "org-a"],
    [otherField, "org-b"],
    ["c".repeat(32), "org-a"],
  ])
    await db
      .prepare("INSERT INTO records(id,user_id,kind,body) VALUES(?,?,?,?)")
      .run(
        id,
        owner,
        "field",
        JSON.stringify({ name: "Explicit fixture", geometry }),
      );
  const service = await createPlatformService(db, {
    ownership: "organization",
  });
  try {
    const review = await service.save(
      "org-a",
      reviewInput,
      undefined,
      "editor-a",
    );
    await assert.rejects(
      service.save("org-b", { ...finding(review), fieldId: otherField }),
      { status: 404 },
    );
    await assert.rejects(
      service.save("org-a", { ...finding(review), fieldId: "c".repeat(32) }),
      { status: 404 },
    );
    await assert.rejects(
      service.save(
        "org-a",
        finding(review, {
          missionFinding: {
            ...finding(review).payload.missionFinding,
            reviewVersion: 900,
          },
        }),
      ),
      { status: 404 },
    );
    await assert.rejects(
      service.save(
        "org-a",
        finding(review, {
          missionFinding: {
            ...finding(review).payload.missionFinding,
            waypointIndex: 23,
          },
        }),
      ),
      { status: 400 },
    );
    await assert.rejects(
      service.save("org-a", finding(review, { coordinate: [27.52, 38.51] })),
      { status: 400 },
    );
    await assert.rejects(
      service.save("org-a", finding(review, { coordinate: undefined })),
      { status: 400 },
    );
    await assert.rejects(
      service.save("org-a", finding(review, { observedAt: "2099-01-01" })),
      { status: 400 },
    );
    await assert.rejects(
      service.save(
        "org-a",
        finding(review, {
          sensor: {
            device: "Fixture meter",
            metric: "soilMoisture",
            value: 101,
          },
        }),
      ),
      { status: 400 },
    );
    const stored = await service.save(
      "org-a",
      finding(review),
      undefined,
      "field-observer",
    );
    assert.equal(stored.payload.sensor.value, 0);
    assert.equal(stored.createdBy, "field-observer");
    assert.equal(stored.review.machineExecution, false);
    // Updating the parent never rewrites the evidence's immutable version reference.
    await service.save(
      "org-a",
      {
        ...reviewInput,
        version: 1,
        payload: { ...reviewInput.payload, state: "in_progress" },
      },
      review.id,
    );
    const restarted = await createPlatformService(db);
    const records = await restarted.records("org-a", fieldId);
    assert.deepEqual(
      records.find((r) => r.id === stored.id).payload.missionFinding,
      finding(review).payload.missionFinding,
    );
    const input = finding(review);
    delete input.payload.missionFinding;
    const edited = await restarted.save(
      "org-a",
      { ...input, version: 1 },
      stored.id,
    );
    assert.deepEqual(
      edited.payload.missionFinding,
      finding(review).payload.missionFinding,
    );
    await assert.rejects(
      restarted.save(
        "org-a",
        {
          ...finding(review, {
            missionFinding: {
              ...finding(review).payload.missionFinding,
              waypointIndex: 1,
            },
          }),
          version: 2,
        },
        stored.id,
      ),
      { status: 409 },
    );
    await assert.rejects(
      restarted.save("org-a", { ...input, version: 1 }, stored.id),
      { status: 409 },
    );
    const bundle = await restarted.bundle("org-a", fieldId);
    assert.ok(
      bundle.records.some(
        (r) =>
          r.id === stored.id && r.payload.missionFinding.reviewVersion === 1,
      ),
    );
    await db
      .prepare("UPDATE records SET body=? WHERE id=?")
      .run(
        JSON.stringify({ name: "Changed boundary", geometry: null }),
        fieldId,
      );
    await assert.rejects(restarted.save("org-a", finding(review)), {
      status: 400,
    });
  } finally {
    await db.close();
  }
});

const scene = (id, date, value, period, extra = {}) => ({
  id,
  date,
  provider: "cdse",
  method: "s2-l2a-v3",
  metrics: { NDVI: value },
  period,
  coverage: { NDVI: 1 },
  minimumCoverage: 0.7,
  ...extra,
});
const baseline = scene("d".repeat(32), "2026-10-31", 0.3, {
  from: "2026-10-31T00:00:00Z",
  to: "2026-11-01T00:00:00Z",
});
const after = scene("e".repeat(32), "2026-11-05", 0.45, {
  from: "2026-11-05T00:00:00Z",
  to: "2026-11-06T00:00:00Z",
});
const reviewed = {
  id: "f".repeat(32),
  fieldId,
  fieldSnapshot: { geometryHash: hash },
  payload: {
    simulationReview: {
      ...reviewInput.payload.simulationReview,
      satellite: {
        metric: "NDVI",
        provider: "cdse",
        method: "s2-l2a-v3",
        current: { analysisId: baseline.id, date: baseline.date },
        previous: { analysisId: "1".repeat(32), date: "2026-10-28" },
      },
    },
  },
};
test("reassessment needs compatible sources and separate observed periods, preserves missing data and scopes deltas to the parcel", () => {
  assert.equal(
    missionEvidence(reviewed, [], [baseline]).state,
    "awaiting_capture",
  );
  assert.equal(
    missionEvidence(
      reviewed,
      [],
      [baseline, { ...after, provider: "earth-search" }],
    ).state,
    "awaiting_capture",
  );
  assert.equal(
    missionEvidence(reviewed, [], [after]).state,
    "baseline_missing",
  );
  assert.equal(
    missionEvidence(
      reviewed,
      [],
      [baseline, { ...after, metrics: { NDVI: null } }],
    ).comparison,
    null,
  );
  assert.equal(
    missionEvidence(
      reviewed,
      [],
      [
        baseline,
        { ...after, period: { from: "2026-10-31", to: "2026-11-06" } },
      ],
    ).state,
    "periods_overlap",
  );
  assert.equal(
    missionEvidence(reviewed, [], [baseline, { ...after, period: undefined }])
      .comparison,
    null,
  );
  assert.equal(
    missionEvidence(
      reviewed,
      [],
      [baseline, { ...after, coverage: { NDVI: 0.5 } }],
    ).state,
    "coverage_insufficient",
  );
  assert.equal(
    missionEvidence(reviewed, [], [baseline, { ...after, coverage: undefined }])
      .comparison,
    null,
  );
  const result = missionEvidence(reviewed, [], [after, baseline]);
  assert.ok(Math.abs(result.comparison.delta - 0.15) < 1e-10);
  assert.equal(result.comparison.scope, "parcel_mean");
  assert.equal(result.comparison.causal, false);
  assert.equal(
    missionEvidence(
      {
        ...reviewed,
        payload: { simulationReview: reviewInput.payload.simulationReview },
      },
      [],
      [],
    ).state,
    "no_source",
  );
});

test("mission evidence counts visited points once, retains uncertain findings, filters archived/foreign boundaries and merges latest revisions", () => {
  const record = {
    ...finding({ ...reviewed, version: 1 }),
    id: "2".repeat(32),
    version: 1,
    status: "draft",
    updatedAt: "2026-11-02",
    fieldSnapshot: { geometryHash: hash },
  };
  const records = [
    record,
    { ...record, id: "3".repeat(32) },
    { ...record, id: "4".repeat(32), status: "archived" },
    { ...record, id: "5".repeat(32), fieldId: otherField },
    { ...record, id: "6".repeat(32), fieldSnapshot: { geometryHash: "old" } },
  ];
  const evidence = missionEvidence(reviewed, records, []);
  assert.equal(evidence.findings.length, 2);
  assert.equal(evidence.checked, 1);
  assert.equal(
    evidence.findings[0].payload.missionFinding.observedChange,
    "uncertain",
  );
  const updated = { ...record, version: 2, status: "archived" };
  assert.deepEqual(mergeMissionRecords([record], [updated], [record]), [
    updated,
  ]);
});
