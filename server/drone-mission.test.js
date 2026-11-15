import test from "node:test";
import assert from "node:assert/strict";
import {
  flightFrame,
  indexOutlook,
  planSimulation,
  reviewTargets,
  routeGroundProfile,
  segmentInside,
  simulationTrace,
  suggestRoute,
} from "../shared/drone-mission.js";
import { rasterGrid, metricFrame } from "../shared/spatial.js";
import { parseDraft } from "../shared/platform-contracts.js";

const geometry = {
  type: "Polygon",
  coordinates: [
    [
      [27.5, 38.5],
      [27.503, 38.5],
      [27.503, 38.503],
      [27.5, 38.503],
      [27.5, 38.5],
    ],
  ],
};
const settings = { altitude: 30, speed: 5, endurance: 20 };
const a = [27.5003, 38.5003],
  b = [27.5027, 38.5027];

test("flight timeline returns to its origin, turns, climbs and drains estimated battery", () => {
  const plan = planSimulation(geometry, [a, b], settings);
  assert.equal(plan.error, undefined);
  assert.equal(flightFrame(plan, 0).phase, "Kalkış");
  assert.equal(flightFrame(plan, 5).altitude, 9);
  assert.equal(flightFrame(plan, plan.legs[1].start + 1).phase, "Dönüş");
  assert.equal(flightFrame(plan, plan.landing + 1).phase, "İniş");
  const end = flightFrame(plan, plan.duration);
  assert.deepEqual(end.point, a);
  assert.equal(end.altitude, 0);
  assert.equal(end.battery, plan.reserve);
  assert.deepEqual(simulationTrace(plan, 5, a), [a]);
  assert.deepEqual(simulationTrace(plan, plan.duration, a), plan.route);
  assert.ok(
    plan.legs.every(
      (leg) =>
        flightFrame(plan, leg.start + leg.turnTime + leg.travel / 2).speed <=
        settings.speed + 1e-7,
    ),
  );
});

test("route ground profile respects the DEM and keeps missing heights unknown", () => {
  const plan = planSimulation(geometry, [a, b], settings);
  const frame = metricFrame(geometry);
  const result = routeGroundProfile(plan, frame, {
    resolution: 30,
    sample: (east) => (east > 0 ? 100 + east / 10 : null),
  });
  assert.equal(result.spacing, 30);
  assert.ok(result.coverage > 0 && result.coverage < 1);
  assert.equal(result.samples[0].elevation, null);
  assert.equal(result.samples.at(-1).distance, plan.distance);
  assert.ok(result.maximum > result.minimum);
  assert.equal(
    routeGroundProfile(plan, frame, { resolution: 20, sample: () => null })
      .minimum,
    null,
  );
});

test("a route may retain provenance for additional supported satellite indices", () => {
  const capture = { analysisId: "a".repeat(32), date: "2026-10-31" };
  const draft = parseDraft({
    fieldId: "b".repeat(32),
    kind: "investigation",
    name: "Explicit test",
    payload: {
      priority: "normal",
      region: "Fixture",
      requestedData: "Field review",
      simulationReview: {
        geometryHash: "c".repeat(64),
        waypoints: [a, b],
        settings,
        satellite: {
          metric: "NDWI",
          current: capture,
          previous: { ...capture, date: "2026-10-28" },
          provider: "cdse",
          method: "s2-l2a-v3",
        },
      },
    },
  });
  assert.equal(draft.payload.simulationReview.satellite.metric, "NDWI");
});

test("route checks reject a cut through a hole, out-of-parcel points and inadequate reserve", () => {
  const hole = [
    [27.501, 38.501],
    [27.502, 38.501],
    [27.502, 38.502],
    [27.501, 38.502],
    [27.501, 38.501],
  ];
  const field = { ...geometry, coordinates: [geometry.coordinates[0], hole] };
  assert.equal(segmentInside(field, a, b), false);
  assert.ok(planSimulation(field, [a, b], settings).error);
  assert.ok(planSimulation(field, [a, [27.51, 38.502]], settings).error);
  assert.ok(
    planSimulation(geometry, [a, b], { ...settings, speed: 1, endurance: 5 })
      .error,
  );
});

test("satellite review target generation requires compatible rasters and ignores invalid pixels", () => {
  const frame = metricFrame(geometry);
  assert.ok(frame.width > 200);
  const grid = {
    ...rasterGrid(geometry, 20),
    metric: "NDVI",
    unit: "ratio",
    provider: "cdse",
    method: "fixture",
    geometryHash: "same",
  };
  const size = grid.width * grid.height;
  const earlier = { ...grid, values: Array(size).fill(0.5) };
  const newer = {
    ...grid,
    values: Array.from({ length: size }, (_, i) =>
      i === 35 || i === 85 ? 0.1 : i === 105 ? null : 0.5 + (i % 7) * 0.002,
    ),
  };
  assert.equal(
    reviewTargets({ ...newer, method: "another" }, earlier, geometry),
    null,
  );
  const findings = reviewTargets(newer, earlier, geometry);
  assert.equal(findings.targets.length, 2);
  const route = suggestRoute(geometry, findings.targets);
  assert.equal(route.length, 2);
  assert.equal(planSimulation(geometry, route, settings).error, undefined);
});

test("index outlook requires sufficient comparable observations and bounds empirical range", () => {
  const times = Array.from({ length: 20 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1 + 5 * i)).toISOString().slice(0, 10),
    metrics: { NDVI: 0.4 + 0.01 * i },
  }));
  assert.equal(indexOutlook(times.slice(0, 9), "NDVI"), null);
  const outcome = indexOutlook(times, "NDVI");
  assert.equal(outcome.date, "2026-04-11");
  assert.ok(outcome.low < outcome.value && outcome.value < outcome.high);
  assert.equal(indexOutlook(times, "EVI"), null);
});
