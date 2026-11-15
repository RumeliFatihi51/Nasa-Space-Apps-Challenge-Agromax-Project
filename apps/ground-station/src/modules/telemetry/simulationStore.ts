import { create } from 'zustand';
import { createInitialDroneTelemetry, stepDronePhysics } from '../drone-simulation/dronePhysics';
import { computeParcelMetrics } from '../gis/gisUtils';
import { generateDroneMissionPlan } from '../mission-planning/planner';
import { runMultispectralProcessing } from '../multispectral-processing/spectralEngine';
import { evaluateRfLink } from '../rf-communication/rfEngine';
import { computeSatellitePassState, shortestAngleDelta } from '../satellite/orbitMath';
import {
  DEFAULT_NO_FLY_ZONES,
  DEFAULT_PARCEL,
  GROUND_STATION_HARDWARE,
  SATELLITE_PROFILES,
} from '../shared/catalog';
import {
  AcquisitionStage,
  AgronomicOperationType,
  AntennaControlMode,
  CameraPresetId,
  DroneMissionPlan,
  DroneProfileId,
  DroneTelemetry,
  FaultType,
  GisParcel,
  GroundStationHardwareId,
  LightingMode,
  MapLayerId,
  MapLayerState,
  MissionType,
  NavSectionId,
  NoFlyZone,
  OperationMode,
  OrbitTelemetry,
  PipelineNodeState,
  RfTelemetry,
  SatelliteId,
  ScenarioStageNumber,
  SimEventLog,
  SoilSensorReading,
  SpectralAnalysisResult,
  SpectralIndexType,
  StageBaseMode,
} from '../shared/types';

export interface TelemetryHistoryPoint {
  tSec: number;
  snrDb: number;
  elevationDeg: number;
  dataRateMbps: number;
  batteryPct: number;
}

const DEFAULT_LAYERS: MapLayerState[] = [
  { id: 'RGB', label: 'Doğal Renk (RGB)', visible: true, opacity: 1.0, legendText: 'Gerçek Renk (B4-B3-B2)', dateLabel: '2026-11-14', sourceLabel: 'Simülasyon Uydu' },
  { id: 'NDVI', label: 'NDVI (Bitki Örtüsü)', visible: true, opacity: 0.78, legendText: '-0.2 (Çıplak) → +0.85 (Yoğun)', dateLabel: '2026-11-14', sourceLabel: 'AgroMax Spektral' },
  { id: 'NDMI', label: 'NDMI (Kanopi Nem)', visible: false, opacity: 0.75, legendText: '-0.4 (Stres) → +0.6 (Nemli)', dateLabel: '2026-11-14', sourceLabel: 'AgroMax Spektral' },
  { id: 'NDRE', label: 'NDRE (Red-Edge)', visible: false, opacity: 0.75, legendText: '0.0 → +0.75 Klorofil', dateLabel: '2026-11-14', sourceLabel: 'AgroMax Spektral' },
  { id: 'CLOUD_MASK', label: 'Bulut Maskesi', visible: true, opacity: 0.65, legendText: 'Maskelenmiş Geçersiz Pikseller', dateLabel: '2026-11-14', sourceLabel: 'QA60 Maske' },
  { id: 'PRIORITY_ZONES', label: 'Analiz Öncelik Bölgeleri', visible: true, opacity: 1.0, legendText: 'Bölge A / B / C / D', dateLabel: '2026-11-14', sourceLabel: 'AgroMax Karar' },
  { id: 'MISSION_ROUTE', label: 'Drone Görev Rotası', visible: true, opacity: 0.95, legendText: 'Planlı Waypoint Hattı', dateLabel: 'Canlı', sourceLabel: 'Görev Planlayıcı' },
  { id: 'ACTUAL_TRACK', label: 'Gerçekleşen Uçuş İzi', visible: true, opacity: 1.0, legendText: 'İHA Telemetri İzi', dateLabel: 'Canlı', sourceLabel: 'İHA RTK-GPS' },
  { id: 'PHOTO_POINTS', label: 'Fotoğraf Çekim Noktaları', visible: true, opacity: 1.0, legendText: 'Tetiklenen Görüntüler', dateLabel: 'Canlı', sourceLabel: 'İHA Gimbal' },
];

const INITIAL_SAT_ID: SatelliteId = 'EUMETCAST_DATA';
const INITIAL_HW_ID: GroundStationHardwareId = 'DISH_80CM_KU';

function nowTimeStr(): string {
  return new Date().toLocaleTimeString('tr-TR', { hour12: false });
}

export interface SimulationStore {
  // Navigation & Viewports
  activeNav: NavSectionId;
  stageBaseMode: StageBaseMode;
  cameraPreset: CameraPresetId;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;

  // Operation Mode & Master Clock
  operationMode: OperationMode;
  isRunning: boolean;
  isPaused: boolean;
  autoRun: boolean;
  simSpeed: 0.5 | 1 | 2 | 5 | 10;
  simTimeSec: number;
  scenarioStage: ScenarioStageNumber;
  isOffline: boolean;

  // Satellite & Orbit
  selectedSatelliteId: SatelliteId;
  passPhase: number; // 0..1
  orbit: OrbitTelemetry;

  // Ground Station & RF
  hardwareId: GroundStationHardwareId;
  antennaMode: AntennaControlMode;
  antennaAzDeg: number;
  antennaElDeg: number;
  manualTargetAzDeg: number;
  manualTargetElDeg: number;
  acquisitionStage: AcquisitionStage;
  stageTimerSec: number;
  rf: RfTelemetry;
  localServerConnected: boolean;

  // Multispectral & GIS
  activeSpectralIndex: SpectralIndexType;
  spectralAnalysis: SpectralAnalysisResult | null;
  processingDurationSec: number;
  parcel: GisParcel;
  noFlyZones: NoFlyZone[];
  layers: MapLayerState[];

  // Drone & Mission & Agronomic Operations
  selectedDroneProfileId: DroneProfileId;
  selectedMissionType: MissionType;
  agronomicOp: AgronomicOperationType;
  irrigationActive: boolean;
  appliedIrrigationM3: number;
  lightingMode: LightingMode;
  windSpeedMs: number;
  windDirDeg: number;
  soilSensors: SoilSensorReading[];
  missionAltitudeM: number;
  missionOverlapPct: number;
  missionPlan: DroneMissionPlan | null;
  drone: DroneTelemetry;
  droneDataTransferred: boolean;
  operatorSafetyApproved: boolean;

  // Faults & Logs
  activeFaults: FaultType[];
  logs: SimEventLog[];
  telemetryHistory: TelemetryHistoryPoint[];

