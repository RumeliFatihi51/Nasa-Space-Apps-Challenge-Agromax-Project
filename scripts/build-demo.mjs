import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { indices } from "../shared/metrics.js";
import { demoRaster, demoProvider, demoMethod } from "../shared/demo-raster.js";
import { prepareField } from "../server/fields.js";
import { geometryHash } from "../server/analysis-jobs.js";
import { parseDraft } from "../shared/platform-contracts.js";
import { domainSchemas } from "../shared/contracts/commercial.ts";
import {
  balanceInput,
  runWaterBalance,
} from "../commercial/simulation/water-balance.ts";
const id = (label) =>
  createHash("sha256")
    .update("agromax-demo-v1:" + label)
    .digest("hex")
    .slice(0, 32);
const stamp = "2026-11-14T09:00:00.000Z";
const manifest = {
  version: 1,
  source: "Sentetik eğitim verisi",
  records: [],
  jobs: [],
  platform: [],
  domain: [],
  reports: [],
  claims: [],
};
for (let n = 0; n < 3; n++) {
  const fieldId = id("field" + n),
    analysisId = id("analysis" + n),
    lon = 27.21 + n * 0.31,
    lat = 41.02 + n * 0.07;
  const geometry = {
    type: "Polygon",
    coordinates: [
      [
        [lon, lat],
        [lon + 0.004, lat],
        [lon + 0.004, lat + 0.003],
        [lon, lat + 0.003],
        [lon, lat],
      ],
    ],
  };
  const field = {
    ...prepareField({
      name: [
        "Örnek · Tekirdağ Buğday",
        "Örnek · Edirne Kuzey",
        "Örnek · Kırklareli Ova",
      ][n],
      crop: "Kışlık buğday",
      location: ["Tekirdağ", "Edirne", "Kırklareli"][n],
      geometry,
      sowingDate: "2026-09-25",
      notes: manifest.source,
    }),
    version: 1,
    demo: true,
    demoVersion: 1,
    updatedAt: stamp,
  };
  const hash = geometryHash(geometry);
  manifest.records.push({
    id: fieldId,
    kind: "field",
    body: JSON.stringify(field),
  });
  const scenes = Array.from({ length: 8 }, (_, step) => ({
    id: "DEMO-SYNTHETIC-" + n + "-" + step,
    demoStep: step,
    properties: {
      datetime: new Date(Date.UTC(2026, 9, 3 + 5 * step, 9)).toISOString(),
      "eo:cloud_cover": 0,
    },
  }));
  const observations = scenes.map((scene) => {
    const stats = Object.fromEntries(
      indices.map((metric) => {
        const raster = demoRaster(geometry, scene.demoStep, metric.id),
          values = raster.values.filter(Number.isFinite);
        return [
          metric.id,
          {
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            coverage: 1,
            validPixels: values.length,
            totalPixels: values.length,
          },
        ];
      }),
    );
    return {
      from: scene.properties.datetime.slice(0, 10) + "T00:00:00.000Z",
      to: new Date(
        Date.parse(scene.properties.datetime.slice(0, 10)) + 86400000,
      ).toISOString(),
      stats,
    };
  });
  const period = (rows, metric) => ({
    mean:
      rows.reduce((sum, row) => sum + row.stats[metric].mean, 0) / rows.length,
    meanCoverage: 1,
    observations: rows.length,
    min: Math.min(...rows.map((row) => row.stats[metric].min)),
    max: Math.max(...rows.map((row) => row.stats[metric].max)),
  });
  const comparison = Object.fromEntries(
    indices.map(({ id: metric }) => {
      const previous = period(observations.slice(0, 4), metric),
        current = period(observations.slice(4), metric);
      return [
        metric,
        { previous, current, delta: current.mean - previous.mean },
      ];
    }),
  );
  const analysis = {
    demo: true,
    source: manifest.source,
    provider: demoProvider,
    method: demoMethod,
    mask: "Örnek · sentetik geçerli parsel pikselleri",
    aggregation: "Örnek · parsel içi piksel ortalaması",
    resolution: 20,
    minimumCoverage: 0.7,
    fetchedAt: stamp,
    historyId: analysisId,
    range: {
      from: "2026-10-01",
      split: "2026-10-23",
      to: "2026-11-10",
      previousLabel: "Demo önceki dönem",
      currentLabel: "Demo sonraki dönem",
    },
    comparison,
    observations,
    scenes,
    report: {
      interpretation: {
        overview:
          "DEMO: Sentetik örnekte kuzeybatı bölümündeki indeksler zamanla azalır. Bu bir hastalık, gübre eksikliği veya sulama teşhisi değildir; inceleme akışını göstermek içindir.",
        findings: [],
        source: "Örnek veri değerlendirmesi",
      },
    },
  };
  for (const metric of ["NDVI", "NDMI", "NDWI", "NDRE"])
    manifest.claims.push({
      id: id(`${n}-claim-${metric}`),
      fieldId,
      analysisId,
      geometryVersion: hash,
      metric,
      evidence: {
        kind: "simulated_change",
        verification: "simulation",
        claimMethod: "s2-period-change-v1",
        measurementMethod: demoMethod,
        source: manifest.source,
        provider: demoProvider,
        observedAt: stamp,
        range: {
          from: "2026-10-01T00:00:00Z",
          split: "2026-10-23T00:00:00Z",
          to: "2026-11-10T00:00:00Z",
        },
        previous: comparison[metric].previous,
        current: comparison[metric].current,
        delta: comparison[metric].delta,
        warnings: [],
      },
    });
  manifest.jobs.push({
    id: analysisId,
    fieldId,
    hash,
    field,
    snapshot: JSON.stringify({ field: { id: fieldId, ...field } }),
    analysis,
  });
  for (let j = 0; j < 4; j++)
    manifest.records.push({
      id: id(`task-${n}-${j}`),
      kind: "task",
      body: JSON.stringify({
        fieldId,
        name: [
          "Örnek · Kuzeybatı saha kontrolü",
          "Örnek · Toprak nemi kaydı",
          "Örnek · Sulama planını incele",
          "Örnek · Sezon değerlendirmesi",
        ][j],
        date: "2026-11-" + (15 + j),
        priority: j === 0 ? "high" : "normal",
        done: j === 3,
        notes: manifest.source,
        demo: true,
      }),
    });
  const platform = (kind, name, payload) => {
    const recordId = id(`${n}-${kind}-${name}`);
    const valid = parseDraft({
      fieldId,
      kind,
      name: "Örnek · " + name,
      payload,
    });
    manifest.platform.push({
      id: recordId,
      fieldId,
      kind,
      name: valid.name,
      payload: valid.payload,
      fieldSnapshot: { id: fieldId, ...field, geometryHash: hash },
    });
    return recordId;
  };
  for (let plan = 0; plan < 3; plan++)
    platform(
      "scenario",
      ["Referans maliyet", "Erken sulama", "Su tasarrufu"][plan],
      {
        waterM3: [1800, 2400, 1500][plan],
        waterUnitCost: 2.5,
        fertilizerKg: 400,
        fertilizerUnitCost: 24,
        laborHours: 12,
        laborHourlyCost: 220,
        otherCost: 1500,
        energyKwh: 250,
        energyUnitCost: 4,
        currency: "TRY",
        assumptions: manifest.source,
      },
    );
  platform("prescription", "İnceleme sonrası sulama taslağı", {
    application: "irrigation",
    rate: 120,
    unit: "m3/ha",
    scope: "Demoda kayıt ve rota akışı; uzman önerisi değildir",
    notes: manifest.source,
    zones: [
      {
        name: "Örnek · Batı bölgesi",
        rate: 120,
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [lon + 0.0003, lat + 0.0003],
              [lon + 0.0017, lat + 0.0003],
              [lon + 0.0017, lat + 0.0027],
              [lon + 0.0003, lat + 0.0027],
              [lon + 0.0003, lat + 0.0003],
            ],
          ],
        },
      },
    ],
  });
  platform("drone", "Pixhawk hazırlık profili", {
    vendor: "generic",
    model: "Pixhawk 2.4.8 · firmware doğrulanmadı",
    notes: "Örnek cihaz profili",
  });
  platform("investigation", "Kuzeybatı incelemesi", {
    priority: "high",
    region: "Kuzeybatı",
    requestedData: "Nem ölçümü, saha fotoğrafı ve kontrol notu",
    notes: manifest.source,
    analysisId,
    coordinate: [lon + 0.0005, lat + 0.002],
    state: "in_progress",
  });
  for (let j = 0; j < 4; j++)
    platform("observation", "Saha günlüğü " + (j + 1), {
      category: ["crop", "soil", "water", "other"][j],
      observedAt: "2026-11-" + (10 + j),
      notes: manifest.source + " · Örnek kayıt " + (j + 1),
      coordinate: [lon + 0.001 + j * 0.0004, lat + 0.001],
    });
  platform("flight_plan", "Tarama uçuşu", {
    geometryHash: hash,
    firmware: "px4",
    vehicle: "quad",
    firmwareVersion: "",
    home: [lon + 0.0003, lat + 0.0003],
    homeAMSL: 120,
    altitude: 35,
    speed: 5,
    endurance: 30,
    swath: 30,
    overlap: 20,
    bearing: 0,
    target: { kind: "field" },
  });
  platform("laboratory_run", "Temsili operasyon", {
    geometryHash: hash,
    simulation: true,
    elapsedSeconds: 180,
    metric: "NDVI",
    missionName: "Örnek tarama",
    waypointCount: 12,
    distanceM: 600,
    batteryPercent: 82,
    progressPercent: 40,
  });
  const domain = (kind, data) =>
    manifest.domain.push({
      id: id(`${n}-domain-${kind}`),
      fieldId,
      kind,
      data: domainSchemas[kind].parse(data),
    });
  const base = { fieldId, date: "2026-11-10", notes: manifest.source };
  domain("season", {
    fieldId,
    name: "Örnek · 2026–2027 buğday",
    crop: "wheat",
    cropName: "Kışlık buğday",
    sowingDate: field.sowingDate,
    harvestDate: "2027-06-25",
    countryCode: "TR",
  });
  domain("irrigation", {
    ...base,
    state: "applied",
    volumeM3: 1800,
    method: "sprinkler",
    durationHours: 6,
  });
  domain("nutrition", {
    ...base,
    state: "planned",
    product: "Örnek · Taban gübresi",
    amountKg: 400,
    nitrogenPercent: 15,
    phosphorusPercent: 15,
    potassiumPercent: 15,
  });
  domain("protection", {
    ...base,
    state: "observation",
    observation: "Örnek · Kenar bölgesinde saha kontrolü planlandı; teşhis yok",
  });
  domain("soil", {
    ...base,
    laboratory: "Örnek · Sentetik laboratuvar",
    reportReference: "DEMO-SOIL-" + n,
    method: "Eğitim örneği, ölçülmüş değildir",
    depthCm: 30,
    measurements: [
      { parameter: "pH", value: 7.1, unit: "pH" },
      { parameter: "Organik madde", value: 2.3, unit: "%" },
      { parameter: "Tarla kapasitesi", value: 30, unit: "% hacim" },
    ],
  });
  domain("evaluation", {
    ...base,
    analysisId,
    state: "needs_field_observation",
    observation: "Örnek · İndeks değişimi saha ölçümüyle karşılaştırılmalı",
  });
  const costCategories = [
    "seed",
    "irrigation",
    "fertilizer",
    "protection",
    "labor",
    "equipment",
    "other",
  ];
  for (const [i, category] of costCategories.entries())
    manifest.domain.push({
      id: id(`${n}-cost-${category}`),
      fieldId,
      kind: "cost",
      data: domainSchemas.cost.parse({
        ...base,
        category,
        title: "Örnek · " + category,
        amountMinor: [180000, 450000, 960000, 80000, 264000, 150000, 150000][i],
        currency: "TRY",
      }),
    });
  const days = Array.from({ length: 31 }, (_, day) => ({
    date: new Date(Date.UTC(2026, 9, 15 + day)).toISOString().slice(0, 10),
    et0Mm: 2 + Math.sin(day * 0.4) * 0.4,
    effectiveRainMm: [5, 12, 24].includes(day) ? 8 : 0,
    cropCoefficient: 0.8,
    meanTempC: 13 + Math.sin(day * 0.3) * 3,
  }));
  const input = balanceInput.parse({
    scope: "trakya-winter-wheat",
    weatherSource: manifest.source,
    soilSource: manifest.source,
    sowingDate: field.sowingDate,
    days,
    soil: {
      fieldCapacity: 0.3,
      wiltingPoint: 0.15,
      rootDepthM: 1,
      initialDepletionMm: 100,
      depletionFraction: 0.5,
    },
    systemEfficiency: 0.8,
    baseTemperatureC: 0,
    scenarios: [
      {
        name: "Örnek · Referans A",
        irrigation: [{ date: days[14].date, grossMm: 24 }],
      },
      {
        name: "Örnek · Erken sulama B",
        irrigation: [
          { date: days[4].date, grossMm: 24 },
          { date: days[18].date, grossMm: 18 },
        ],
      },
    ],
    waterCostMinorPerM3: 250,
    maxVolumeM3: 10000,
    maxCostMinor: 5000000,
  });
  manifest.domain.push({
    id: id(`${n}-water-balance`),
    fieldId,
    kind: "water_balance",
    data: {
      demo: true,
      geometryVersion: hash,
      areaM2: field.area * 1000,
      input,
      result: runWaterBalance(input, field.area * 1000),
    },
  });
  manifest.reports.push({
    id: id(`${n}-report`),
    fieldId,
    snapshot: {
      demo: true,
      schemaVersion: "report-v1",
      createdAt: stamp,
      organizationName: "Örnek · AgroMax eğitim işletmesi",
      locale: "tr",
      field: { id: fieldId, ...field },
      analysisId,
      geometryVersion: hash,
      analysis,
      records: [
        ...manifest.domain
          .filter((row) => row.fieldId === fieldId)
          .map((row) => ({ ...row, version: 1 })),
        ...manifest.platform
          .filter((row) => row.fieldId === fieldId)
          .map((row) => ({
            id: row.id,
            kind: row.kind,
            version: 1,
            data: { name: row.name, ...row.payload },
          })),
      ],
    },
  });
}
await mkdir("demo", { recursive: true });
await writeFile(
  "demo/agromax-demo-v1.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  "Demo manifest generated:",
  manifest.records.length,
  "records,",
  manifest.platform.length,
  "platform,",
  manifest.domain.length,
  "domain,",
  manifest.jobs.length,
  "analyses,",
  manifest.reports.length,
  "reports",
);
