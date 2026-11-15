import { containsPoint } from "./spatial.js";

// Topographic screening on the DEM's display grid. Only downhill links are
// admitted so accumulation can be calculated in decreasing elevation order.
export function screenTerrainFlow(frame, terrain, geometry, maxCells = 96) {
  const spacing = Math.max(terrain.resolution, frame.span / maxCells);
  if (!Number.isFinite(spacing) || spacing <= 0) return null;
  const width = Math.max(1, Math.floor(frame.width / spacing));
  const height = Math.max(1, Math.floor(frame.depth / spacing));
  const origin = [(-width * spacing) / 2, (-height * spacing) / 2];
  const cells = Array.from({ length: width * height }, (_, i) => {
    const col = i % width,
      row = Math.floor(i / width);
    const local = [
      origin[0] + (col + 0.5) * spacing,
      origin[1] + (row + 0.5) * spacing,
    ];
    const coordinate = frame.coordinate(...local);
    if (!containsPoint(geometry, coordinate)) return null;
    const elevation = terrain.sample(...local);
    return Number.isFinite(elevation)
      ? {
          index: i,
          col,
          row,
          local,
          coordinate,
          elevation,
          downstream: null,
          slope: 0,
          cells: 1,
          edge: false,
        }
      : null;
  });
  const valid = cells.filter(Boolean);
  if (valid.length < 9) return null;
  for (const cell of valid) {
    for (const dy of [-1, 0, 1])
      for (const dx of [-1, 0, 1]) {
        if (!dx && !dy) continue;
        const x = cell.col + dx,
          y = cell.row + dy;
        const next =
          x >= 0 && x < width && y >= 0 && y < height
            ? cells[y * width + x]
            : null;
        if (!next) {
          cell.edge = true;
          continue;
        }
        const slope =
          (cell.elevation - next.elevation) / (spacing * Math.hypot(dx, dy));
        if (slope > cell.slope) {
          cell.slope = slope;
          cell.downstream = next.index;
        }
      }
  }
  for (const cell of valid.slice().sort((a, b) => b.elevation - a.elevation))
    if (cell.downstream !== null) cells[cell.downstream].cells += cell.cells;
  return {
    spacing,
    width,
    height,
    origin,
    cells,
    valid: valid.length,
    peak: Math.max(...valid.map((cell) => cell.cells)),
    interiorLows: valid.filter((cell) => !cell.edge && cell.downstream === null)
      .length,
  };
}
