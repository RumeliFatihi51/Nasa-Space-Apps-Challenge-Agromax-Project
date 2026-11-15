export type NavSectionId =
  | 'OPERASYON_MERKEZI'
  | 'UYDU_YORUNGE'
  | 'YER_ISTASYONU'
  | 'VERI_ALIMI'
  | 'MULTISPEKTRAL_ANALIZ'
  | 'HARITA_PARSELLER'
  | 'DRONE_GOREV_PLANLAMA'
  | 'CANLI_OPERASYON'
  | 'GOREV_RAPORLARI'
  | 'SISTEM_AYARLARI';

export type OperationMode = 'SIMULATION' | 'REAL_DATA';

export type StageBaseMode = 'GOOGLE_STREET_AR' | 'GOOGLE_HYBRID' | 'GOOGLE_3D' | 'THREE_3D';

export type CameraPresetId =
  | 'EARTH_VIEW'
  | 'SATELLITE_TRACK'
  | 'GROUND_STATION_CLOSE'
  | 'ANTENNA_MECHANICAL'
  | 'DATA_FLOW_VIEW'
  | 'FIELD_MAP_3D'
  | 'DRONE_CHASE'
  | 'DRONE_ONBOARD'
  | 'FREE_CAMERA';

export type FrequencyBand = 'X_BAND' | 'KU_BAND';

export type SatelliteId =
  | 'EUMETCAST_DATA'
  | 'SENTINEL_2_OPTICAL'
  | 'LANDSAT_8_9'
  | 'COMMERCIAL_VHR';

export interface SatelliteProfile {
  id: SatelliteId;
  name: string;
  shortName: string;
  operator: string;
  orbitType: string;
  altitudeKm: number;
  inclinationDeg: number;
  periodMin: number;
  dataType: string;
  band: FrequencyBand;
  frequencyGHz: number;
  dataRateMbps: number;
  spectralBands: string[];
  spatialResolutionM: number;
  requiredStationClass: string;
  compatibleWith80cmKu: boolean;
  simulationSupported: boolean;
  realConnectionStatus: 'BAGLI_DEGIL';
  description: string;
  notes: string;
}

export type GroundStationHardwareId = 'DISH_80CM_KU' | 'DISH_240CM_X_PRO';

export interface GroundStationHardwareProfile {
  id: GroundStationHardwareId;
  name: string;
  dishDiameterM: number;
  supportedBands: FrequencyBand[];
  rfFrontend: string;
  receiverModel: string;
  gainDbi: number;
  beamwidthDeg: number;
  maxSlewAzDegPerSec: number;
  maxSlewElDegPerSec: number;
  minElevationDeg: number;
  description: string;
}

export type AntennaControlMode = 'AUTO' | 'MANUAL';

export type AcquisitionStage =
  | 'IDLE'
  | 'PASS_CALCULATION'
  | 'LOS_ACQUISITION'
  | 'ANTENNA_SLEWING'
  | 'RF_SIGNAL_DETECTED'
  | 'CARRIER_LOCK'
  | 'FRAME_RECEPTION'
  | 'CRC_ERROR_CHECK'
  | 'PACKET_REASSEMBLY'
  | 'RAW_STORAGE'
  | 'PRODUCT_GENERATION'
  | 'AGROMAX_INGESTION'
  | 'FAULT';

export type ScenarioStageNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type FaultType =
  | 'LOS_LOSS'
  | 'ANTENNA_MISALIGNMENT'
  | 'RF_ATTENUATION'
  | 'PACKET_LOSS'
  | 'INCOMPLETE_IMAGE'
  | 'HIGH_CLOUD_COVER'
  | 'SERVER_DISCONNECT'
  | 'DRONE_LINK_LOSS'
  | 'CRITICAL_BATTERY'
  | 'NO_FLY_ZONE_CONFLICT';

export interface FaultScenarioDef {
  id: FaultType;
  label: string;
  subsystem: 'UYDU' | 'YER_ISTASYONU' | 'SUNUCU' | 'ANALIZ' | 'DRONE';
  description: string;
  expectedResponse: string;
}

export interface OrbitTelemetry {
  latDeg: number;
  lonDeg: number;
  altKm: number;
  velocityKmS: number;
  azimuthDeg: number;
  elevationDeg: number;
  slantRangeKm: number;
  isAboveHorizon: boolean;
  dopplerKHz: number;
  passProgress: number; // 0..1 across current pass window
  aosTimeLabel: string;
  losTimeLabel: string;
}

