import { createHash } from "node:crypto";
import { z } from "zod";
import { localDate, identifier } from "../../shared/contracts/commercial";
import { DomainError } from "../core/errors";
import { balanceInput, runWaterBalance } from "../simulation/water-balance";

export const methodVersion = "fao56-daily-root-zone-v1";
export const seasonInput = z.number().int().min(1980).max(2100);
const text = z.string().trim().min(1).max(160);
const unitFraction = z.enum(["m3/m3", "%"]);
const fraction = z.number().min(0).max(1);
const soil = z.object({
  field_capacity: fraction, wilting_point: fraction, root_depth_m: z.number().gt(0).max(3),
  initial_depletion_mm: z.number().min(0).max(3000), unit: unitFraction,
});
const weather = z.object({
  date: localDate, et0_mm: z.number().min(0).max(25), effective_rain_mm: z.number().min(0).max(350),
  crop_coefficient: z.number().min(0).max(2), temperature_c: z.number().min(-50).max(60),
});
const irrigation = z.object({ date: localDate, gross_mm: z.number().min(0).max(350) });
const moisture = z.object({
  date: localDate, top_cm: z.number().min(0).max(300), bottom_cm: z.number().gt(0).max(300),
  moisture: fraction, unit: unitFraction,
});
const definitions = {
  soil: { columns: Object.keys(soil.shape), schema: soil, maxRows: 1 },
  weather: { columns: Object.keys(weather.shape), schema: weather, maxRows: 366 },
  forecast_weather: { columns: Object.keys(weather.shape), schema: weather, maxRows: 7 },
  irrigation: { columns: Object.keys(irrigation.shape), schema: irrigation, maxRows: 366 },
  moisture: { columns: Object.keys(moisture.shape), schema: moisture, maxRows: 4000 },
};
export const importInput = z.object({
  schemaVersion: z.literal(1), season: seasonInput,
  geometryVersion: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(["soil", "weather", "forecast_weather", "irrigation", "moisture"]),
  csv: z.string().min(1).max(200_000).refine(value => Buffer.byteLength(value) <= 200_000),
  source: text, measurementMethod: text, permissionConfirmed: z.literal(true),
  origin: z.enum(["measurement", "provider", "declaration"]),
  observedOn: localDate,
}).strict();
const scoped = {
  season: seasonInput, geometryVersion: importInput.shape.geometryVersion,
};
const scenario = z.object({
  name: text.max(80), irrigation: z.array(z.object({
    date: localDate, grossMm: z.number().min(0).max(350),
  }).strict()).max(366),
}).strict();
const params = z.object({
  sowingDate: localDate, depletionFraction: z.number().gt(0).lt(1),
  systemEfficiency: z.number().gt(0).max(1),
  baseTemperatureC: z.number().min(-10).max(20),
  waterCostMinorPerM3: z.number().int().min(0).max(100_000),
  maxVolumeM3: z.number().min(0).max(100_000_000),
  maxCostMinor: z.number().int().min(0).max(1_000_000_000_000),
});
const optimizationInput = z.object({
  allowedDays: z.array(localDate).min(1).max(14),
  depthsMm: z.array(z.number().gt(0).max(350)).min(1).max(6),
  maxApplications: z.number().int().min(1).max(3),
}).strict();
export const runInput = z.discriminatedUnion("kind", [
  z.object({ ...scoped, kind: z.literal("water_balance"), soilId: identifier,
    weatherId: identifier, irrigationId: identifier.optional(), parameters: params,
    baseline: scenario, alternative: scenario, optimization: optimizationInput.optional() }).strict(),
  z.object({ ...scoped, kind: z.literal("evaluation"), runId: identifier,
    moistureId: identifier, scenarioName: text.max(80) }).strict(),
  z.object({ ...scoped, kind: z.literal("replay"), runId: identifier }).strict(),
  z.object({ ...scoped, kind: z.literal("forecast"), runId: identifier, weatherId: identifier,
    future: scenario }).strict(),
  z.object({ ...scoped, kind: z.literal("research"), runId: identifier.optional() }).strict(),
]);
export type Imported = ReturnType<typeof parseImport>;
export type RunRequest = z.infer<typeof runInput>;
export type BalanceResult = ReturnType<typeof runWaterBalance>;
export type BalanceManifest = { methodVersion: typeof methodVersion; areaM2: number;
  sources: DatasetReference[]; input: z.infer<typeof balanceInput>; cutoff: string; release: string;
  optimization?: z.infer<typeof optimizationInput> };
