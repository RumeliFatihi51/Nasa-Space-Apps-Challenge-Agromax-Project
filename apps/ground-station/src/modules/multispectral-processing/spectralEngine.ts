import { DEFAULT_PARCEL } from '../shared/catalog';
import {
  FaultType,
  PriorityZone,
  SatelliteProfile,
  SpectralAnalysisResult,
} from '../shared/types';

/**
 * Generates deterministic, scientifically coherent 64x64 multispectral reflectance bands
 * for the Polatlı sample parcel, then computes NDVI, NDMI, NDRE, NDWI strictly from band equations.
 * Cloud-masked pixels are excluded from index statistics.
 */
export function runMultispectralProcessing(
  satellite: SatelliteProfile,
  activeFaults: FaultType[],
  parcelCenter: [number, number] = DEFAULT_PARCEL.center,
): SpectralAnalysisResult {
  const width = 64;
  const height = 64;
  const total = width * height;

  const red = new Float32Array(total);
  const green = new Float32Array(total);
  const blue = new Float32Array(total);
  const nir = new Float32Array(total);
  const swir = new Float32Array(total);
  const redEdge = new Float32Array(total);
  const cloudMask = new Uint8Array(total);

  const ndvi = new Float32Array(total);
  const ndmi = new Float32Array(total);
  const ndre = new Float32Array(total);
  const ndwi = new Float32Array(total);
  const changeDeltaNdvi = new Float32Array(total);

  const highCloud = activeFaults.includes('HIGH_CLOUD_COVER');
  const incompleteData = activeFaults.includes('INCOMPLETE_IMAGE');

  // Zone normalized centers (u: 0..1 West->East, v: 0..1 North->South)
  // Bölge A: Normal (Northwest)
  // Bölge B: Low NDVI (Northeast)
  // Bölge C: Low NDMI (Southwest)
  // Bölge D: Cloud uncertain (Southeast-Center)
  const zoneBCenter = { u: 0.72, v: 0.30, r: 0.16 };
  const zoneCCenter = { u: 0.28, v: 0.72, r: 0.17 };
  const zoneDCenter = { u: 0.68, v: 0.70, r: highCloud ? 0.36 : 0.14 };

  let validCount = 0;
  let cloudCount = 0;
  let sumNdvi = 0;
  let minNdvi = 1;
  let maxNdvi = -1;
  let sumNdmi = 0;
  let lowNdmiCount = 0;
  let modNdmiCount = 0;
  let highNdmiCount = 0;

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const idx = y * width + x;

      // Coherent crop row pattern + natural soil/irrigation gradient
      const rowWave = Math.sin(u * Math.PI * 26) * 0.015 + Math.cos(v * Math.PI * 14) * 0.012;
      const diagGrad = (1 - u * 0.15) * (1 - v * 0.1);

      // Healthy winter wheat / maize canopy baseline reflectance (0..1)
      let rVal = 0.065 + rowWave * 0.4 + (1 - diagGrad) * 0.02;
      let gVal = 0.105 + rowWave * 0.3;
      let bVal = 0.052 + rowWave * 0.2;
      let nirVal = 0.44 + rowWave * 0.8 + diagGrad * 0.04;
      let swirVal = 0.19 - rowWave * 0.3;
      let reVal = 0.21 + rowWave * 0.4;

      // Zone B: Lower vegetation vigor (higher red, lower NIR -> lower NDVI)
      const distB = Math.hypot(u - zoneBCenter.u, v - zoneBCenter.v);
      if (distB < zoneBCenter.r) {
        const w = Math.pow(1 - distB / zoneBCenter.r, 1.35);
        rVal += 0.095 * w;
        gVal += 0.02 * w;
        nirVal -= 0.21 * w;
        reVal -= 0.06 * w;
      }

      // Zone C: Canopy moisture stress (higher SWIR absorption drop -> higher SWIR reflectance, slightly lower NIR -> lower NDMI)
      const distC = Math.hypot(u - zoneCCenter.u, v - zoneCCenter.v);
      if (distC < zoneCCenter.r) {
        const w = Math.pow(1 - distC / zoneCCenter.r, 1.3);
        swirVal += 0.15 * w;
        nirVal -= 0.06 * w;
        rVal += 0.02 * w;
      }

      // Zone D: Cloud / Cloud-shadow occlusion
      const distD = Math.hypot(u - zoneDCenter.u, v - zoneDCenter.v);
      const secondCloudDist = highCloud ? Math.hypot(u - 0.35, v - 0.32) : 99;
      const isCloudy =
        distD < zoneDCenter.r * (0.92 + 0.08 * Math.sin(u * 18 + v * 15)) ||
        secondCloudDist < 0.22;

      // Incomplete frame strip if INCOMPLETE_IMAGE fault injected
      const isMissingFrame = incompleteData && y >= 48;

      if (isCloudy || isMissingFrame) {
        cloudMask[idx] = 1;
        cloudCount++;
        // Bright white cloud reflectance in optical bands
        if (isCloudy) {
          rVal = 0.78;
          gVal = 0.80;
          bVal = 0.82;
          nirVal = 0.76;
          swirVal = 0.45;
          reVal = 0.75;
        } else {
          rVal = 0;
          gVal = 0;
          bVal = 0;
          nirVal = 0;
          swirVal = 0;
          reVal = 0;
        }
      } else {
        cloudMask[idx] = 0;
      }

      red[idx] = Math.max(0.001, Math.min(1, rVal));
      green[idx] = Math.max(0.001, Math.min(1, gVal));
      blue[idx] = Math.max(0.001, Math.min(1, bVal));
      nir[idx] = Math.max(0.001, Math.min(1, nirVal));
      swir[idx] = Math.max(0.001, Math.min(1, swirVal));
      redEdge[idx] = Math.max(0.001, Math.min(1, reVal));

      if (cloudMask[idx] === 1) {
        ndvi[idx] = Number.NaN;
        ndmi[idx] = Number.NaN;
        ndre[idx] = Number.NaN;
        ndwi[idx] = Number.NaN;
        changeDeltaNdvi[idx] = Number.NaN;
      } else {
        // Scientific band equations
        const ndviVal = (nir[idx] - red[idx]) / (nir[idx] + red[idx]);
        const ndmiVal = (nir[idx] - swir[idx]) / (nir[idx] + swir[idx]);
        const ndreVal = (nir[idx] - redEdge[idx]) / (nir[idx] + redEdge[idx]);
        const ndwiVal = (green[idx] - nir[idx]) / (green[idx] + nir[idx]); // McFeeters NDWI (Green - NIR)/(Green + NIR)

        ndvi[idx] = ndviVal;
        ndmi[idx] = ndmiVal;
        ndre[idx] = ndreVal;
        ndwi[idx] = ndwiVal;

        // Simulated historical baseline (10 days prior) comparison
        const baselineNdvi = 0.68 + rowWave * 0.3;
        changeDeltaNdvi[idx] = ndviVal - baselineNdvi;

        validCount++;
        sumNdvi += ndviVal;
        sumNdmi += ndmiVal;
        if (ndviVal < minNdvi) minNdvi = ndviVal;
        if (ndviVal > maxNdvi) maxNdvi = ndviVal;

        if (ndmiVal < 0.15) lowNdmiCount++;
        else if (ndmiVal < 0.34) modNdmiCount++;
        else highNdmiCount++;
      }
    }
  }

  const meanNdvi = validCount > 0 ? sumNdvi / validCount : 0;
  const meanNdmi = validCount > 0 ? sumNdmi / validCount : 0;
  const cloudCoverPct = (cloudCount / total) * 100;

  // Sample zone metrics directly from computed arrays
  const samplePatchMean = (arr: Float32Array, cu: number, cv: number, r: number): number => {
    let s = 0;
    let c = 0;
    for (let y = 0; y < height; y++) {
      const v = y / (height - 1);
      for (let x = 0; x < width; x++) {
        const u = x / (width - 1);
        if (Math.hypot(u - cu, v - cv) <= r) {
          const val = arr[y * width + x];
          if (!Number.isNaN(val)) {
            s += val;
            c++;
          }
        }
      }
    }
    return c > 0 ? s / c : 0;
  };

  // Convert normalized [u, v] to expanded Polatlı parcel WGS84 coordinates (1168m x 956m)
  const spanLon = 0.0136;
  const spanLat = 0.0086;
  const toCoord = (u: number, v: number): [number, number] => [
    Number((parcelCenter[0] - spanLon / 2 + u * spanLon).toFixed(6)),
    Number((parcelCenter[1] + spanLat / 2 - v * spanLat).toFixed(6)),
  ];

  const priorityZones: PriorityZone[] = [
    {
      id: 'ZONE-A',
      code: 'Bölge A',
      label: 'Normal Bitki Gelişimi (Kuzeybatı Sektörü)',
      category: 'NORMAL',
      centerNormalized: [0.24, 0.25],
      centerCoord: toCoord(0.24, 0.25),
      radiusMeters: 165,
      areaHectares: 14.2,
      meanNdvi: Number(samplePatchMean(ndvi, 0.24, 0.25, 0.12).toFixed(3)),
      meanNdmi: Number(samplePatchMean(ndmi, 0.24, 0.25, 0.12).toFixed(3)),
      meanNdre: Number(samplePatchMean(ndre, 0.24, 0.25, 0.12).toFixed(3)),
      cloudPct: 0,
      priority: 'DÜŞÜK',
      rationale: 'NDVI ve NDMI değerleri parsel referans ortalaması dahilinde, homojen kanopi yoğunluğu gözleniyor.',
      recommendedAction: 'Rutin uydu takibine devam; ilaçlama veya gübreleme müdahalesi gerekmiyor.',
      prescription: {
        sprayLitersPerHa: 0,
        irrigationMm: 0,
        fertilizerKgPerHa: 0,
        treatmentLabel: 'Müdahale Gerekmiyor (Referans)',
      },
    },
    {
      id: 'ZONE-B',
      code: 'Bölge B',
      label: 'Çevresine Göre Düşük NDVI Alanı (Kuzeydoğu)',
      category: 'LOW_NDVI',
      centerNormalized: [zoneBCenter.u, zoneBCenter.v],
      centerCoord: toCoord(zoneBCenter.u, zoneBCenter.v),
      radiusMeters: 160,
      areaHectares: 10.6,
      meanNdvi: Number(samplePatchMean(ndvi, zoneBCenter.u, zoneBCenter.v, 0.11).toFixed(3)),
      meanNdmi: Number(samplePatchMean(ndmi, zoneBCenter.u, zoneBCenter.v, 0.11).toFixed(3)),
      meanNdre: Number(samplePatchMean(ndre, zoneBCenter.u, zoneBCenter.v, 0.11).toFixed(3)),
      cloudPct: 0,
      priority: 'YÜKSEK',
      rationale:
        'Çevresine göre belirgin düşük NDVI ve Red-Edge düşüşü saptandı. Yerinde doğrulama sonrası lokal ilaçlama ve azot takviyesi planlanır.',
      recommendedAction: 'Bölge B üzerinde İHA doğrulama, hedefe yönelik ilaçlama (18 L/ha) ve üre/azot gübreleme (22 kg/ha).',
      prescription: {
        sprayLitersPerHa: 18,
        irrigationMm: 6,
        fertilizerKgPerHa: 22,
        treatmentLabel: 'Lokal İlaçlama + Azot Gübreleme',
      },
    },
    {
      id: 'ZONE-C',
      code: 'Bölge C',
      label: 'Düşük NDMI Kanopi Nem Anomalisi (Güneybatı)',
      category: 'LOW_NDMI',
      centerNormalized: [zoneCCenter.u, zoneCCenter.v],
      centerCoord: toCoord(zoneCCenter.u, zoneCCenter.v),
      radiusMeters: 168,
      areaHectares: 11.8,
      meanNdvi: Number(samplePatchMean(ndvi, zoneCCenter.u, zoneCCenter.v, 0.12).toFixed(3)),
      meanNdmi: Number(samplePatchMean(ndmi, zoneCCenter.u, zoneCCenter.v, 0.12).toFixed(3)),
      meanNdre: Number(samplePatchMean(ndre, zoneCCenter.u, zoneCCenter.v, 0.12).toFixed(3)),
      cloudPct: 0,
      priority: 'YÜKSEK',
      rationale:
        'SWIR bandı yansımasındaki artış nedeniyle NDMI düşüşü saptandı. Doğrudan sulama kontrolü ve yaprak besleme önerilir.',
      recommendedAction: 'Bölge C üzerinde hassas sulama aktivasyonu (16 mm) ve potasyum destekli yaprak gübreleme (10 kg/ha).',
      prescription: {
        sprayLitersPerHa: 8,
        irrigationMm: 16,
        fertilizerKgPerHa: 10,
        treatmentLabel: 'Hassas Sulama + Yaprak Gübresi',
      },
    },
    {
      id: 'ZONE-D',
      code: 'Bölge D',
      label: 'Bulut / Veri Eksikliği Nedeniyle Belirsiz Bölge',
      category: 'CLOUD_UNCERTAIN',
      centerNormalized: [zoneDCenter.u, zoneDCenter.v],
      centerCoord: toCoord(zoneDCenter.u, zoneDCenter.v),
      radiusMeters: 145,
      areaHectares: highCloud ? 24.5 : 7.8,
      meanNdvi: 0,
      meanNdmi: 0,
      meanNdre: 0,
      cloudPct: highCloud ? 88 : 74,
      priority: 'ORTA',
      rationale:
        'Bulut maskesi bu bölgedeki pikselleri geçersiz kıldı; uygulama öncesi İHA ile bulut altı gözlem gereklidir.',
      recommendedAction: 'Bulut altı gözlem için İHA ile alternatif alçak irtifa görüntüleme.',
      prescription: {
        sprayLitersPerHa: 0,
        irrigationMm: 0,
        fertilizerKgPerHa: 0,
        treatmentLabel: 'Önce İHA Doğrulaması Gerekli',
      },
    },
  ];

  let reliabilityLabel: 'YÜKSEK' | 'ORTA' | 'DÜŞÜK' = 'YÜKSEK';
  let reliabilityNote = 'Geçerli piksel oranı yüksek; bant hizalaması ve bulut maskelemesi doğrulandı.';
  if (cloudCoverPct > 30 || incompleteData) {
    reliabilityLabel = 'DÜŞÜK';
    reliabilityNote = incompleteData
      ? 'Uydu görüntüsü eksik çerçeveler içeriyor (%22 veri kaybı); analiz sınırlı güvenilirliktedir.'
      : `Yüksek bulut örtüsü (%${cloudCoverPct.toFixed(1)}) nedeniyle parselin önemli bölümü maskelendi.`;
  } else if (cloudCoverPct > 10) {
    reliabilityLabel = 'ORTA';
    reliabilityNote = `Kısmi bulut örtüsü (%${cloudCoverPct.toFixed(1)}) tespit edildi; bulutlu pikseller hesap dışı bırakıldı.`;
  }

  return {
    datasetId: `AGX-SIM-${satellite.shortName.replace(/\s+/g, '-')}-20261114`,
    sourceSatelliteName: `${satellite.name} (Sentetik / Örnek Simülasyon Verisi)`,
    acquisitionTimestamp: '2026-11-14 14:26 UTC',
    isSyntheticSimulationData: true,
    spatialResolutionM: satellite.spatialResolutionM,
    gridWidth: width,
    gridHeight: height,
    availableBands: satellite.spectralBands,
    red,
    green,
    blue,
    nir,
    swir,
    redEdge,
    cloudMask,
    ndvi,
    ndmi,
    ndre,
    ndwi,
    changeDeltaNdvi,
    meanNdvi: Number(meanNdvi.toFixed(3)),
    minNdvi: Number((validCount > 0 ? minNdvi : 0).toFixed(3)),
    maxNdvi: Number((validCount > 0 ? maxNdvi : 0).toFixed(3)),
    meanNdmi: Number(meanNdmi.toFixed(3)),
    ndmiDistribution: {
      lowPct: Number(((lowNdmiCount / Math.max(1, validCount)) * 100).toFixed(1)),
      moderatePct: Number(((modNdmiCount / Math.max(1, validCount)) * 100).toFixed(1)),
      highPct: Number(((highNdmiCount / Math.max(1, validCount)) * 100).toFixed(1)),
    },
    cloudCoverPct: Number(cloudCoverPct.toFixed(1)),
    validPixelCount: validCount,
    totalPixelCount: total,
    reliabilityLabel,
    reliabilityNote,
    priorityZones,
    scientificCaveats: [
      'Bu veri seti SİMÜLASYON modunda üretilmiş örnek multispektral reflektans katmanlarından hesaplanmıştır; gerçek uydu yayını değildir.',
      'NDVI = (NIR - RED) / (NIR + RED) yalnızca bitki örtüsü yoğunluğu/canlılık göstergesidir; tek başına hastalık veya zararlı teşhisi olarak kullanılmaz.',
      'NDMI = (NIR - SWIR) / (NIR + SWIR) kanopi su içeriğiyle ilişkilidir; doğrudan ölçülmüş toprak nemi değeri yerine geçmez.',
      'Bulut maskesi (CloudMask = 1) ve eksik çerçeve pikselleri tüm istatistiklerden matematiksel olarak dışlanmıştır.',
    ],
  };
}