export interface RfTelemetry {
  signalDbm: number;
  snrDb: number;
  ber: number;
  pointingErrorDeg: number;
  packetLossPct: number;
  dataRateMbps: number;
  receivedMb: number;
  totalExpectedMb: number;
  completionPct: number;
  carrierLocked: boolean;
  hardwareCompatible: boolean;
  incompatibilityReason: string | null;
  queueDepth: number;
}

export type SpectralIndexType = 'RGB' | 'NDVI' | 'NDMI' | 'NDRE' | 'NDWI' | 'FALSE_COLOR' | 'CHANGE_DETECTION';

export type AgronomicOperationType = 'INSPECTION' | 'SPRAYING' | 'IRRIGATION' | 'FERTILIZATION';

export interface PriorityZone {
  id: string;
  code: 'Bölge A' | 'Bölge B' | 'Bölge C' | 'Bölge D';
  label: string;
  category: 'NORMAL' | 'LOW_NDVI' | 'LOW_NDMI' | 'CLOUD_UNCERTAIN';
  centerNormalized: [number, number]; // [0..1, 0..1] in parcel grid
  centerCoord: [number, number]; // [lon, lat]
  radiusMeters: number;
  areaHectares: number;
  meanNdvi: number;
  meanNdmi: number;
  meanNdre: number;
  cloudPct: number;
  priority: 'DÜŞÜK' | 'ORTA' | 'YÜKSEK';
  rationale: string;
  recommendedAction: string;
  prescription: {
    sprayLitersPerHa: number;
    irrigationMm: number;
    fertilizerKgPerHa: number;
    treatmentLabel: string;
  };
}

export interface SpectralAnalysisResult {
  datasetId: string;
  sourceSatelliteName: string;
  acquisitionTimestamp: string;
  isSyntheticSimulationData: boolean;
  spatialResolutionM: number;
  gridWidth: number;
  gridHeight: number;
  availableBands: string[];
  // Flat arrays length = gridWidth * gridHeight
  red: Float32Array;
  green: Float32Array;
  blue: Float32Array;
  nir: Float32Array;
  swir: Float32Array;
  redEdge: Float32Array;
  cloudMask: Uint8Array; // 1 = cloud/invalid, 0 = valid
  ndvi: Float32Array;
  ndmi: Float32Array;
  ndre: Float32Array;
  ndwi: Float32Array;
  changeDeltaNdvi: Float32Array;
  // Summary statistics computed strictly from valid pixels
  meanNdvi: number;
  minNdvi: number;
  maxNdvi: number;
  meanNdmi: number;
  ndmiDistribution: { lowPct: number; moderatePct: number; highPct: number };
  cloudCoverPct: number;
  validPixelCount: number;
  totalPixelCount: number;
  reliabilityLabel: 'YÜKSEK' | 'ORTA' | 'DÜŞÜK';
  reliabilityNote: string;
  priorityZones: PriorityZone[];
  scientificCaveats: string[];
}

export interface GisParcel {
  id: string;
  name: string;
  cropType: string;
  coordinates: [number, number][]; // [lon, lat] closed polygon
  areaHectares: number;
  perimeterMeters: number;
  center: [number, number];
  elevationM: number;
}

export interface NoFlyZone {
  id: string;
  name: string;
  reason: string;
  coordinates: [number, number][];
}

export type MapLayerId =
  | 'RGB'
  | 'NDVI'
  | 'NDMI'
  | 'NDRE'
  | 'CLOUD_MASK'
  | 'PRIORITY_ZONES'
  | 'MISSION_ROUTE'
  | 'ACTUAL_TRACK'
  | 'PHOTO_POINTS';

export interface MapLayerState {
  id: MapLayerId;
  label: string;
  visible: boolean;
  opacity: number;
  legendText: string;
  dateLabel: string;
  sourceLabel: string;
}

export type DroneProfileId =
  | 'RGB_MAPPER'
  | 'MULTISPECTRAL_SCOUT'
  | 'DETAIL_OBSERVER'
  | 'PRECISION_APPLICATOR';

export interface DroneProfile {
  id: DroneProfileId;
  name: string;
  airframe: string;
  sensorSuite: string;
  cruiseSpeedMs: number;
  maxRangeM: number;
  maxFlightTimeMin: number;
  batteryCapacityMah: number;
  hoverPowerW: number;
  cruisePowerW: number;
  cameraFovDeg: number;
  defaultAltitudeM: number;
  description: string;
}

export type MissionType =
  | 'AREA_SCAN'
  | 'TARGET_INSPECTION'
  | 'PHOTOGRAMMETRY'
  | 'VERIFICATION_FLIGHT'
  | 'SIMULATED_VARIABLE_RATE';

