import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { ownField } from "../records/service";
import type { CommercialDb } from "../db/store";
import type { Context } from "../organizations/service";
import { observationCache } from "../db/schema";
import { boundsOf } from "../../server/satellite.js";
import { fetchPower, historyInput, powerParameters } from "./power";
import { DomainError } from "../core/errors";
import { geometryHash } from "../../server/analysis-jobs.js";
export async function historicalWeather(
  db: CommercialDb,
  ctx: Context,
  fieldId: string,
  input: unknown,
) {
  const range = historyInput.parse(input),
    field = await ownField(db, ctx, fieldId);
  if (!field.geometry)
    throw new DomainError("GEOMETRY_REQUIRED", "Parsel sınırı gerekli.", 422);
  const hash = geometryHash(field.geometry),
    key = createHash("sha256")
      .update(
        JSON.stringify([ctx.organization.id, fieldId, hash, range, "power-v1"]),
      )
      .digest("hex");
  const [cached] = await db
    .select()
    .from(observationCache)
    .where(eq(observationCache.key, key));
  if (cached && cached.expiresAt > new Date())
    return { ...cached.body, cache: "hit" };
  const bounds = boundsOf(field.geometry),
    point = {
      lat: (bounds[1] + bounds[3]) / 2,
      lng: (bounds[0] + bounds[2]) / 2,
    };
  if (field.demo === true && field.demoVersion === 1) {
    if (range.end >= new Date().toISOString().slice(0,10))
      throw new DomainError("HISTORICAL_DATE_REQUIRED","Geçmişte tamamlanmış günleri seçin.",400);
    const count = (Date.parse(range.end) - Date.parse(range.start)) / 86400000 + 1;
    return { fieldId, geometryVersion:hash, source:"Sentetik günlük hava", kind:"model_estimate",
      sources:["AgroMax örnek veri"], methodVersion:"demo-weather-v1", timeStandard:"UTC", point, range,
      fetchedAt:new Date().toISOString(), parameters:powerParameters, nativeGrid:"Sentetik eğitim senaryosu",
      observations:Array.from({length:count},(_, offset)=>{
        const index=Math.floor(Date.parse(range.start)/86400000)+offset;
        return {
        date:new Date(Date.parse(range.start)+offset*86400000).toISOString().slice(0,10),
        values:{T2M:12+Math.sin(index/3)*3,T2M_MIN:7+Math.sin(index/3)*3,T2M_MAX:17+Math.sin(index/3)*3,
          RH2M:68,WS2M:2.8,ALLSKY_SFC_SW_DWN:3.2,PRECTOTCORR:index%6===0?5:0,PS:101.2}
      };})
    };
  }
  const data = await fetchPower(point, range);
  const body = {
    ...data,
    fieldId,
    geometryVersion: hash,
    pointMethod: "WGS84 parsel sınırlayıcı kutusunun orta noktası",
  };
  await db
    .insert(observationCache)
    .values({
      key,
      provider: "nasa-power",
      fieldId,
      organizationId: ctx.organization.id,
      geometryVersion: hash,
      body,
      expiresAt: new Date(Date.now() + 86400000),
    })
    .onConflictDoUpdate({
      target: observationCache.key,
      set: {
        body,
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  return { ...body, cache: "miss" };
}
