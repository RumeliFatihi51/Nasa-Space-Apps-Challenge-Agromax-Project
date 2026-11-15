import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Compass,
  Droplets,
  Navigation,
  Radio,
  Satellite,
  Sliders,
  Sprout,
} from 'lucide-react';
import { generatePassCurve } from '../../satellite/orbitMath';
import {
  DRONE_PROFILES,
  GROUND_STATION_HARDWARE,
  SATELLITE_PROFILES,
} from '../../shared/catalog';
import {
  AcquisitionStage,
  AgronomicOperationType,
  DroneProfileId,
  GroundStationHardwareId,
  MissionType,
  SatelliteId,
} from '../../shared/types';
import { useSimulationStore } from '../../telemetry/simulationStore';

const ACQ_LABELS: { id: AcquisitionStage; label: string }[] = [
  { id: 'PASS_CALCULATION', label: '1. Uydu geçişi hesaplanıyor' },
  { id: 'LOS_ACQUISITION', label: '2. Görüş hattı bekleniyor' },
  { id: 'ANTENNA_SLEWING', label: '3. Anten uyduya yöneliyor' },
  { id: 'RF_SIGNAL_DETECTED', label: '4. RF sinyali algılandı' },
  { id: 'CARRIER_LOCK', label: '5. Sinyal kilidi kuruldu' },
  { id: 'FRAME_RECEPTION', label: '6. Veri çerçeveleri alınıyor' },
  { id: 'CRC_ERROR_CHECK', label: '7. Hata kontrolü (CRC)' },
  { id: 'PACKET_REASSEMBLY', label: '8. Paketler birleştiriliyor' },
  { id: 'RAW_STORAGE', label: '9. Ham veri kaydediliyor' },
  { id: 'PRODUCT_GENERATION', label: '10. Görüntü ürünü oluşturuluyor' },
  { id: 'AGROMAX_INGESTION', label: '11. AgroMax hattına aktarıldı' },
];