export interface MissionWaypoint {
  index: number;
  lon: number;
  lat: number;
  localX: number; // meters relative to parcel center
  localZ: number; // meters relative to parcel center
  altitudeM: number;
  action: 'TAKEOFF' | 'TRANSIT' | 'CAPTURE_PHOTO' | 'INSPECT_ZONE' | 'VRA_SIM' | 'RTL' | 'LAND';
  targetZoneCode?: string;
  speedMs: number;
  visited: boolean;
}

export interface DroneMissionPlan {
  id: string;
  name: string;
  missionType: MissionType;
  droneProfileId: DroneProfileId;
  altitudeM: number;
  overlapPct: number;
  speedMs: number;
  takeoffCoord: [number, number];
  waypoints: MissionWaypoint[];
  totalDistanceM: number;
  estimatedDurationSec: number;
  estimatedBatteryUsePct: number;
  batteryReservePct: number;
  isFeasible: boolean;
  feasibilityReason: string;
  explanationNotes: string[];
  targetZonesIncluded: string[];
}

export type DroneFlightMode =
  | 'HAZIR_BEKLEME'
  | 'MOTOR_BASLATMA'
  | 'KALKIS_TIRMANMA'
  | 'ROTA_SEYRI'
  | 'BOLGE_INCELEME'
  | 'EVE_DONUS_RTL'
  | 'INIS'
  | 'GOREV_TAMAMLANDI'
  | 'ACIL_DURUM_RTL';

export type LightingMode = 'NOON' | 'GOLDEN_HOUR';

export interface SoilSensorReading {
  id: string;
  zoneCode: string;
  localX: number;
  localZ: number;
  soilMoisturePct: number;
  nitrogenPpm: number;
  soilTempC: number;
}

export interface DroneTelemetry {
  lat: number;
  lon: number;
  localX: number;
  localZ: number;
  altitudeM: number;
  groundSpeedMs: number;
  verticalSpeedMs: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  batteryPct: number;
  payloadTankPct: number;
  appliedSprayLiters: number;
  appliedFertilizerKg: number;
  estimatedRemainingMin: number;
  missionProgressPct: number;
  gpsFix: 'RTK_FIXED' | '3D_DGPS' | 'NO_FIX';
  satellitesVisible: number;
  linkQualityPct: number;
  linkConnected: boolean;
  flightMode: DroneFlightMode;
  cameraStatus: 'BEKLEMEDE' | 'CEKIM_YAPILIYOR' | 'AKTARIMDA' | 'HATA';
  photosCollected: number;
  currentWaypointIndex: number;
  totalWaypoints: number;
  distanceFlownM: number;
  flightElapsedSec: number;
  actualTrack: { localX: number; localZ: number; altitudeM: number; lon: number; lat: number }[];
  capturedPhotos: { localX: number; localZ: number; lon: number; lat: number; zone?: string; timestamp: string }[];
}

export interface SimEventLog {
  id: string;
  timestamp: string;
  simTimeSec: number;
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  source: string;
  message: string;
}

export type PipelineNodeStatus = 'BEKLIYOR' | 'BAGLANIYOR' | 'AKTIF' | 'ISLENIYOR' | 'TAMAMLANDI' | 'HATA';

export interface PipelineNodeState {
  id:
    | 'UYDU'
    | 'CANAK_ANTEN'
    | 'RF_ALICI'
    | 'VERI_COZUMLEYICI'
    | 'YEREL_SUNUCU'
    | 'GORUNTU_ISLEME'
    | 'AGROMAX_ANALIZ'
    | 'GOREV_PLANLAMA'
    | 'DRONE_KONTROL'
    | 'DRONE';
  label: string;
  sublabel: string;
  status: PipelineNodeStatus;
  metric: string;
}

export interface MissionReport {
  reportId: string;
  generatedAt: string;
  scenarioName: string;
  operationMode: OperationMode;
  satelliteDataset: string;
  groundStationSummary: string;
  processingDurationSec: number;
  analyzedAreaHectares: number;
  priorityZonesSummary: { code: string; category: string; rationale: string }[];
  missionRouteSummary: string;
  actualFlightDistanceM: number;
  actualFlightDurationSec: number;
  photosCollected: number;
  appliedSprayLiters: number;
  appliedFertilizerKg: number;
  appliedIrrigationM3: number;
  missionStatus: 'BAŞARILI' | 'KISMİ_TAMAMLANDI' | 'İPTAL_EDİLDİ' | 'BEKLEMEDE';
  warnings: string[];
  recommendedNextSteps: string[];
}
