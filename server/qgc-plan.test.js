import test from "node:test";
import assert from "node:assert/strict";
import { coverageFlight, qgcPlan } from "../shared/qgc-plan.js";
import { segmentInside } from "../shared/drone-mission.js";
import { metricFrame } from "../shared/spatial.js";

const field = {
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
const config = {
  geometryHash: "a".repeat(64),
  firmware: "px4",
  vehicle: "quad",
  firmwareVersion: "",
  home: [27.5001, 38.5001],
  homeAMSL: 132.4,
  altitude: 35,
  speed: 5,
  endurance: 20,
  swath: 15,
  overlap: 20,
  bearing: 0,
  target: { kind: "field" },
};

test("QGC emits relative-home flight commands, measured home AMSL and no actuators", () => {
  const flight = coverageFlight(field, field, config),
    plan = qgcPlan(field, field, config);
  assert.equal(plan.fileType, "Plan");
  assert.equal(plan.version, 1);
  assert.equal(plan.mission.version, 2);
  assert.deepEqual(plan.mission.plannedHomePosition, [38.5001, 27.5001, 132.4]);
  assert.equal(plan.mission.firmwareType, 12);
  assert.equal(plan.mission.vehicleType, 2);
  assert.equal(flight.lanes.length, 10);
  assert.equal(flight.spacing, 12);
  assert.ok(flight.distance > 800);
  assert.ok(flight.seconds < 960);
  for (let i = 1; i < flight.route.length; i++)
    assert.ok(segmentInside(field, flight.route[i - 1], flight.route[i]));
  const items = plan.mission.items;
  assert.equal(items[0].command, 22);
  assert.equal(items.at(-1).command, 21);
  assert.deepEqual(
    items.map((item) => item.doJumpId),
    items.map((_, i) => i + 1),
  );
  for (const item of items) {
    assert.ok([16, 21, 22, 178].includes(item.command));
    assert.equal(item.params.length, 7);
    assert.ok(
      item.params.every((value) => value === null || Number.isFinite(value)),
    );
    if (item.command !== 178) {
      assert.equal(item.frame, 3);
      assert.equal(item.AltitudeMode, 1);
      assert.equal(item.params[6], item.command === 21 ? 0 : 35);
    }
  }
  assert.equal(
    JSON.parse(JSON.stringify(plan)).mission.items[0].params[4],
    38.5001,
  );
  assert.deepEqual(plan.geoFence, { circles: [], polygons: [], version: 2 });
  const ardupilot = qgcPlan(field, field, {
    ...config,
    firmware: "ardupilot",
    vehicle: "hexa",
  });
  assert.equal(ardupilot.mission.firmwareType, 3);
  assert.equal(ardupilot.mission.vehicleType, 13);
});

test("coverage reacts to bearing, overlap and target instead of exporting identical routes", () => {
  const a = coverageFlight(field, field, config),
    b = coverageFlight(field, field, { ...config, bearing: 90, overlap: 50 });
  assert.notDeepEqual(a.route, b.route);
  assert.equal(b.spacing, 7.5);
  const frame = metricFrame(field),
    small = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [20, 0],
          [20, 20],
          [0, 20],
          [0, 0],
        ].map(([x, y]) => frame.coordinate(x, y)),
      ],
    };
  assert.ok(coverageFlight(field, small, config).distance < a.distance);
});

test("planner rejects invalid coordinates, out-of-field home, battery overflow and unbounded routes", () => {
  for (const change of [
    { altitude: NaN },
    { speed: 0 },
    { homeAMSL: undefined },
    { overlap: 100 },
    { vehicle: "plane" },
    { pump: 1 },
  ])
    assert.throws(() => qgcPlan(field, field, { ...config, ...change }));
  assert.throws(
    () => coverageFlight(field, field, { ...config, home: [0, 0] }),
    /Kalkış/,
  );
  assert.throws(
    () => coverageFlight(field, field, { ...config, endurance: 5, speed: 1 }),
    /süre/,
  );
  assert.throws(
    () => coverageFlight(field, field, { ...config, swath: 2, overlap: 80 }),
    /fazla/,
  );
});

test("holes and disconnected geometry are never bridged with unsafe straight connectors", () => {
  const frame = metricFrame(field);
  const rectangle = (left, top, right, bottom) =>
    [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
      [left, top],
    ].map(([x, y]) => frame.coordinate(x, y));
  const hole = {
    ...field,
    coordinates: [field.coordinates[0], rectangle(-10, -20, 10, 20).reverse()],
  };
  assert.throws(() => coverageFlight(hole, hole, config), /Bağlantı/);
  const multi = {
    type: "MultiPolygon",
    coordinates: [[rectangle(-40, -40, -20, 40)], [rectangle(20, -40, 40, 40)]],
  };
  assert.throws(
    () =>
      coverageFlight(multi, multi, {
        ...config,
        home: frame.coordinate(-30, -30),
      }),
    /Bağlantı/,
  );
});