  // Actions
  setActiveNav: (nav: NavSectionId) => void;
  setStageBaseMode: (mode: StageBaseMode) => void;
  setCameraPreset: (preset: CameraPresetId) => void;
  setLightingMode: (mode: LightingMode) => void;
  setPanels: (patch: Partial<{ leftPanelOpen: boolean; rightPanelOpen: boolean; bottomPanelOpen: boolean }>) => void;
  setOperationMode: (mode: OperationMode) => void;
  setSimSpeed: (speed: 0.5 | 1 | 2 | 5 | 10) => void;
  setAutoRun: (auto: boolean) => void;
  setOfflineStatus: (offline: boolean) => void;

  selectSatellite: (id: SatelliteId) => void;
  selectHardware: (id: GroundStationHardwareId) => void;
  setAntennaMode: (mode: AntennaControlMode) => void;
  setManualAntennaAngles: (azDeg: number, elDeg: number) => void;

  setActiveSpectralIndex: (idx: SpectralIndexType) => void;
  toggleMapLayer: (id: MapLayerId) => void;
  setMapLayerOpacity: (id: MapLayerId, opacity: number) => void;
  updateParcelPolygon: (coords: [number, number][], name?: string) => void;
  importParcel: (parcel: GisParcel) => void;

  setDroneConfig: (patch: Partial<{ selectedDroneProfileId: DroneProfileId; selectedMissionType: MissionType; missionAltitudeM: number; missionOverlapPct: number }>) => void;
  setAgronomicOp: (op: AgronomicOperationType) => void;
  toggleIrrigation: () => void;
  buildMissionPlanNow: () => void;
  setOperatorSafetyApproved: (approved: boolean) => void;

  // Master Simulation Controls
  startSimulation: () => void;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  resetSimulation: () => void;
  advanceToNextStage: () => void;
  runSpectralAnalysisNow: () => boolean;
  startDroneFlightNow: () => boolean;
  toggleFault: (fault: FaultType) => void;
  clearAllFaults: () => void;
  addLog: (level: SimEventLog['level'], source: string, message: string) => void;

  // Called by 60fps loop
  tickSimulation: (realDtSec: number) => void;
}

