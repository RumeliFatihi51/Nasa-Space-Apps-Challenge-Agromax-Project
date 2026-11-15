import { indices } from "./metrics.js";
import {
  rasterGrid,
  pixelBounds,
  unproject,
  containsPoint,
} from "./spatial.js";
export const demoProvider = "agromax-demo";
export const demoMethod = "synthetic-reflectance-demo-v1";
export const isDemoAnalysis = (analysis) =>
  analysis?.demo === true &&
  analysis.provider === demoProvider &&
  analysis.method === demoMethod;
// Only trusted repository formulas, never uploaded text. Synthetic reflectance
// drives the stored statistics and displayed pixels through the same function.
const formulas = Object.fromEntries(
  indices.map((item) => [item.id, new Function("s", "return " + item.formula)]),
);
export function demoRaster(geometry, step, metric) {
  if (
    !Object.hasOwn(formulas, metric) ||
    !Number.isInteger(step) ||
    step < 0 ||
    step > 7
  )
    throw Object.assign(new Error("Bu örnek katman desteklenmiyor."), {
      status: 422,
    });
  const grid = rasterGrid(geometry, 20, 24);
  const values = Array.from(
    { length: grid.width * grid.height },
    (_, index) => {
      const b = pixelBounds(grid, index),
        point = unproject([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
      if (!containsPoint(geometry, point)) return null;
      const x = (index % grid.width) / grid.width,
        y = Math.floor(index / grid.width) / grid.height;
      const patch = x < 0.3 && y < 0.35 ? step * 0.018 : 0;
      const growth = 0.005 * step + 0.016 * Math.sin(x * 8 + y * 3);
      const s = {
        B01: 0.035,
        B02: 0.05,
        B03: 0.09,
        B04: 0.07 + patch,
        B05: 0.16,
        B06: 0.28,
        B07: 0.35,
        B08: 0.43 + growth - patch,
        B8A: 0.41 + growth - patch,
        B09: 0.04,
        B10: 0.01,
        B11: 0.2 + patch,
        B12: 0.13 + patch,
      };
      const value = formulas[metric](s);
      return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
    },
  );
  return {
    ...grid,
    values,
    metric,
    provider: demoProvider,
    method: demoMethod,
    unit: "birimsiz",
    parcelPixels: values.filter(Number.isFinite).length,
    demo: true,
    source: "Sentetik yansıtım",
  };
}
