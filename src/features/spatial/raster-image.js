import { polygons, project, unproject } from "../../../shared/spatial";
import { colorFor } from "./colors";

export function rasterImage(raster, geometry, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(raster.width, raster.height);
  for (let index = 0; index < raster.values.length; index++) {
    const value = raster.values[index];
    if (Number.isFinite(value))
      image.data.set([...colorFor(value, scale), 255], index * 4);
  }
  context.putImageData(image, 0, 0);
  // Clip the rendered image to the exact saved boundary, including its holes.
  const clipped = document.createElement("canvas");
  clipped.width = raster.width * 4;
  clipped.height = raster.height * 4;
  const mask = clipped.getContext("2d");
  const [west, south, east, north] = raster.bounds;
  for (const polygon of polygons(geometry))
    for (const ring of polygon) {
      ring.forEach((coordinate, index) => {
        const [x, y] = project(coordinate);
        const px = ((x - west) / (east - west)) * clipped.width;
        const py = ((north - y) / (north - south)) * clipped.height;
        if (index === 0) mask.moveTo(px, py);
        else mask.lineTo(px, py);
      });
      mask.closePath();
    }
  mask.clip("evenodd");
  mask.imageSmoothingEnabled = false;
  mask.drawImage(canvas, 0, 0, clipped.width, clipped.height);
  return {
    url: clipped.toDataURL("image/png"),
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ].map(unproject),
  };
}