const initialOrbit = computeSatellitePassState(SATELLITE_PROFILES[INITIAL_SAT_ID], 0.16, false);
const initialRf = evaluateRfLink({
  satellite: SATELLITE_PROFILES[INITIAL_SAT_ID],
  hardware: GROUND_STATION_HARDWARE[INITIAL_HW_ID],
  orbit: initialOrbit,
  antennaAzDeg: 185,
  antennaElDeg: 15,
  activeFaults: [],
  prevReceivedMb: 0,
  totalExpectedMb: 480,
  dtSec: 0,
  isReceivingStage: false,
});

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  activeNav: 'OPERASYON_MERKEZI',
  stageBaseMode: 'THREE_3D',
  cameraPreset: 'GROUND_STATION_CLOSE',
  leftPanelOpen: true,
  rightPanelOpen: true,
  bottomPanelOpen: false,

  operationMode: 'SIMULATION',
  isRunning: false,
  isPaused: false,
  autoRun: true,
  simSpeed: 1,
  simTimeSec: 0,
  scenarioStage: 1,
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,

  selectedSatelliteId: INITIAL_SAT_ID,
  passPhase: 0.16,
  orbit: initialOrbit,

  hardwareId: INITIAL_HW_ID,
  antennaMode: 'AUTO',
  antennaAzDeg: 185,
  antennaElDeg: 15,
  manualTargetAzDeg: 185,
  manualTargetElDeg: 15,
  acquisitionStage: 'IDLE',
  stageTimerSec: 0,
  rf: initialRf,
  localServerConnected: true,

  activeSpectralIndex: 'NDVI',
  spectralAnalysis: null,
  processingDurationSec: 0,
  parcel: DEFAULT_PARCEL,
  noFlyZones: DEFAULT_NO_FLY_ZONES,
  layers: DEFAULT_LAYERS,

  selectedDroneProfileId: 'MULTISPECTRAL_SCOUT',
  selectedMissionType: 'TARGET_INSPECTION',
  agronomicOp: 'INSPECTION',
  irrigationActive: false,
  appliedIrrigationM3: 0,
  lightingMode: 'NOON',
  windSpeedMs: 3.8,
  windDirDeg: 295,
  soilSensors: [
    { id: 'IOT-A1', zoneCode: 'Bölge A', localX: -300, localZ: -240, soilMoisturePct: 31.4, nitrogenPpm: 46, soilTempC: 18.2 },
    { id: 'IOT-B1', zoneCode: 'Bölge B', localX: 256, localZ: -191, soilMoisturePct: 26.8, nitrogenPpm: 21, soilTempC: 19.6 },
    { id: 'IOT-C1', zoneCode: 'Bölge C', localX: -256, localZ: 210, soilMoisturePct: 16.2, nitrogenPpm: 34, soilTempC: 21.1 },
  ],
  missionAltitudeM: 55,
  missionOverlapPct: 75,
  missionPlan: null,
  drone: createInitialDroneTelemetry(DEFAULT_PARCEL),
  droneDataTransferred: false,
  operatorSafetyApproved: true,

  activeFaults: [],
  logs: [
    {
      id: 'log-init-1',
      timestamp: nowTimeStr(),
      simTimeSec: 0,
      level: 'INFO',
      source: 'SİSTEM',
      message: 'AgroMax Yer İstasyonu ve Otonom İHA Kontrol Merkezi SİMÜLASYON modunda başlatıldı.',
    },
    {
      id: 'log-init-2',
      timestamp: nowTimeStr(),
      simTimeSec: 0,
      level: 'INFO',
      source: 'DONANIM',
      message: 'Başlangıç donanımı: 80 cm Ku-Band Parabolik Anten. Gerçek donanım bağlantısı: BAĞLI DEĞİL.',
    },
  ],
  telemetryHistory: [
    { tSec: 0, snrDb: initialRf.snrDb, elevationDeg: initialOrbit.elevationDeg, dataRateMbps: 0, batteryPct: 100 },
  ],

  setActiveNav: (nav) => {
    set({ activeNav: nav });
    // Smoothly align stage mode & camera preset to user's selected functional domain
    if (nav === 'UYDU_YORUNGE') set({ stageBaseMode: 'THREE_3D', cameraPreset: 'EARTH_VIEW' });
    else if (nav === 'YER_ISTASYONU') set({ stageBaseMode: 'THREE_3D', cameraPreset: 'GROUND_STATION_CLOSE' });
    else if (nav === 'VERI_ALIMI') set({ cameraPreset: 'ANTENNA_MECHANICAL' });
    else if (nav === 'DRONE_GOREV_PLANLAMA') set({ cameraPreset: 'FIELD_MAP_3D' });
    else if (nav === 'CANLI_OPERASYON') set({ cameraPreset: 'DRONE_CHASE' });
  },

  setStageBaseMode: (mode) => set({ stageBaseMode: mode }),
  setCameraPreset: (preset) => set({ stageBaseMode: 'THREE_3D', cameraPreset: preset }),
  setLightingMode: (mode) => set({ lightingMode: mode }),
  setPanels: (patch) => set((s) => ({ ...s, ...patch })),

  setOperationMode: (mode) => {
    const s = get();
    if (mode === 'REAL_DATA') {
      s.addLog(
        'WARNING',
        'MOD',
        'GERÇEK VERİ moduna geçildi. Fiziksel SDR/ACU/MAVLink donanımı algılanmadı (Durum: BAĞLI DEĞİL).',
      );
      set({
        operationMode: mode,
        isRunning: false,
        isPaused: false,
        acquisitionStage: 'IDLE',
        localServerConnected: false,
      });
    } else {
      s.addLog('INFO', 'MOD', 'SİMÜLASYON moduna dönüldü. Yerel simülasyon motoru hazır.');
      set({
        operationMode: mode,
        localServerConnected: !s.activeFaults.includes('SERVER_DISCONNECT'),
      });
    }
  },

  setSimSpeed: (speed) => set({ simSpeed: speed }),
  setAutoRun: (auto) => set({ autoRun: auto }),
  setOfflineStatus: (offline) => set({ isOffline: offline }),

  selectSatellite: (id) => {
    const s = get();
    const sat = SATELLITE_PROFILES[id];
    const hw = GROUND_STATION_HARDWARE[s.hardwareId];
    const compatible = hw.supportedBands.includes(sat.band);
    const orbit = computeSatellitePassState(sat, s.passPhase, s.activeFaults.includes('LOS_LOSS'));
    const rf = evaluateRfLink({
      satellite: sat,
      hardware: hw,
      orbit,
      antennaAzDeg: s.antennaAzDeg,
      antennaElDeg: s.antennaElDeg,
      activeFaults: s.activeFaults,
      prevReceivedMb: 0,
      totalExpectedMb: 480,
      dtSec: 0,
      isReceivingStage: false,
    });

    set({
      selectedSatelliteId: id,
      orbit,
      rf,
      acquisitionStage: 'IDLE',
      spectralAnalysis: null,
      missionPlan: null,
      droneDataTransferred: false,
      scenarioStage: 1,
    });

    if (!compatible) {
      s.addLog(
        'WARNING',
        'UYDU/RF',
        `${sat.shortName} seçildi (${sat.band === 'X_BAND' ? 'X-Band' : 'Ku-Band'}). Mevcut "${hw.name}" ile doğrudan alım UYUMLU DEĞİL! Yer İstasyonu panelinden 2.4 m X-Band donanımına geçin.`,
      );
    } else {
      s.addLog('INFO', 'UYDU', `Hedef uydu güncellendi: ${sat.name} (${sat.frequencyGHz} GHz).`);
    }
  },

  selectHardware: (id) => {
    const s = get();
    const hw = GROUND_STATION_HARDWARE[id];
    const sat = SATELLITE_PROFILES[s.selectedSatelliteId];
    const rf = evaluateRfLink({
      satellite: sat,
      hardware: hw,
      orbit: s.orbit,
      antennaAzDeg: s.antennaAzDeg,
      antennaElDeg: s.antennaElDeg,
      activeFaults: s.activeFaults,
      prevReceivedMb: s.rf.receivedMb,
      totalExpectedMb: s.rf.totalExpectedMb,
      dtSec: 0,
      isReceivingStage: false,
    });
    set({ hardwareId: id, rf });
    s.addLog(
      rf.hardwareCompatible ? 'SUCCESS' : 'WARNING',
      'YER İSTASYONU',
      `Donanım profili değiştirildi: ${hw.name}. ${rf.hardwareCompatible ? 'Seçili uydu bandıyla uyumlu.' : rf.incompatibilityReason || ''}`,
    );
  },

  setAntennaMode: (mode) => {
    set({ antennaMode: mode });
    get().addLog('INFO', 'ANTEN', `Anten takip modu: ${mode === 'AUTO' ? 'OTOMATİK YÖRÜNGE TAKİBİ' : 'MANUEL KONTROL'}.`);
  },

  setManualAntennaAngles: (azDeg, elDeg) => {
    set({
      manualTargetAzDeg: ((azDeg % 360) + 360) % 360,
      manualTargetElDeg: Math.max(0, Math.min(90, elDeg)),
    });
  },

  setActiveSpectralIndex: (idx) => set({ activeSpectralIndex: idx }),

  toggleMapLayer: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    })),

  setMapLayerOpacity: (id, opacity) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, opacity } : l)),
    })),

  updateParcelPolygon: (coords, name) => {
    const metrics = computeParcelMetrics(coords);
    const updatedParcel: GisParcel = {
      id: `PARCEL-USER-${Date.now().toString().slice(-4)}`,
      name: name || 'Kullanıcı Çizimli Parsel',
      cropType: 'Özel Alan Analizi',
      coordinates: metrics.closedCoords,
      areaHectares: metrics.areaHectares,
      perimeterMeters: metrics.perimeterMeters,
      center: metrics.center,
      elevationM: 878,
    };
    set({
      parcel: updatedParcel,
      drone: createInitialDroneTelemetry(updatedParcel),
      missionPlan: null,
    });
    get().addLog('INFO', 'GIS', `Parsel güncellendi: ${updatedParcel.name} (${updatedParcel.areaHectares} ha).`);
  },

  importParcel: (parcel) => {
    set({
      parcel,
      drone: createInitialDroneTelemetry(parcel),
      missionPlan: null,
    });
    get().addLog('SUCCESS', 'GIS', `GeoJSON parsel içe aktarıldı: ${parcel.name} (${parcel.areaHectares} ha).`);
  },

  setDroneConfig: (patch) => set((s) => ({ ...s, ...patch })),

  setAgronomicOp: (op) => {
    const s = get();
    if (op === 'IRRIGATION') {
      set({ agronomicOp: op, irrigationActive: true });
      s.addLog('INFO', 'SULAMA', 'Bölge C (Düşük NDMI) için akıllı lineer/pivot sulama sistemi aktive edildi (16 mm/saat).');
    } else if (op === 'SPRAYING') {
      set({
        agronomicOp: op,
        selectedDroneProfileId: 'PRECISION_APPLICATOR',
        selectedMissionType: 'SIMULATED_VARIABLE_RATE',
        missionAltitudeM: 14,
      });
      s.addLog('INFO', 'İLAÇLAMA', 'Bölge B için AgroSpray-V16 değişken oranlı lokal ilaçlama modu (18 L/ha) seçildi.');
    } else if (op === 'FERTILIZATION') {
      set({
        agronomicOp: op,
        selectedDroneProfileId: 'PRECISION_APPLICATOR',
        selectedMissionType: 'SIMULATED_VARIABLE_RATE',
        missionAltitudeM: 15,
      });
      s.addLog('INFO', 'GÜBRELEME', 'Bölge B/C için değişken oranlı azot & yaprak gübreleme (22 kg/ha) modu seçildi.');
    } else {
      set({
        agronomicOp: op,
        selectedDroneProfileId: 'MULTISPECTRAL_SCOUT',
        selectedMissionType: 'TARGET_INSPECTION',
        missionAltitudeM: 55,
      });
      s.addLog('INFO', 'GÖZLEM', 'Standart multispektral doğrulama uçuşu modu seçildi.');
    }
  },

  toggleIrrigation: () => {
    const next = !get().irrigationActive;
    set({ irrigationActive: next });
    get().addLog('INFO', 'SULAMA', next ? 'Tarla sulama sistemi AÇILDI.' : 'Tarla sulama sistemi KAPATILDI.');
  },

  buildMissionPlanNow: () => {
    const s = get();
    if (!s.spectralAnalysis) {
      s.addLog('WARNING', 'PLANLAMA', 'Önce uydu veri alımı ve multispektral analiz tamamlanmalıdır.');
      return;
    }
    const plan = generateDroneMissionPlan({
      missionType: s.selectedMissionType,
      droneProfileId: s.selectedDroneProfileId,
      altitudeM: s.missionAltitudeM,
      overlapPct: s.missionOverlapPct,
      parcel: s.parcel,
      noFlyZones: s.noFlyZones,
      analysis: s.spectralAnalysis,
      activeFaults: s.activeFaults,
    });
    set({
      missionPlan: plan,
      scenarioStage: Math.max(s.scenarioStage, 7) as ScenarioStageNumber,
      drone: {
        ...createInitialDroneTelemetry(s.parcel),
        totalWaypoints: plan.waypoints.length,
      },
    });
    s.addLog(plan.isFeasible ? 'SUCCESS' : 'ERROR', 'GÖREV PLANLAMA', `${plan.name} — ${plan.feasibilityReason}`);
  },

  setOperatorSafetyApproved: (approved) => set({ operatorSafetyApproved: approved }),

  startSimulation: () => {
    const s = get();
    if (s.operationMode === 'REAL_DATA') {
      s.addLog('ERROR', 'SİSTEM', 'GERÇEK VERİ modunda fiziksel donanım bağlı değil. Çalıştırmak için SİMÜLASYON moduna geçin.');
      return;
    }
    const sat = SATELLITE_PROFILES[s.selectedSatelliteId];
    const hw = GROUND_STATION_HARDWARE[s.hardwareId];
    if (!hw.supportedBands.includes(sat.band)) {
      s.addLog(
        'ERROR',
        'RF KONTROL',
        `Alım başlatılamadı: ${sat.shortName} (${sat.band}) ile ${hw.name} uyumsuz. 2.4m X-Band istasyonunu seçin veya Ku-Band uyduya geçin.`,
      );
      set({ acquisitionStage: 'FAULT', isRunning: false });
      return;
    }

    set({
      isRunning: true,
      isPaused: false,
      acquisitionStage: s.acquisitionStage === 'IDLE' || s.acquisitionStage === 'FAULT' ? 'PASS_CALCULATION' : s.acquisitionStage,
      scenarioStage: Math.max(s.scenarioStage, 2) as ScenarioStageNumber,
      stageTimerSec: 0,
    });
    s.addLog('INFO', 'OPERASYON', `Simülasyon başlatıldı (${sat.shortName} → ${hw.name}).`);
  },

  pauseSimulation: () => {
    set({ isPaused: true });
    get().addLog('INFO', 'OPERASYON', 'Simülasyon operatör tarafından duraklatıldı.');
  },

  resumeSimulation: () => {
    set({ isPaused: false, isRunning: true });
    get().addLog('INFO', 'OPERASYON', 'Simülasyon kaldığı yerden devam ediyor.');
  },

  resetSimulation: () => {
    const s = get();
    const sat = SATELLITE_PROFILES[s.selectedSatelliteId];
    const hw = GROUND_STATION_HARDWARE[s.hardwareId];
    const orbit = computeSatellitePassState(sat, 0.16, false);
    const rf = evaluateRfLink({
      satellite: sat,
      hardware: hw,
      orbit,
      antennaAzDeg: 185,
      antennaElDeg: 15,
      activeFaults: [],
      prevReceivedMb: 0,
      totalExpectedMb: 480,
      dtSec: 0,
      isReceivingStage: false,
    });
    set({
      isRunning: false,
      isPaused: false,
      simTimeSec: 0,
      scenarioStage: 1,
      passPhase: 0.16,
      orbit,
      antennaAzDeg: 185,
      antennaElDeg: 15,
      acquisitionStage: 'IDLE',
      stageTimerSec: 0,
      rf,
      localServerConnected: true,
      spectralAnalysis: null,
      processingDurationSec: 0,
      missionPlan: null,
      drone: createInitialDroneTelemetry(s.parcel),
      droneDataTransferred: false,
      appliedIrrigationM3: 0,
      soilSensors: [
        { id: 'IOT-A1', zoneCode: 'Bölge A', localX: -300, localZ: -240, soilMoisturePct: 31.4, nitrogenPpm: 46, soilTempC: 18.2 },
        { id: 'IOT-B1', zoneCode: 'Bölge B', localX: 256, localZ: -191, soilMoisturePct: 26.8, nitrogenPpm: 21, soilTempC: 19.6 },
        { id: 'IOT-C1', zoneCode: 'Bölge C', localX: -256, localZ: 210, soilMoisturePct: 16.2, nitrogenPpm: 34, soilTempC: 21.1 },
      ],
      activeFaults: [],
      telemetryHistory: [{ tSec: 0, snrDb: rf.snrDb, elevationDeg: orbit.elevationDeg, dataRateMbps: 0, batteryPct: 100 }],
    });
    s.addLog('INFO', 'SİSTEM', 'Simülasyon başlangıç durumuna sıfırlandı.');
  },

  runSpectralAnalysisNow: () => {
    const s = get();
    if (s.rf.completionPct < 100 && !s.activeFaults.includes('INCOMPLETE_IMAGE')) {
      s.addLog('WARNING', 'ANALİZ', 'Veri transferi tamamlanmadan multispektral analiz başlatılamaz.');
      return false;
    }
    if (!s.localServerConnected || s.activeFaults.includes('SERVER_DISCONNECT')) {
      s.addLog('ERROR', 'SUNUCU', 'AgroMax yerel sunucusu bağlı değil; multispektral analiz kuyruğu durduruldu.');
      return false;
    }
    const sat = SATELLITE_PROFILES[s.selectedSatelliteId];
    const result = runMultispectralProcessing(sat, s.activeFaults, s.parcel.center);
    const procSec = Number((2.4 + Math.random() * 0.4).toFixed(1));
    set({
      spectralAnalysis: result,
      processingDurationSec: procSec,
      scenarioStage: Math.max(s.scenarioStage, 6) as ScenarioStageNumber,
    });
    s.addLog(
      result.reliabilityLabel === 'DÜŞÜK' ? 'WARNING' : 'SUCCESS',
      'MULTİSPEKTRAL',
      `Analiz tamamlandı: Ort. NDVI=${result.meanNdvi}, Ort. NDMI=${result.meanNdmi}, Bulut=%${result.cloudCoverPct}, Güvenilirlik=${result.reliabilityLabel}.`,
    );
    return true;
  },

  startDroneFlightNow: () => {
    const s = get();
    if (!s.missionPlan) {
      s.buildMissionPlanNow();
    }
    const plan = get().missionPlan;
    if (!plan || !plan.isFeasible) {
      s.addLog('ERROR', 'İHA KONTROL', plan?.feasibilityReason || 'Geçerli ve güvenli İHA görev planı bulunmuyor.');
      return false;
    }
    if (s.operationMode === 'REAL_DATA' && !s.operatorSafetyApproved) {
      s.addLog('ERROR', 'EMNİYET', 'Gerçek İHA uçuşu için operatör onayı zorunludur.');
      return false;
    }
    set({
      isRunning: true,
      isPaused: false,
      scenarioStage: 8,
      drone: {
        ...createInitialDroneTelemetry(s.parcel),
        totalWaypoints: plan.waypoints.length,
        flightMode: 'HAZIR_BEKLEME',
      },
    });
    s.addLog('INFO', 'İHA KONTROL', `Görev paketi "${plan.name}" İHA kontrol sistemine yüklendi ve kalkış onaylandı.`);
    return true;
  },

  advanceToNextStage: () => {
    const s = get();
    if (s.operationMode === 'REAL_DATA') {
      s.addLog('WARNING', 'SİSTEM', 'GERÇEK VERİ modunda manuel adım ilerletme pasiftir.');
      return;
    }

    const stage = s.scenarioStage;
    if (stage === 1) {
      s.startSimulation();
    } else if (stage === 2) {
      // Jump satellite into high-elevation pass & align dish
      const sat = SATELLITE_PROFILES[s.selectedSatelliteId];
      const hw = GROUND_STATION_HARDWARE[s.hardwareId];
      const orbit = computeSatellitePassState(sat, 0.38, s.activeFaults.includes('LOS_LOSS'));
      const rf = evaluateRfLink({
        satellite: sat,
        hardware: hw,
        orbit,
        antennaAzDeg: orbit.azimuthDeg,
        antennaElDeg: orbit.elevationDeg,
        activeFaults: s.activeFaults,
        prevReceivedMb: 0,
        totalExpectedMb: 480,
        dtSec: 0,
        isReceivingStage: true,
      });
      set({
        passPhase: 0.38,
        orbit,
        antennaAzDeg: orbit.azimuthDeg,
        antennaElDeg: orbit.elevationDeg,
        acquisitionStage: rf.hardwareCompatible && rf.carrierLocked ? 'FRAME_RECEPTION' : 'FAULT',
        rf,
        scenarioStage: 3,
        isRunning: true,
        isPaused: false,
      });
      s.addLog('INFO', 'VERİ ALIMI', 'Uydu görünürlük konisine girdi, anten kilitlendi ve RF veri çerçeveleri alınıyor.');
    } else if (stage === 3) {
      const sat = SATELLITE_PROFILES[s.selectedSatelliteId];
      const hw = GROUND_STATION_HARDWARE[s.hardwareId];
      if (!hw.supportedBands.includes(sat.band)) {
        s.addLog('ERROR', 'RF KONTROL', 'Donanım bandı uyumsuz olduğu için veri transferi tamamlanamadı.');
        return;
      }
      set((curr) => ({
        rf: {
          ...curr.rf,
          receivedMb: curr.rf.totalExpectedMb,
          completionPct: 100,
          queueDepth: 0,
        },
        acquisitionStage: 'AGROMAX_INGESTION',
        scenarioStage: 4,
      }));
      s.addLog('SUCCESS', 'SUNUCU', 'Ham uydu çerçeveleri çözümlendi ve AgroMax yerel sunucusuna aktarıldı.');
    } else if (stage === 4 || stage === 5) {
      const ok = s.runSpectralAnalysisNow();
      if (ok) {
        set({ scenarioStage: 6 });
      }
    } else if (stage === 6) {
      s.buildMissionPlanNow();
      set({ scenarioStage: 7 });
    } else if (stage === 7) {
      s.startDroneFlightNow();
    } else if (stage === 8) {
      // Fast-forward drone completion if requested
      const plan = s.missionPlan;
      if (plan) {
        const doneWps = plan.waypoints.map((w) => ({ ...w, visited: true }));
        set((curr) => ({
          missionPlan: { ...plan, waypoints: doneWps },
          drone: {
            ...curr.drone,
            flightMode: 'GOREV_TAMAMLANDI',
            missionProgressPct: 100,
            altitudeM: 0,
            groundSpeedMs: 0,
            photosCollected: Math.max(curr.drone.photosCollected, doneWps.filter((w) => w.action === 'CAPTURE_PHOTO' || w.action === 'INSPECT_ZONE').length),
            cameraStatus: 'AKTARIMDA',
          },
          droneDataTransferred: true,
          scenarioStage: 9,
        }));
        s.addLog('SUCCESS', 'İHA VERİ', 'İHA görevi tamamlandı ve toplanan görüntüler AgroMax sunucusuna aktarıldı.');
      }
    } else if (stage === 9) {
      set({ scenarioStage: 10, activeNav: 'GOREV_RAPORLARI', isRunning: false });
      s.addLog('SUCCESS', 'RAPOR', 'Operasyon sonu görev raporu oluşturuldu.');
    }
  },

  toggleFault: (fault) => {
    const s = get();
    const exists = s.activeFaults.includes(fault);
    const nextFaults = exists ? s.activeFaults.filter((f) => f !== fault) : [...s.activeFaults, fault];
    const serverDown = nextFaults.includes('SERVER_DISCONNECT');

    set({
      activeFaults: nextFaults,
      localServerConnected: !serverDown,
    });

    s.addLog(
      exists ? 'INFO' : 'WARNING',
      'HATA ENJEKSİYONU',
      exists ? `Hata senaryosu temizlendi: ${fault}` : `Hata senaryosu aktif edildi: ${fault}`,
    );

    // Re-evaluate spectral analysis if cloud/incomplete fault toggled when analysis already exists
    if ((fault === 'HIGH_CLOUD_COVER' || fault === 'INCOMPLETE_IMAGE') && s.spectralAnalysis) {
      const sat = SATELLITE_PROFILES[s.selectedSatelliteId];
      const updated = runMultispectralProcessing(sat, nextFaults, s.parcel.center);
      set({ spectralAnalysis: updated });
    }
    // Re-evaluate mission plan if NFZ fault toggled
    if (fault === 'NO_FLY_ZONE_CONFLICT' && s.spectralAnalysis) {
      const plan = generateDroneMissionPlan({
        missionType: s.selectedMissionType,
        droneProfileId: s.selectedDroneProfileId,
        altitudeM: s.missionAltitudeM,
        overlapPct: s.missionOverlapPct,
        parcel: s.parcel,
        noFlyZones: s.noFlyZones,
        analysis: s.spectralAnalysis,
        activeFaults: nextFaults,
      });
      set({ missionPlan: plan });
    }
  },

  clearAllFaults: () => {
    set({ activeFaults: [], localServerConnected: true });
    get().addLog('INFO', 'SİSTEM', 'Tüm enjekte edilmiş hata senaryoları temizlendi.');
  },

  addLog: (level, source, message) => {
    const entry: SimEventLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowTimeStr(),
      simTimeSec: Number(get().simTimeSec.toFixed(1)),
      level,
      source,
      message,
    };
    set((s) => ({ logs: [entry, ...s.logs].slice(0, 140) }));
  },

  tickSimulation: (realDtSec) => {
    const s = get();
    if (!s.isRunning || s.isPaused || s.operationMode === 'REAL_DATA') return;

    const dt = Math.min(0.1, realDtSec) * s.simSpeed;
    const nextSimTime = s.simTimeSec + dt;

    const sat = SATELLITE_PROFILES[s.selectedSatelliteId];
    const hw = GROUND_STATION_HARDWARE[s.hardwareId];

    // Advance orbital pass gently (full pass ~ 120s at 1x)
    const nextPassPhase = Math.min(1.05, s.passPhase + dt * 0.0055);
    const orbit = computeSatellitePassState(sat, nextPassPhase, s.activeFaults.includes('LOS_LOSS'));

    // Slew parabolic dish mechanically toward target (AUTO -> satellite Az/El, MANUAL -> user Az/El)
    const targetAz = s.antennaMode === 'AUTO' ? orbit.azimuthDeg : s.manualTargetAzDeg;
    const targetEl = s.antennaMode === 'AUTO' ? Math.max(0, orbit.elevationDeg) : s.manualTargetElDeg;

    let nextAz = s.antennaAzDeg;
    let nextEl = s.antennaElDeg;

    const azDiff = shortestAngleDelta(targetAz, nextAz);
    const maxAzStep = hw.maxSlewAzDegPerSec * dt;
    if (Math.abs(azDiff) <= maxAzStep) nextAz = targetAz;
    else nextAz = (nextAz + Math.sign(azDiff) * maxAzStep + 360) % 360;

    const elDiff = targetEl - nextEl;
    const maxElStep = hw.maxSlewElDegPerSec * dt;
    if (Math.abs(elDiff) <= maxElStep) nextEl = targetEl;
    else nextEl = Math.max(0, Math.min(90, nextEl + Math.sign(elDiff) * maxElStep));

    // Evaluate Acquisition State Machine
    let acq = s.acquisitionStage;
    let stageTimer = s.stageTimerSec + dt;
    let nextScenarioStage = s.scenarioStage;
    const serverOk = !s.activeFaults.includes('SERVER_DISCONNECT');

    const isReceiving = acq === 'FRAME_RECEPTION' || acq === 'CRC_ERROR_CHECK' || acq === 'PACKET_REASSEMBLY';

    const rf = evaluateRfLink({
      satellite: sat,
      hardware: hw,
      orbit,
      antennaAzDeg: nextAz,
      antennaElDeg: nextEl,
      activeFaults: s.activeFaults,
      prevReceivedMb: s.rf.receivedMb,
      totalExpectedMb: s.rf.totalExpectedMb,
      dtSec: dt,
      isReceivingStage: isReceiving,
    });

    if (!rf.hardwareCompatible) {
      if (acq !== 'FAULT') {
        acq = 'FAULT';
        s.addLog('ERROR', 'RF UYUMSUZLUĞU', rf.incompatibilityReason || 'Donanım bandı uyumsuz.');
      }
    } else if (acq === 'PASS_CALCULATION' && stageTimer >= 1.2) {
      acq = 'LOS_ACQUISITION';
      stageTimer = 0;
    } else if (acq === 'LOS_ACQUISITION') {
      if (orbit.isAboveHorizon && orbit.elevationDeg >= hw.minElevationDeg && !s.activeFaults.includes('LOS_LOSS')) {
        acq = 'ANTENNA_SLEWING';
        stageTimer = 0;
        nextScenarioStage = Math.max(nextScenarioStage, 2) as ScenarioStageNumber;
      }
    } else if (acq === 'ANTENNA_SLEWING') {
      if (rf.pointingErrorDeg < 2.2) {
        acq = 'RF_SIGNAL_DETECTED';
        stageTimer = 0;
      }
    } else if (acq === 'RF_SIGNAL_DETECTED' && stageTimer >= 1.0) {
      if (rf.carrierLocked) {
        acq = 'CARRIER_LOCK';
        stageTimer = 0;
        s.addLog('SUCCESS', 'RF ALICI', `Taşıyıcı kilidi sağlandı (SNR: ${rf.snrDb} dB, Doppler: ${orbit.dopplerKHz.toFixed(1)} kHz).`);
      }
    } else if (acq === 'CARRIER_LOCK' && stageTimer >= 1.0) {
      acq = 'FRAME_RECEPTION';
      stageTimer = 0;
      nextScenarioStage = Math.max(nextScenarioStage, 3) as ScenarioStageNumber;
      s.addLog('INFO', 'VERİ ALIMI', `${sat.shortName} veri çerçeveleri alınıyor...`);
    } else if (acq === 'FRAME_RECEPTION') {
      if (!rf.carrierLocked || !orbit.isAboveHorizon || s.activeFaults.includes('LOS_LOSS')) {
        s.addLog('WARNING', 'RF KOPTU', 'Görüş hattı veya taşıyıcı kilidi kaybedildi; veri alımı durdu.');
        acq = 'LOS_ACQUISITION';
      } else if (rf.completionPct >= 100 || (s.activeFaults.includes('INCOMPLETE_IMAGE') && rf.completionPct >= 77.9)) {
        acq = 'CRC_ERROR_CHECK';
        stageTimer = 0;
      }
    } else if (acq === 'CRC_ERROR_CHECK' && stageTimer >= 0.9) {
      acq = 'PACKET_REASSEMBLY';
      stageTimer = 0;
    } else if (acq === 'PACKET_REASSEMBLY' && stageTimer >= 0.9) {
      acq = 'RAW_STORAGE';
      stageTimer = 0;
    } else if (acq === 'RAW_STORAGE' && stageTimer >= 0.8) {
      acq = 'PRODUCT_GENERATION';
      stageTimer = 0;
    } else if (acq === 'PRODUCT_GENERATION' && stageTimer >= 0.9) {
      if (!serverOk) {
        s.addLog('ERROR', 'SUNUCU', 'AgroMax yerel sunucusu çevrimdışı — ürün aktarımı bekliyor.');
      } else {
        acq = 'AGROMAX_INGESTION';
        stageTimer = 0;
        nextScenarioStage = Math.max(nextScenarioStage, 4) as ScenarioStageNumber;
        s.addLog('SUCCESS', 'VERİ AKTARIMI', 'Ham veri ürünleştirildi ve AgroMax sunucusuna başarıyla aktarıldı.');
      }
    }

    // Auto-Run Pipeline Progression: Stage 4 -> 5/6 (Analysis) -> 7 (Plan) -> 8 (Drone)
    let spectralAnalysis = s.spectralAnalysis;
    let processingDurationSec = s.processingDurationSec;
    let missionPlan = s.missionPlan;
    let drone = s.drone;
    let droneDataTransferred = s.droneDataTransferred;
    let stillRunning: boolean = s.isRunning;

    if (s.autoRun && acq === 'AGROMAX_INGESTION' && !spectralAnalysis && serverOk) {
      spectralAnalysis = runMultispectralProcessing(sat, s.activeFaults, s.parcel.center);
      processingDurationSec = 2.6;
      nextScenarioStage = Math.max(nextScenarioStage, 6) as ScenarioStageNumber;
      s.addLog(
        spectralAnalysis.reliabilityLabel === 'DÜŞÜK' ? 'WARNING' : 'SUCCESS',
        'MULTİSPEKTRAL',
        `Otomatik analiz tamamlandı: Ort. NDVI=${spectralAnalysis.meanNdvi}, NDMI=${spectralAnalysis.meanNdmi}. Öncelikli bölgeler belirlendi.`,
      );
    }

    if (s.autoRun && spectralAnalysis && !missionPlan && nextScenarioStage >= 6) {
      missionPlan = generateDroneMissionPlan({
        missionType: s.selectedMissionType,
        droneProfileId: s.selectedDroneProfileId,
        altitudeM: s.missionAltitudeM,
        overlapPct: s.missionOverlapPct,
        parcel: s.parcel,
        noFlyZones: s.noFlyZones,
        analysis: spectralAnalysis,
        activeFaults: s.activeFaults,
      });
      nextScenarioStage = Math.max(nextScenarioStage, 7) as ScenarioStageNumber;
      s.addLog(missionPlan.isFeasible ? 'SUCCESS' : 'ERROR', 'GÖREV PLANLAMA', missionPlan.feasibilityReason);
      if (missionPlan.isFeasible) {
        drone = {
          ...createInitialDroneTelemetry(s.parcel),
          totalWaypoints: missionPlan.waypoints.length,
          flightMode: 'HAZIR_BEKLEME',
        };
        nextScenarioStage = 8;
      } else {
        stillRunning = false;
      }
    }

    // Step Drone Physics when in Stage 8
    if (missionPlan && missionPlan.isFeasible && nextScenarioStage === 8) {
      const outcome = stepDronePhysics(drone, missionPlan, s.parcel, s.activeFaults, dt, 0.5, s.agronomicOp);
      drone = outcome.telemetry;
      missionPlan = outcome.updatedPlan;
      if (outcome.newLogMessage) {
        s.addLog(outcome.abortedReason ? 'WARNING' : 'INFO', 'İHA TELEMETRİ', outcome.newLogMessage);
      }
      if (outcome.completedNow) {
        nextScenarioStage = 9;
        droneDataTransferred = true;
        s.addLog('SUCCESS', 'OPERASYON', 'İHA görüntüleri AgroMax sistemine işlendi. Görev Raporu hazır.');
        if (s.autoRun) {
          nextScenarioStage = 10;
          stillRunning = false;
        }
      }
    }

    // Track irrigation water delivery & Bölge C IoT soil moisture recovery
    let appliedIrrigationM3 = s.appliedIrrigationM3;
    let soilSensors = s.soilSensors;
    if (s.irrigationActive) {
      appliedIrrigationM3 = Number((appliedIrrigationM3 + 1.8 * dt).toFixed(2));
      soilSensors = soilSensors.map((sens) =>
        sens.zoneCode === 'Bölge C'
          ? { ...sens, soilMoisturePct: Number(Math.min(34.5, sens.soilMoisturePct + 0.16 * dt).toFixed(2)) }
          : sens,
      );
    }

    // Record telemetry history every ~1s of sim time
    let telemetryHistory = s.telemetryHistory;
    const lastHist = telemetryHistory[telemetryHistory.length - 1];
    if (!lastHist || nextSimTime - lastHist.tSec >= 1.0) {
      telemetryHistory = [
        ...telemetryHistory.slice(-119),
        {
          tSec: Number(nextSimTime.toFixed(1)),
          snrDb: rf.snrDb,
          elevationDeg: Number(orbit.elevationDeg.toFixed(1)),
          dataRateMbps: rf.dataRateMbps,
          batteryPct: drone.batteryPct,
        },
      ];
    }

    set({
      simTimeSec: nextSimTime,
      passPhase: nextPassPhase,
      orbit,
      antennaAzDeg: Number(nextAz.toFixed(2)),
      antennaElDeg: Number(nextEl.toFixed(2)),
      acquisitionStage: acq,
      stageTimerSec: stageTimer,
      rf,
      scenarioStage: nextScenarioStage,
      spectralAnalysis,
      processingDurationSec,
      missionPlan,
      drone,
      droneDataTransferred,
      appliedIrrigationM3,
      soilSensors,
      isRunning: stillRunning,
      telemetryHistory,
    });
  },
}));