export type DatasetReference = { id: string; kind: Imported["kind"]; digest: string; metadata: Imported["metadata"] };
export type Dataset = DatasetReference & { rows: Imported["rows"] };

export function fingerprint(value: unknown): string {
  const ordered = (item: unknown): unknown => Array.isArray(item) ? item.map(ordered) :
    item && typeof item === "object" ? Object.fromEntries(
      Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, val]) => [key, ordered(val)]),
    ) : item;
  return createHash("sha256").update(JSON.stringify(ordered(value))).digest("hex");
}
const inSeason = (date: string, season: number) =>
  date >= `${season}-07-01` && date <= `${season + 1}-08-31`;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
function invalid(message: string, details?: unknown): never {
  throw new DomainError("DATA_REJECTED", message, 422, details);
}

export function parseImport(raw: unknown) {
  const input = importInput.parse(raw);
  const { csv, kind, season, observedOn, ...provenance } = input;
  const lines = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const { columns, schema, maxRows } = definitions[kind];
  const separator = lines[0]?.includes(";") ? ";" : ",";
  if (lines[0]?.split(separator).map(cell => cell.trim()).join(",") !== columns.join(","))
    invalid("CSV başlıkları şablonla eşleşmiyor.", { expected: columns });
  if (lines.length < 2 || lines.length > maxRows + 1)
    invalid(`Bu veri türü 1–${maxRows} satır kabul eder.`);
  if (!inSeason(observedOn, season))
    invalid("Kaynak gözlem tarihi seçili sezon dışında.");
  if (observedOn > new Date().toISOString().slice(0, 10))
    invalid("Kaynak tarihi gelecekte olamaz.");
  if (kind === "moisture" && input.origin !== "measurement")
    invalid("Toprak nemi doğrulaması için ölçüm kaynağı gerekli.");
  if (kind === "forecast_weather" && input.origin !== "provider")
    invalid("Hava tahmini arşivi için sağlayıcı kaynağı gerekli.");

  const seen = new Set<string>();
  const rows = [];
  const errors: { row: number; reason: string }[] = [];
  for (const [index, line] of lines.slice(1).entries()) {
    const cells = line.split(separator).map(cell => cell.trim());
    const record = Object.fromEntries(columns.map((key, i) => {
      const cell = cells[i] ?? "";
      const numeric = /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cell);
      const value = key === "date" || key === "unit" ? cell : numeric ? Number(cell) : NaN;
      return [key, recordFraction(key, value, cells.at(-1))];
    }));
    const parsed = schema.safeParse(record);
    let issue = cells.length !== columns.length ? "Sütun sayısı hatalı." :
      !parsed.success ? "Geçersiz alanlar: " + parsed.error.issues.map(i => i.path.join(".")).join(", ") : "";
    if (!issue && typeof record.date === "string" && !inSeason(record.date, season))
      issue = "Tarih seçili sezon dışında.";
    if (!issue && typeof record.date === "string") {
      if (kind === "forecast_weather" && (record.date <= observedOn || record.date > addDays(observedOn, 7)))
        issue = "Tahmin günü kaynak yayın tarihinden sonraki 1–7 günlük aralıkta olmalı.";
      if (kind !== "forecast_weather" && record.date > observedOn)
        issue = "Kayıt günü kaynak gözlem tarihinden sonra.";
    }
    if (!issue && kind === "soil" && Number(record.field_capacity) <= Number(record.wilting_point))
      issue = "Tarla kapasitesi solma noktasından büyük olmalı.";
    if (!issue && kind === "moisture" && Number(record.top_cm) >= Number(record.bottom_cm))
      issue = "Ölçüm derinliğinin alt sınırı üst sınırından büyük olmalı.";
    const key = kind === "moisture" ? `${record.date}:${record.top_cm}:${record.bottom_cm}` : String(record.date);
    if (!issue && seen.has(key)) issue = "Aynı ölçüm anahtarı birden fazla kez kullanılmış.";
    if (issue) { if (errors.length < 25) errors.push({ row: index + 2, reason: issue }); continue; }
    seen.add(key);
    rows.push(parsed.data!);
  }
  if (errors.length) invalid("CSV satırlarını düzeltip yeniden dene.", { errors });
  const metadata = { ...provenance, observedOn, sourceCrs: null,
    normalizedUnit: kind === "soil" || kind === "moisture" ? "m3/m3" : "mm, °C",
    originalDigest: createHash("sha256").update(csv).digest("hex"),
    transformation: "terra-field-csv-v1" };
  const variable = kind === "soil" ? "soil_profile" : kind;
  return { kind, season, geometryVersion: input.geometryVersion, metadata, rows,
    variable, originalCsv: csv, digest: fingerprint({ kind, metadata, rows }) };
}
function recordFraction(key: string, value: string | number, unit?: string) {
  if (key === "unit" && unit === "%") return "m3/m3";
  return typeof value === "number" && unit === "%" &&
    ["moisture", "field_capacity", "wilting_point"].includes(key) ? value / 100 : value;
}

