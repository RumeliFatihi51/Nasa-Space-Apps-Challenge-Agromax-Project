import test from "node:test";
import assert from "node:assert/strict";
import { screenTerrainFlow } from "../shared/terrain-flow.js";

const frame = {
  span: 50,
  width: 50,
  depth: 50,
  coordinate: (x, y) => [x / 10000, y / 10000],
};
const geometry = {
  type: "Polygon",
  coordinates: [
    [
      [-0.003, -0.003],
      [0.003, -0.003],
      [0.003, 0.003],
      [-0.003, 0.003],
      [-0.003, -0.003],
    ],
  ],
};

test("downhill routing accumulates contributors without manufacturing off-parcel runoff", () => {
  const result = screenTerrainFlow(
    frame,
    { resolution: 10, sample: (x) => -x },
    geometry,
  );
  assert.equal(result.valid, 25);
  assert.equal(result.peak, 5);
  assert.equal(result.interiorLows, 0);
  for (const cell of result.cells.filter(
    (cell) => cell && cell.downstream !== null,
  ))
    assert.ok(result.cells[cell.downstream].elevation < cell.elevation);
  assert.equal(
    result.cells
      .filter((cell) => cell?.downstream === null)
      .reduce((sum, cell) => sum + cell.cells, 0),
    25,
  );
});

test("interior sink and missing DEM are reported separately", () => {
  const result = screenTerrainFlow(
    frame,
    { resolution: 10, sample: (x, y) => Math.hypot(x, y) },
    geometry,
  );
  assert.equal(result.interiorLows, 1);
  assert.equal(result.peak, 25);
  assert.equal(
    screenTerrainFlow(frame, { resolution: 10, sample: () => null }, geometry),
    null,
  );
  assert.equal(
    screenTerrainFlow(frame, { resolution: 50, sample: () => 12 }, geometry),
    null,
  );
});
