import {
  DroneMissionPlan,
  DroneTelemetry,
  GisParcel,
  GroundStationHardwareProfile,
  MissionReport,
  OperationMode,
  RfTelemetry,
  SatelliteProfile,
  SimEventLog,
  SpectralAnalysisResult,
} from '../shared/types';

export interface ReportBuilderInput {
  operationMode: OperationMode;
  satellite: SatelliteProfile;
  hardware: GroundStationHardwareProfile;
  rf: RfTelemetry;
  parcel: GisParcel;
  analysis: SpectralAnalysisResult | null;
  missionPlan: DroneMissionPlan | null;
  drone: DroneTelemetry;
  logs: SimEventLog[];
  processingDurationSec: number;
  appliedIrrigationM3?: number;
}

export function buildMissionReport(input: ReportBuilderInput): MissionReport {
  const {
    operationMode,
    satellite,
    hardware,
    rf,
    parcel,
    analysis,
    missionPlan,
    drone,
    logs,
    processingDurationSec,
    appliedIrrigationM3 = 0,
  } = input;

  const warnings: string[] = [];
  logs
    .filter((l) => l.level === 'WARNING' || l.level === 'ERROR')
    .slice(0, 8)
    .forEach((l) => warnings.push(`[${l.source}] ${l.message}`));

  let missionStatus: MissionReport['missionStatus'] = 'BEKLEMEDE';
  if (drone.flightMode === 'GOREV_TAMAMLANDI') {
    missionStatus = warnings.some((w) => w.includes('ACİL') || w.includes('kesildi'))
      ? 'KISMİ_TAMAMLANDI'
      : 'BAŞARILI';
  } else if (missionPlan && !missionPlan.isFeasible) {
    missionStatus = 'İPTAL_EDİLDİ';
  }

  const nextSteps: string[] = [];
  if (analysis) {
    nextSteps.push('Bölge B için toplanan yüksek çözünürlüklü İHA RGB/Multispektral karelerinin ortomozaik birleştirmesini inceleyin.');
    nextSteps.push('Bölge C (düşük NDMI) alanında sulama basıncı ve damla/yağmurlama hattı saha kontrolü planlayın.');
    if (analysis.cloudCoverPct > 5) {
      nextSteps.push('Bölge D üzerindeki bulut kaynaklı belirsizliği gidermek üzere İHA alt-bulut görüntülerini AgroMax katmanına işleyin.');
    }
  } else {
    nextSteps.push('Raporu tamamlamak için uydu veri alımını ve multispektral analizi çalıştırın.');
  }

  return {
    reportId: `RPT-AGX-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-01`,
    generatedAt: new Date().toLocaleString('tr-TR', { hour12: false }),
    scenarioName: 'AgroMax | Uydu Verisinden Otonom Tarla İncelemesine',
    operationMode,
    satelliteDataset: analysis
      ? `${analysis.datasetId} (${satellite.shortName}, ${satellite.spatialResolutionM} m)`
      : `${satellite.name} (Veri alımı bekleniyor)`,
    groundStationSummary: `${hardware.name} · Alınan: ${rf.receivedMb.toFixed(1)}/${rf.totalExpectedMb} MB · SNR: ${rf.snrDb.toFixed(1)} dB · Paket Kaybı: %${rf.packetLossPct.toFixed(2)}`,
    processingDurationSec: Number(processingDurationSec.toFixed(1)),
    analyzedAreaHectares: parcel.areaHectares,
    priorityZonesSummary: (analysis?.priorityZones ?? []).map((z) => ({
      code: z.code,
      category: z.label,
      rationale: z.rationale,
    })),
    missionRouteSummary: missionPlan
      ? `${missionPlan.name} · Planlanan: ${missionPlan.totalDistanceM} m · İrtifa: ${missionPlan.altitudeM} m`
      : 'Henüz görev planı oluşturulmadı.',
    actualFlightDistanceM: Math.round(drone.distanceFlownM),
    actualFlightDurationSec: Math.round(drone.flightElapsedSec),
    photosCollected: drone.photosCollected,
    appliedSprayLiters: drone.appliedSprayLiters,
    appliedFertilizerKg: drone.appliedFertilizerKg,
    appliedIrrigationM3: Number(appliedIrrigationM3.toFixed(1)),
    missionStatus,
    warnings,
    recommendedNextSteps: nextSteps,
  };
}