export function prepareBalance(request: Extract<RunRequest, { kind: "water_balance" }>,
  datasets: Dataset[], areaM2: number, cutoff: string): BalanceManifest {
  const profile = soil.parse(datasets.find(row => row.kind === "soil")?.rows[0]);
  const days = datasets.find(row => row.kind === "weather")!.rows.map(row => weather.parse(row))
    .sort((a, b) => a.date.localeCompare(b.date));
  const recorded = datasets.find(row => row.kind === "irrigation");
  const getSource = (kind: Imported["kind"]) => datasets.find(row => row.kind === kind)!.metadata.source;
  const { depletionFraction, ...parameters } = request.parameters;
  if (!inSeason(parameters.sowingDate, request.season)) invalid("Ekim tarihi seçili sezon dışında.");
  if (days.some(day => day.date > cutoff.slice(0, 10))) invalid("Su dengesi deneyinde geleceğe ait meteoroloji kullanılamaz.");
  const input = balanceInput.parse({
    scope: "trakya-winter-wheat", ...parameters,
    soilSource: getSource("soil"), weatherSource: getSource("weather"),
    days: days.map(row => ({ date: row.date, et0Mm: row.et0_mm, effectiveRainMm: row.effective_rain_mm,
      cropCoefficient: row.crop_coefficient, meanTempC: row.temperature_c })),
    soil: { fieldCapacity: profile.field_capacity, wiltingPoint: profile.wilting_point,
      rootDepthM: profile.root_depth_m, initialDepletionMm: profile.initial_depletion_mm,
      depletionFraction },
    scenarios: [
      { ...request.baseline, irrigation: recorded ? recorded.rows.map(row => {
        const value = irrigation.parse(row);
        return { date: value.date, grossMm: value.gross_mm };
      }) : request.baseline.irrigation },
      request.alternative,
    ],
  });
  const optimization = request.optimization && {
    ...request.optimization,
    allowedDays: [...new Set(request.optimization.allowedDays)].sort(),
    depthsMm: [...new Set(request.optimization.depthsMm)].sort((a, b) => a - b),
  };
  const dates = new Set(input.days.map(day => day.date));
  if (optimization?.allowedDays.some(day => !dates.has(day))) invalid("Tarama günleri meteoroloji aralığında olmalı.");
  return { methodVersion, areaM2, cutoff, input,
    ...(optimization && { optimization }),
    release: process.env.AGROMAX_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || "local",
    sources: datasets.map(({ id, kind, digest, metadata }) => ({ id, kind, digest, metadata })) };
}

