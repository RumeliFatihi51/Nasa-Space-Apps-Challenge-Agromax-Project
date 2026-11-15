import type { SqlClient } from "../db/store";
import { validateGeometry } from "../../shared/geometry.js";
import { computeBalance, computeForecast, evaluateBalance, fingerprint, parseImport, prepareBalance, prepareForecast } from "./kernel";
import type { Dataset } from "./kernel";
import type { Scope } from "./service";

export const sampleSeason = 2025;
const sampleVersion = "example-water-balance-v2";
const dates = Array.from({ length: 14 }, (_, i) => `2026-05-${String(i + 11)}`);
const source = "Sentetik eğitim verisi";
const profiles = {
  "Tekirdağ": { initialMm: 28, rain: 9, et0: 3.4, irrigation: 12 },
  "Edirne": { initialMm: 66, rain: 3, et0: 4.3, irrigation: 20 },
  "Kırklareli": { initialMm: 91, rain: 0, et0: 5, irrigation: 28 },
};
type SampleParcel = { geometry: unknown; geometryVersion: string; location?: string };

export function makeSampleStudy(parcel: SampleParcel, fieldId: string, depth?: number) {
  const profile = profiles[parcel.location as keyof typeof profiles] ?? profiles.Edirne;
  const scope = { season: sampleSeason, geometryVersion: parcel.geometryVersion };
  const provenance = { ...scope, schemaVersion: 1 as const, source, origin: "declaration" as const,
    measurementMethod: "Eğitim senaryosu", permissionConfirmed: true as const, observedOn: dates.at(-1)! };
  const daily = dates.map((date, day) =>
    `${date},${profile.et0 + (day % 3) * .3},${day === 3 || day === 9 ? profile.rain : 0},1,${17 + day % 7}`);
  const entries = [
    parseImport({ ...provenance, kind: "soil", csv:
      `field_capacity,wilting_point,root_depth_m,initial_depletion_mm,unit\n30,15,1,${profile.initialMm},%` }),
    parseImport({ ...provenance, kind: "weather", csv:
      ["date,et0_mm,effective_rain_mm,crop_coefficient,temperature_c", ...daily].join("\n") }),
    parseImport({ ...provenance, kind: "irrigation", csv: "date,gross_mm\n2026-05-12,0" }),
    parseImport({ ...provenance, kind: "moisture", origin: "measurement", csv:
      "date,top_cm,bottom_cm,moisture,unit\n2026-05-15,0,40,24,%\n2026-05-15,40,100,22,%" }),
    parseImport({ ...provenance, kind: "forecast_weather", origin: "provider", csv:
      ["date,et0_mm,effective_rain_mm,crop_coefficient,temperature_c",
        ...Array.from({length:7}, (_, i) => `2026-05-${25 + i},4.5,0,1,22`)].join("\n") }),
  ];
  const id = (kind: string) => fingerprint([sampleVersion, fieldId, parcel.geometryVersion, kind]).slice(0,32);
  const datasets: Dataset[] = entries.map(({ kind, metadata, rows }) => {
    const sampleMetadata = { ...metadata, origin: "declaration" as const, synthetic: true };
    return {
      id: id(kind), kind, digest: fingerprint({kind, metadata: sampleMetadata, rows}), metadata: sampleMetadata, rows,
    };
  });
  const irrigation = depth ?? profile.irrigation;
  const areaM2 = validateGeometry(parcel.geometry).area * 1000;
  const manifest = prepareBalance({
    ...scope, kind: "water_balance", soilId: datasets[0]!.id, weatherId: datasets[1]!.id,
    parameters: { sowingDate: "2025-10-20", depletionFraction: .5, systemEfficiency: .8,
      baseTemperatureC: 0, waterCostMinorPerM3: 200, maxVolumeM3: Math.max(100000, areaM2 * .08),
      maxCostMinor: Math.max(20000000, areaM2 * 16) },
    baseline: { name: "Sulamasız", irrigation: [] },
    alternative: { name: `${irrigation} mm sulama`, irrigation: [{ date: dates[2]!, grossMm: irrigation }] },
  }, datasets, areaM2, "2026-05-24T23:59:59Z");
  manifest.release = sampleVersion;
  const output = computeBalance(manifest);
  const runId = id("water_balance");
  const forecast = prepareForecast(runId, manifest, output.result, datasets[4]!, {name: "Sulamasız", irrigation: []});
  const evaluation = { baseId: runId, balance: manifest, result: output.result, moisture: datasets[3]!, scenarioName: "Sulamasız" };
  const jobs = [
    { id: runId, kind: "water_balance", manifest, output },
    { id: id("forecast"), kind: "forecast", manifest: forecast, output: computeForecast(forecast) },
    { id: id("evaluation"), kind: "evaluation", manifest: evaluation,
      output: evaluateBalance(manifest, output.result, datasets[3]!.rows, "Sulamasız") },
  ].map(job => ({ ...job, key: `${sampleVersion}:${job.id}`, digest: fingerprint(job.manifest) }));
  return { datasets, output, irrigation, season: sampleSeason, jobs };
}

export async function seedSampleStudy(tx: SqlClient, scope: Scope, parcel: SampleParcel) {
  const study = makeSampleStudy(parcel, scope.field);
  for (const item of study.datasets) {
    await tx.query(`insert into terra_brain.datasets(id,org_id,field_id,season,geometry_version,kind,digest,metadata,rows)
      values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) on conflict do nothing`,
    [item.id, scope.org, scope.field, study.season, parcel.geometryVersion, item.kind, item.digest,
      JSON.stringify(item.metadata), JSON.stringify(item.rows)]);
  }
  for (const job of study.jobs) {
    await tx.query(`insert into terra_brain.jobs(id,org_id,field_id,actor_id,legacy,season,geometry_version,kind,key,request_digest,manifest,state,output,ended_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'succeeded',$12::jsonb,now()) on conflict do nothing`,
    [job.id, scope.org, scope.field, scope.actor, scope.legacy, study.season, parcel.geometryVersion,
      job.kind, job.key, job.digest, JSON.stringify(job.manifest), JSON.stringify(job.output)]);
  }
}