/**
 * Derives the 10-node Data Flow Pipeline strictly from live simulation state.
 * Never returns independent or fake animations.
 */
export function deriveDataFlowNodes(s: SimulationStore): PipelineNodeState[] {
  const acq = s.acquisitionStage;
  const sat = SATELLITE_PROFILES[s.selectedSatelliteId];
  const hasAnalysis = Boolean(s.spectralAnalysis);
  const hasPlan = Boolean(s.missionPlan);
  const droneActive = s.drone.flightMode !== 'HAZIR_BEKLEME' && s.drone.flightMode !== 'GOREV_TAMAMLANDI';
  const droneDone = s.drone.flightMode === 'GOREV_TAMAMLANDI';

  const rfFault = acq === 'FAULT' || !s.rf.hardwareCompatible || s.activeFaults.includes('LOS_LOSS');
  const serverFault = !s.localServerConnected || s.activeFaults.includes('SERVER_DISCONNECT');
  const droneFault = !s.drone.linkConnected || (s.missionPlan !== null && !s.missionPlan.isFeasible);

  return [
    {
      id: 'UYDU',
      label: 'Uydu',
      sublabel: sat.shortName,
      status: s.orbit.isAboveHorizon ? (acq === 'IDLE' ? 'BEKLIYOR' : 'AKTIF') : 'HATA',
      metric: `El ${s.orbit.elevationDeg.toFixed(1)}°`,
    },
    {
      id: 'CANAK_ANTEN',
      label: 'Çanak Anten',
      sublabel: GROUND_STATION_HARDWARE[s.hardwareId].dishDiameterM + 'm Parabolik',
      status:
        acq === 'IDLE'
          ? 'BEKLIYOR'
          : acq === 'ANTENNA_SLEWING'
            ? 'BAGLANIYOR'
            : rfFault
              ? 'HATA'
              : 'AKTIF',
      metric: `Az ${s.antennaAzDeg.toFixed(0)}° / El ${s.antennaElDeg.toFixed(0)}°`,
    },
    {
      id: 'RF_ALICI',
      label: 'RF Alıcı / SDR',
      sublabel: sat.band === 'X_BAND' ? 'X-Band 8.2 GHz' : 'Ku-Band 11.2 GHz',
      status: rfFault
        ? 'HATA'
        : s.rf.carrierLocked
          ? acq === 'AGROMAX_INGESTION'
            ? 'TAMAMLANDI'
            : 'AKTIF'
          : acq === 'RF_SIGNAL_DETECTED'
            ? 'BAGLANIYOR'
            : 'BEKLIYOR',
      metric: `SNR ${s.rf.snrDb.toFixed(1)} dB`,
    },
    {
      id: 'VERI_COZUMLEYICI',
      label: 'Veri Çözümleyici',
      sublabel: 'CCSDS / DVB-S2',
      status: rfFault
        ? 'HATA'
        : acq === 'CRC_ERROR_CHECK' || acq === 'PACKET_REASSEMBLY' || acq === 'RAW_STORAGE'
          ? 'ISLENIYOR'
          : acq === 'PRODUCT_GENERATION' || acq === 'AGROMAX_INGESTION'
            ? 'TAMAMLANDI'
            : acq === 'FRAME_RECEPTION'
              ? 'AKTIF'
              : 'BEKLIYOR',
      metric: `${s.rf.completionPct.toFixed(0)}%`,
    },
    {
      id: 'YEREL_SUNUCU',
      label: 'Yerel Sunucu',
      sublabel: 'AgroMax Core Node',
      status: serverFault
        ? 'HATA'
        : acq === 'AGROMAX_INGESTION'
          ? 'TAMAMLANDI'
          : acq === 'PRODUCT_GENERATION'
            ? 'ISLENIYOR'
            : 'BEKLIYOR',
      metric: serverFault ? 'BAĞLANTI YOK' : `${s.rf.receivedMb.toFixed(0)} MB`,
    },
    {
      id: 'GORUNTU_ISLEME',
      label: 'Görüntü İşleme',
      sublabel: 'Radyometri & Bulut',
      status: serverFault ? 'HATA' : hasAnalysis ? 'TAMAMLANDI' : acq === 'AGROMAX_INGESTION' ? 'ISLENIYOR' : 'BEKLIYOR',
      metric: hasAnalysis ? `${s.spectralAnalysis!.validPixelCount} px` : 'Hazır',
    },
    {
      id: 'AGROMAX_ANALIZ',
      label: 'AgroMax Analiz',
      sublabel: 'NDVI · NDMI · NDRE',
      status: hasAnalysis ? 'TAMAMLANDI' : 'BEKLIYOR',
      metric: hasAnalysis ? `NDVI ${s.spectralAnalysis!.meanNdvi}` : '-',
    },
    {
      id: 'GOREV_PLANLAMA',
      label: 'Görev Planlama',
      sublabel: 'Rota & Emniyet',
      status: s.missionPlan && !s.missionPlan.isFeasible ? 'HATA' : hasPlan ? 'TAMAMLANDI' : 'BEKLIYOR',
      metric: hasPlan ? `${s.missionPlan!.totalDistanceM} m` : '-',
    },
    {
      id: 'DRONE_KONTROL',
      label: 'Drone Kontrol (GCS)',
      sublabel: 'MAVLink / Simülasyon',
      status: droneFault ? 'HATA' : droneDone ? 'TAMAMLANDI' : droneActive ? 'AKTIF' : hasPlan ? 'BAGLANIYOR' : 'BEKLIYOR',
      metric: `Link %${s.drone.linkQualityPct}`,
    },
    {
      id: 'DRONE',
      label: 'Otonom Drone',
      sublabel: s.drone.flightMode.replace(/_/g, ' '),
      status: droneFault ? 'HATA' : droneDone ? 'TAMAMLANDI' : droneActive ? 'AKTIF' : 'BEKLIYOR',
      metric: `${s.drone.photosCollected} Kare · %${s.drone.batteryPct.toFixed(0)}`,
    },
  ];
}