export function computeBalance(manifest: BalanceManifest) {
  if (manifest.methodVersion !== methodVersion) invalid("Bu yöntem sürümü yüklenemedi.");
  const input = balanceInput.parse(manifest.input);
  if (!Number.isFinite(manifest.areaM2) || manifest.areaM2 <= 0) invalid("Parsel alanı geçersiz.");
  const result = runWaterBalance(input, manifest.areaM2);
  const weatherByDate = new Map(input.days.map(day => [day.date, day]));
  for (const scenario of result.scenarios) {
    let stored = result.capacityMm - input.soil.initialDepletionMm;
    for (const day of scenario.days) {
      const remaining = result.capacityMm - day.depletionMm;
      const expected = stored + day.netIrrigationMm + weatherByDate.get(day.date)!.effectiveRainMm -
        day.drainageMm - day.actualEtMm;
      if (!Number.isFinite(remaining) || remaining < -1e-6 || remaining > result.capacityMm + 1e-6 ||
        Math.abs(remaining - expected) > 1e-6) invalid("Günlük su kütlesi dengesi sınamayı geçemedi.");
      stored = remaining;
    }
  }
  const optimization = manifest.optimization ? scanSchedules(manifest, manifest.optimization) : null;
  return { result, optimization, verification: { decision: "accepted", check: "root-zone-conservation-v1",
    applicability: "pilot_scope_review",
    toleranceMm: 1e-6, fieldApproval: "unvalidated_pilot" } };
}

function scanSchedules(manifest: BalanceManifest, search: z.infer<typeof optimizationInput>) {
  const budget = 1000;
  let evaluated = 0;
  let truncated = false;
  type Candidate = { irrigation: { date: string; grossMm: number }[]; stressDays: number; volumeM3: number; costMinor: number };
  let best: Candidate | null = null;
  function visit(start: number, plan: Candidate["irrigation"]) {
    if (evaluated === budget) { truncated = true; return; }
    evaluated++;
    const outcome = runWaterBalance({ ...manifest.input, scenarios: [{ name: "candidate", irrigation: plan }] },
      manifest.areaM2).scenarios[0]!;
    if (!outcome.feasible) return;
    const { stressDays, volumeM3, costMinor } = outcome;
    if (!best || stressDays < best.stressDays ||
      stressDays === best.stressDays && (volumeM3 < best.volumeM3 ||
        volumeM3 === best.volumeM3 && costMinor < best.costMinor))
      best = { irrigation: plan, stressDays, volumeM3, costMinor };
    if (plan.length >= search.maxApplications) return;
    for (let i = start; i < search.allowedDays.length && !truncated; i++)
      for (const grossMm of search.depthsMm) {
        visit(i + 1, [...plan, { date: search.allowedDays[i]!, grossMm }]);
        if (truncated) break;
      }
  }
  visit(0, []);
  return { method: "finite-irrigation-enumeration-v1", evaluated, truncated, best: best as Candidate | null };
}

export type ForecastManifest = { baseId: string; balance: BalanceManifest; future: Dataset;
  initialMm: number; irrigation: Extract<RunRequest, {kind: "forecast"}>["future"]["irrigation"];
  issuedOn: string };

export function prepareForecast(baseId: string, balance: BalanceManifest, result: BalanceResult,
  dataset: Dataset, future: Extract<RunRequest, {kind: "forecast"}>["future"]): ForecastManifest {
  const scenario = result.scenarios.find(row => row.name === future.name);
  const day = scenario?.days.at(-1);
  if (!day) invalid("Başlangıç için tamamlanmış bir model senaryosu seç.");
  if (day.date !== dataset.metadata.observedOn)
    invalid("Hava tahmininin yayın günü son model günüyle eşleşmeli.");
  const supported = new Set(dataset.rows.map(row => weather.parse(row).date));
  if (future.irrigation.some(item => !supported.has(item.date)) ||
    new Set(future.irrigation.map(item => item.date)).size !== future.irrigation.length)
    invalid("Gelecek sulamaları hava tahmini günlerinde olmalı ve tekrarlanmamalı.");
  return { baseId, balance, future: dataset, initialMm: day.depletionMm,
    irrigation: future.irrigation, issuedOn: day.date };
}