export const RightInspector: React.FC = () => {
  const activeNav = useSimulationStore((s) => s.activeNav);
  const selectedSatelliteId = useSimulationStore((s) => s.selectedSatelliteId);
  const hardwareId = useSimulationStore((s) => s.hardwareId);
  const orbit = useSimulationStore((s) => s.orbit);
  const rf = useSimulationStore((s) => s.rf);
  const antennaMode = useSimulationStore((s) => s.antennaMode);
  const antennaAzDeg = useSimulationStore((s) => s.antennaAzDeg);
  const antennaElDeg = useSimulationStore((s) => s.antennaElDeg);
  const manualTargetAzDeg = useSimulationStore((s) => s.manualTargetAzDeg);
  const manualTargetElDeg = useSimulationStore((s) => s.manualTargetElDeg);
  const acquisitionStage = useSimulationStore((s) => s.acquisitionStage);
  const spectralAnalysis = useSimulationStore((s) => s.spectralAnalysis);
  const missionPlan = useSimulationStore((s) => s.missionPlan);
  const drone = useSimulationStore((s) => s.drone);
  const selectedDroneProfileId = useSimulationStore((s) => s.selectedDroneProfileId);
  const selectedMissionType = useSimulationStore((s) => s.selectedMissionType);
  const missionAltitudeM = useSimulationStore((s) => s.missionAltitudeM);
  const missionOverlapPct = useSimulationStore((s) => s.missionOverlapPct);
  const operationMode = useSimulationStore((s) => s.operationMode);
  const operatorSafetyApproved = useSimulationStore((s) => s.operatorSafetyApproved);
  const agronomicOp = useSimulationStore((s) => s.agronomicOp);
  const irrigationActive = useSimulationStore((s) => s.irrigationActive);
  const appliedIrrigationM3 = useSimulationStore((s) => s.appliedIrrigationM3);
  const soilSensors = useSimulationStore((s) => s.soilSensors);
  const windSpeedMs = useSimulationStore((s) => s.windSpeedMs);

  const selectSatellite = useSimulationStore((s) => s.selectSatellite);
  const selectHardware = useSimulationStore((s) => s.selectHardware);
  const setAntennaMode = useSimulationStore((s) => s.setAntennaMode);
  const setManualAntennaAngles = useSimulationStore((s) => s.setManualAntennaAngles);
  const setDroneConfig = useSimulationStore((s) => s.setDroneConfig);
  const setAgronomicOp = useSimulationStore((s) => s.setAgronomicOp);
  const toggleIrrigation = useSimulationStore((s) => s.toggleIrrigation);
  const buildMissionPlanNow = useSimulationStore((s) => s.buildMissionPlanNow);
  const startDroneFlightNow = useSimulationStore((s) => s.startDroneFlightNow);
  const runSpectralAnalysisNow = useSimulationStore((s) => s.runSpectralAnalysisNow);
  const setOperatorSafetyApproved = useSimulationStore((s) => s.setOperatorSafetyApproved);

  // Compact tab filter inside OPERASYON_MERKEZI to prevent vertical wall-of-text clutter
  const [opsFocus, setOpsFocus] = useState<'ALL' | 'SAT_RF' | 'AGRO_DRONE'>('ALL');

  const sat = SATELLITE_PROFILES[selectedSatelliteId];
  const hw = GROUND_STATION_HARDWARE[hardwareId];
  const passCurve = generatePassCurve(sat);

  const isOpsCenter = activeNav === 'OPERASYON_MERKEZI';
  const showSatSection =
    (isOpsCenter && opsFocus !== 'AGRO_DRONE') ||
    activeNav === 'UYDU_YORUNGE' ||
    activeNav === 'VERI_ALIMI';
  const showGroundSection =
    (isOpsCenter && opsFocus !== 'AGRO_DRONE') ||
    activeNav === 'YER_ISTASYONU' ||
    activeNav === 'VERI_ALIMI';
  const showAgroSection =
    (isOpsCenter && opsFocus !== 'SAT_RF') ||
    activeNav === 'DRONE_GOREV_PLANLAMA' ||
    activeNav === 'CANLI_OPERASYON';

  const handleOpSelect = (op: AgronomicOperationType) => {
    if (op === 'IRRIGATION') toggleIrrigation();
    else setAgronomicOp(op);
  };

  return (
    <aside className="w-68 xl:w-76 shrink-0 agromax-panel border-l border-slate-800/90 overflow-y-auto p-2.5 space-y-2.5 select-none">
      {/* Compact Focus Filter inside Operations Center */}
      {isOpsCenter && (
        <div className="flex items-center agromax-inset border border-slate-800 rounded p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setOpsFocus('ALL')}
            className={`flex-1 py-1 rounded font-medium transition-colors ${
              opsFocus === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Özet
          </button>
          <button
            type="button"
            onClick={() => setOpsFocus('SAT_RF')}
            className={`flex-1 py-1 rounded font-medium transition-colors ${
              opsFocus === 'SAT_RF' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Uydu &amp; RF
          </button>
          <button
            type="button"
            onClick={() => setOpsFocus('AGRO_DRONE')}
            className={`flex-1 py-1 rounded font-medium transition-colors ${
              opsFocus === 'AGRO_DRONE' ? 'bg-slate-800 text-emerald-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Müdahale &amp; İHA
          </button>
        </div>
      )}

      {/* 1. Satellite Profile & Data Source */}
      {showSatSection && (
        <section className="space-y-2 pb-3 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Satellite className="w-3.5 h-3.5 text-cyan-400" />
              <span>Uydu Kaynağı &amp; Yörünge</span>
            </h2>
            <span className="text-[10px] font-mono-tabular text-slate-400">
              {orbit.isAboveHorizon ? 'UFUK ÜSTÜ' : 'UFUK ALTI'}
            </span>
          </div>

          <select
            value={selectedSatelliteId}
            onChange={(e) => selectSatellite(e.target.value as SatelliteId)}
            className="w-full bg-[#0f172a] border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
          >
            {Object.values(SATELLITE_PROFILES).map((p) => (
              <option key={p.id} value={p.id}>
                {p.shortName} ({p.band === 'X_BAND' ? 'X-Band' : 'Ku-Band'})
              </option>
            ))}
          </select>

          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="agromax-inset border border-slate-800/90 rounded p-1.5">
              <div className="text-[10px] text-slate-400">Elevasyon</div>
              <div className="text-xs font-mono-tabular font-semibold text-slate-100">
                {orbit.elevationDeg.toFixed(1)}°
              </div>
            </div>
            <div className="agromax-inset border border-slate-800/90 rounded p-1.5">
              <div className="text-[10px] text-slate-400">Azimut</div>
              <div className="text-xs font-mono-tabular font-semibold text-slate-100">
                {orbit.azimuthDeg.toFixed(1)}°
              </div>
            </div>
            <div className="agromax-inset border border-slate-800/90 rounded p-1.5">
              <div className="text-[10px] text-slate-400">Menzil</div>
              <div className="text-xs font-mono-tabular font-semibold text-slate-100">
                {Math.round(orbit.slantRangeKm)} km
              </div>
            </div>
          </div>

          {!isOpsCenter && (
            <div className="bg-[#080d16] border border-slate-800/80 rounded p-2 space-y-1 text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Yörünge / Bant:</span>
                <span className="text-slate-200">{sat.orbitType} · {sat.frequencyGHz} GHz</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Donanım Uyumu:</span>
                <span className={`font-semibold ${rf.hardwareCompatible ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {rf.hardwareCompatible ? 'UYUMLU' : 'UYUMLU DEĞİL'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Gerçek Bağlantı:</span>
                <span className="font-mono-tabular text-amber-400">Bağlı değil</span>
              </div>
            </div>
          )}

          {!rf.hardwareCompatible && (
            <div className="bg-rose-950/50 border border-rose-500/40 rounded p-2 text-[11px] text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Donanım Bandı Uyumsuzluğu</div>
                <p className="mt-0.5 text-rose-300/90">{rf.incompatibilityReason}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 2. Ground Station Dish & RF Acquisition */}
      {showGroundSection && (
        <section className="space-y-2 pb-3 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>Yer İstasyonu &amp; RF Alıcı</span>
            </h2>
            <span className="text-[11px] font-mono-tabular text-cyan-400">
              {hw.dishDiameterM} m Anten
            </span>
          </div>

          <select
            value={hardwareId}
            onChange={(e) => selectHardware(e.target.value as GroundStationHardwareId)}
            className="w-full bg-[#0f172a] border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
          >
            {Object.values(GROUND_STATION_HARDWARE).map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>

          <div className="agromax-inset border border-slate-800/90 rounded p-2 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Yönlendirme</span>
              <div className="flex bg-[#0f172a] border border-slate-800 rounded p-0.5">
                <button
                  type="button"
                  onClick={() => setAntennaMode('AUTO')}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                    antennaMode === 'AUTO' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                  }`}
                >
                  Otomatik
                </button>
                <button
                  type="button"
                  onClick={() => setAntennaMode('MANUAL')}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                    antennaMode === 'MANUAL' ? 'bg-amber-600 text-white' : 'text-slate-400'
                  }`}
                >
                  Manuel
                </button>
              </div>
            </div>

            {antennaMode === 'MANUAL' && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <div className="flex justify-between text-slate-400">
                    <span>Azimut</span>
                    <span className="font-mono-tabular text-slate-200">{antennaAzDeg.toFixed(0)}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={manualTargetAzDeg}
                    onChange={(e) => setManualAntennaAngles(Number(e.target.value), manualTargetElDeg)}
                    className="w-full accent-amber-500 mt-0.5"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-slate-400">
                    <span>Elevasyon</span>
                    <span className="font-mono-tabular text-slate-200">{antennaElDeg.toFixed(0)}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    value={manualTargetElDeg}
                    onChange={(e) => setManualAntennaAngles(manualTargetAzDeg, Number(e.target.value))}
                    className="w-full accent-amber-500 mt-0.5"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1 border-t border-slate-800/80">
              <div className="flex justify-between">
                <span className="text-slate-400">SNR:</span>
                <span className={`font-mono-tabular font-medium ${rf.snrDb >= 7 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {rf.snrDb.toFixed(1)} dB
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Veri:</span>
                <span className="font-mono-tabular text-cyan-300">
                  {rf.receivedMb.toFixed(0)}/{rf.totalExpectedMb} MB
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Hız:</span>
                <span className="font-mono-tabular text-slate-200">{rf.dataRateMbps.toFixed(1)} Mbps</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Kayıp:</span>
                <span className={`font-mono-tabular ${rf.packetLossPct > 5 ? 'text-rose-400' : 'text-slate-200'}`}>
                  %{rf.packetLossPct.toFixed(1)}
                </span>
              </div>
            </div>
          </div>

          {!isOpsCenter && (
            <div className="bg-[#080d16] border border-slate-800/80 rounded p-2">
              <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                <span>Geçiş Elevasyon Profili</span>
                <span className="font-mono-tabular">{orbit.aosTimeLabel} → {orbit.losTimeLabel}</span>
              </div>
              <svg viewBox="0 0 240 48" className="w-full h-12 overflow-visible">
                <line x1="0" y1="42" x2="240" y2="42" stroke="#1e293b" strokeWidth="1" />
                <polyline
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="1.5"
                  points={passCurve
                    .map((p) => `${(p.phasePct / 100) * 240},${42 - (Math.max(0, p.elevationDeg) / 90) * 36}`)
                    .join(' ')}
                />
                <circle
                  cx={orbit.passProgress * 240}
                  cy={42 - (Math.max(0, orbit.elevationDeg) / 90) * 36}
                  r="3"
                  fill="#f59e0b"
                />
              </svg>
            </div>
          )}

          {activeNav === 'VERI_ALIMI' && (
            <div className="bg-[#080d16] border border-slate-800/80 rounded p-2 space-y-1">
              <div className="text-[11px] font-semibold text-slate-300 mb-1">
                Haberleşme Durum Makinesi (11 Aşama)
              </div>
              {ACQ_LABELS.map((st, idx) => {
                const currentIdx = ACQ_LABELS.findIndex((x) => x.id === acquisitionStage);
                const isDone = currentIdx > idx || acquisitionStage === 'AGROMAX_INGESTION';
                const isCurr = st.id === acquisitionStage;
                return (
                  <div
                    key={st.id}
                    className={`flex items-center justify-between text-[11px] px-1.5 py-0.5 rounded ${
                      isCurr
                        ? 'bg-cyan-500/20 text-cyan-200 font-medium'
                        : isDone
                          ? 'text-emerald-400'
                          : 'text-slate-500'
                    }`}
                  >
                    <span>{st.label}</span>
                    <span className="font-mono-tabular text-[10px]">
                      {isDone ? '✓' : isCurr ? 'AKTİF' : '·'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {acquisitionStage === 'AGROMAX_INGESTION' && !spectralAnalysis && (
            <button
              type="button"
              onClick={runSpectralAnalysisNow}
              className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded transition-colors"
            >
              Multispektral Analizi Başlat
            </button>
          )}
        </section>
      )}

      {/* 3. Agronomic Field Interventions (İlaçlama, Sulama, Gübreleme) */}
      {showAgroSection && (
        <section className="space-y-2 pb-3 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Sprout className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tarımsal Müdahale</span>
            </h2>
            <span className="text-[10px] font-mono-tabular text-cyan-300">
              {irrigationActive ? 'SULAMA AÇIK' : agronomicOp === 'SPRAYING' ? 'İLAÇLAMA' : agronomicOp === 'FERTILIZATION' ? 'GÜBRELEME' : 'GÖZLEM'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => handleOpSelect('INSPECTION')}
              className={`px-2 py-1.5 rounded border text-left transition-colors ${
                agronomicOp === 'INSPECTION'
                  ? 'bg-slate-800 border-slate-600 text-white font-medium'
                  : 'bg-[#080d16] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div>Gözlem Uçuşu</div>
              <div className="text-[10px] text-slate-400">NDVI / NDMI Tarama</div>
            </button>
            <button
              type="button"
              onClick={() => handleOpSelect('SPRAYING')}
              className={`px-2 py-1.5 rounded border text-left transition-colors ${
                agronomicOp === 'SPRAYING'
                  ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200 font-medium'
                  : 'bg-[#080d16] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div>İlaçlama (VRA)</div>
              <div className="text-[10px] font-mono-tabular text-emerald-400">Bölge B · 18 L/ha</div>
            </button>
            <button
              type="button"
              onClick={() => handleOpSelect('IRRIGATION')}
              className={`px-2 py-1.5 rounded border text-left transition-colors ${
                irrigationActive
                  ? 'bg-cyan-950/60 border-cyan-500/60 text-cyan-200 font-medium'
                  : 'bg-[#080d16] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-1">
                <Droplets className="w-3 h-3 text-cyan-400" />
                <span>Sulama Sistemi</span>
              </div>
              <div className="text-[10px] font-mono-tabular text-cyan-400">Bölge C · 16 mm</div>
            </button>
            <button
              type="button"
              onClick={() => handleOpSelect('FERTILIZATION')}
              className={`px-2 py-1.5 rounded border text-left transition-colors ${
                agronomicOp === 'FERTILIZATION'
                  ? 'bg-amber-950/60 border-amber-500/60 text-amber-200 font-medium'
                  : 'bg-[#080d16] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div>Gübreleme (Azot)</div>
              <div className="text-[10px] font-mono-tabular text-amber-400">Bölge B/C · 22 kg/ha</div>
            </button>
          </div>

          {/* Live Resource Consumption & Field IoT Sensors */}
          <div className="agromax-inset border border-slate-800/90 rounded p-2 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between text-slate-400">
              <span>İHA Tankı / Rüzgar:</span>
              <span className="font-mono-tabular text-slate-200">
                %{drone.payloadTankPct.toFixed(0)} · {windSpeedMs} m/s
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Uygulanan Girdi:</span>
              <span className="font-mono-tabular text-emerald-300">
                {drone.appliedSprayLiters.toFixed(1)} L · {drone.appliedFertilizerKg.toFixed(1)} kg · {appliedIrrigationM3.toFixed(1)} m³
              </span>
            </div>
            <div className="pt-1 border-t border-slate-800/80 grid grid-cols-3 gap-1 text-center">
              {soilSensors.map((sens) => (
                <div key={sens.id} className="bg-[#0b1220] border border-slate-800 rounded px-1 py-1">
                  <div className="text-[10px] text-slate-400">{sens.zoneCode}</div>
                  <div className="font-mono-tabular font-semibold text-cyan-300">
                    %{sens.soilMoisturePct.toFixed(1)}
                  </div>
                  <div className="text-[9px] font-mono-tabular text-slate-500">{sens.nitrogenPpm} ppm N</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 4. Drone Mission Planning & Telemetry */}
      {showAgroSection && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-cyan-400" />
              <span>İHA Görev &amp; Telemetri</span>
            </h2>
            <span className="text-[10px] font-mono-tabular text-emerald-400">
              {drone.flightMode.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="agromax-inset border border-slate-800/90 rounded p-2 space-y-2 text-xs">
            <select
              value={selectedDroneProfileId}
              onChange={(e) => setDroneConfig({ selectedDroneProfileId: e.target.value as DroneProfileId })}
              className="w-full bg-[#0f172a] border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
            >
              {Object.values(DRONE_PROFILES).map((dp) => (
                <option key={dp.id} value={dp.id}>
                  {dp.name}
                </option>
              ))}
            </select>

            <select
              value={selectedMissionType}
              onChange={(e) => setDroneConfig({ selectedMissionType: e.target.value as MissionType })}
              className="w-full bg-[#0f172a] border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
            >
              <option value="TARGET_INSPECTION">Hedef Bölge İncelemesi</option>
              <option value="AREA_SCAN">Alan Tarama (Boustrophedon)</option>
              <option value="PHOTOGRAMMETRY">Fotogrametri Uçuşu</option>
              <option value="VERIFICATION_FLIGHT">Kontrol Uçuşu</option>
              <option value="SIMULATED_VARIABLE_RATE">Değişken Oranlı İlaçlama/Gübreleme</option>
            </select>

            {!isOpsCenter && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>İrtifa</span>
                    <span className="font-mono-tabular text-slate-200">{missionAltitudeM} m</span>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={110}
                    value={missionAltitudeM}
                    onChange={(e) => setDroneConfig({ missionAltitudeM: Number(e.target.value) })}
                    className="w-full accent-cyan-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Örtüşme</span>
                    <span className="font-mono-tabular text-slate-200">%{missionOverlapPct}</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={88}
                    value={missionOverlapPct}
                    onChange={(e) => setDroneConfig({ missionOverlapPct: Number(e.target.value) })}
                    className="w-full accent-cyan-500"
                  />
                </div>
              </div>
            )}

            {operationMode === 'REAL_DATA' && (
              <label className="flex items-center gap-2 text-[11px] text-amber-300 pt-0.5">
                <input
                  type="checkbox"
                  checked={operatorSafetyApproved}
                  onChange={(e) => setOperatorSafetyApproved(e.target.checked)}
                />
                <span>Gerçek Donanım Emniyet Onayı</span>
              </label>
            )}

            <div className="flex gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={buildMissionPlanNow}
                className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-medium rounded flex items-center justify-center gap-1 transition-colors"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Planla</span>
              </button>
              <button
                type="button"
                onClick={startDroneFlightNow}
                disabled={!missionPlan || !missionPlan.isFeasible}
                className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-medium rounded flex items-center justify-center gap-1 transition-colors"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Uçuşu Başlat</span>
              </button>
            </div>
          </div>

          {missionPlan && (
            <div
              className={`border rounded p-2 text-[11px] space-y-0.5 ${
                missionPlan.isFeasible
                  ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              }`}
            >
              <div className="font-semibold flex items-center gap-1.5">
                {missionPlan.isFeasible ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                )}
                <span className="truncate">{missionPlan.name}</span>
              </div>
              <p className="text-slate-300">{missionPlan.feasibilityReason}</p>
            </div>
          )}

          {/* Compact Live Drone Telemetry */}
          <div className="agromax-inset border border-slate-800/90 rounded p-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">İrtifa:</span>
              <span className="font-mono-tabular text-cyan-300">{drone.altitudeM.toFixed(1)} m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Hız:</span>
              <span className="font-mono-tabular text-slate-200">{drone.groundSpeedMs.toFixed(1)} m/s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Batarya:</span>
              <span className={`font-mono-tabular font-semibold ${drone.batteryPct <= 22 ? 'text-rose-400' : 'text-emerald-400'}`}>
                %{drone.batteryPct.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Kare:</span>
              <span className="font-mono-tabular text-emerald-300 font-semibold">{drone.photosCollected}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">GPS:</span>
              <span className="font-mono-tabular text-emerald-400">{drone.gpsFix}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Bağlantı:</span>
              <span className={`font-mono-tabular ${drone.linkConnected ? 'text-cyan-300' : 'text-rose-400'}`}>
                {drone.linkConnected ? `%${drone.linkQualityPct}` : 'KOPUK'}
              </span>
            </div>
          </div>
        </section>
      )}
    </aside>
  );
};
