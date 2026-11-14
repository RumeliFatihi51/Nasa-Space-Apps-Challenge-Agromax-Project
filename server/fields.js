import { createHash } from "node:crypto";
import { validateGeometry } from "../shared/geometry.js";

export function prepareField(body, existing = {}) {
  const name = String(body.name ?? existing.name ?? "").trim();
  if (!name || name.length > 150)
    throw new Error("Tarla adı 1-150 karakter olmalı.");
  const next = {
    ...existing,
    name,
    crop: String(body.crop ?? existing.crop ?? "").slice(0, 100),
    location: String(body.location ?? existing.location ?? "").slice(0, 150),
    notes: String(body.notes ?? existing.notes ?? "").slice(0, 4000),
    updatedAt: new Date().toISOString(),
  };
  if (body.geometry) Object.assign(next, validateGeometry(body.geometry));
  else if (existing.geometry)
    Object.assign(next, validateGeometry(existing.geometry));
  else {
    const area = Number(body.area ?? existing.area);
    if (!Number.isFinite(area) || area <= 0)
      throw new Error("Çizilmiş sınır veya geçerli alan bilgisi gerekli.");
    Object.assign(next, { area, areaSource: "user" });
  }
  return next;
}