export function computeForecast(manifest: ForecastManifest) {
  const byDay = new Map(manifest.future.rows.map(row => {
    const parsed = weather.parse(row);
    return [parsed.date, parsed] as const;
  }));
  const persisted = manifest.initialMm;
  const horizons = [1, 3, 7].map(horizon => {
    const date = addDays(manifest.issuedOn, horizon);
    const dates = Array.from({ length: horizon }, (_, index) => addDays(manifest.issuedOn, index + 1));
    if (dates.some(day => !byDay.has(day)))
      return { horizon, date, modelMm: null, persistenceMm: null, state: "needs_data" };
    const days = dates.map(day => {
      const row = byDay.get(day)!;
      return { date: day, et0Mm: row.et0_mm, effectiveRainMm: row.effective_rain_mm,
        cropCoefficient: row.crop_coefficient, meanTempC: row.temperature_c };
    });
    const base = manifest.balance.input;
    const schedule = manifest.irrigation.filter(entry => dates.includes(entry.date));
    const output = runWaterBalance({ ...base, days,
      soil: { ...base.soil, initialDepletionMm: persisted },
      scenarios: [{ name: "forecast", irrigation: schedule }] }, manifest.balance.areaM2);
    return { horizon, date, modelMm: output.scenarios[0]!.finalDepletionMm, persistenceMm: persisted, state: "uncertain" };
  });
  return { kind: "forecast", issuedOn: manifest.issuedOn, baseId: manifest.baseId, horizons,
    fieldApproval: "unvalidated_pilot", predictionInterval: null };
}
export function evaluateBalance(manifest: BalanceManifest, result: BalanceResult, rows: Dataset["rows"], name: string) {
  const scenario = result.scenarios.find(item => item.name === name);
  if (!scenario) invalid("Değerlendirilecek senaryoyu seç.");
  const depthCm = manifest.input.soil.rootDepthM * 100;
  const byDate = new Map<string, z.infer<typeof moisture>[]>();
  for (const row of rows) {
    const reading = moisture.parse(row);
    const readings = byDate.get(reading.date) || [];
    readings.push(reading);
    byDate.set(reading.date, readings);
  }
  const excluded: { date: string; reason: string }[] = [];
  const pairs = scenario.days.flatMap(day => {
    const profile = byDate.get(day.date)?.sort((a, b) => a.top_cm - b.top_cm);
    if (!profile?.length) return [];
    let depth = 0, water = 0, complete = true;
    for (const layer of profile) {
      if (Math.abs(layer.top_cm - depth) > 1e-8 || layer.bottom_cm > depthCm + 1e-8) {
        complete = false;
        break;
      }
      depth = layer.bottom_cm;
      water += (layer.bottom_cm - layer.top_cm) * layer.moisture * 10;
    }
    if (!complete || Math.abs(depth - depthCm) > 1e-8) {
      excluded.push({ date: day.date, reason: "Kök bölgesi kesintisiz ölçülmemiş." });
      return [];
    }
    const observed = manifest.input.soil.fieldCapacity * depthCm * 10 - water;
    if (observed < -1e-6 || observed > result.capacityMm + 1e-6) {
      excluded.push({ date: day.date, reason: "Ölçüm kullanılan modelin toprak suyu aralığının dışında." });
      return [];
    }
    return [{ date: day.date, observedMm: observed, modelMm: day.depletionMm, errorMm: day.depletionMm - observed }];
  });
  return { kind: "evaluation", scenario: name, pairs, excluded, count: pairs.length,
    maeMm: pairs.length ? pairs.reduce((sum, point) => sum + Math.abs(point.errorMm), 0) / pairs.length : null,
    biasMm: pairs.length ? pairs.reduce((sum, point) => sum + point.errorMm, 0) / pairs.length : null,
    verification: pairs.length ? "needs_review" : "needs_data" };
}
