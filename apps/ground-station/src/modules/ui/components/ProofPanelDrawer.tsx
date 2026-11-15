import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Radio, ShieldCheck, X } from 'lucide-react';
import { SATELLITE_PROFILES } from '../../shared/catalog';
import { useSimulationStore } from '../../telemetry/simulationStore';

interface ProofPanelDrawerProps {
  onClose?: () => void;
  embedded?: boolean;
}

function deterministicChecksum(satId: string, mb: number, faults: string[]): string {
  let h = 0x811c9dc5;
  const str = `${satId}:${mb.toFixed(1)}:${faults.join(',')}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `CCSDS-${(h >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

// Deterministic terrain reflectance sampler matching spectralEngine zones (Bölge A/B/C/D)
function sampleParcelPixelRgb(u: number, v: number, hasCloudFault: boolean): [number, number, number] {
  const distB = Math.hypot(u - 0.72, v - 0.30);
  const distC = Math.hypot(u - 0.28, v - 0.72);
  const distCloud = Math.hypot(u - 0.68, v - 0.70);
  const cloudRadius = hasCloudFault ? 0.24 : 0.13;

  if (distCloud < cloudRadius) {
    return [226, 232, 240];
  }
  const furrow = ((Math.floor(u * 64) % 2) === 0 ? 6 : -6);
  if (distB < 0.15) {
    // Low NDVI chlorosis / canopy stress
    const k = 1 - distB / 0.15;
    return [
      Math.min(255, Math.round(78 + k * 74 + furrow)),
      Math.min(255, Math.round(108 + k * 14 + furrow)),
      Math.max(0, Math.round(52 - k * 8)),
    ];
  }
  if (distC < 0.16) {
    // Low NDMI moisture stress (drier olive-ochre soil)
    const k = 1 - distC / 0.16;
    return [
      Math.min(255, Math.round(82 + k * 66 + furrow)),
      Math.min(255, Math.round(112 - k * 6 + furrow)),
      Math.max(0, Math.round(54 + k * 6)),
    ];
  }
  // Healthy winter wheat / maize canopy
  return [56 + furrow, 114 + furrow, 48];
}

export const ProofPanelDrawer: React.FC<ProofPanelDrawerProps> = ({ onClose, embedded = false }) => {
  const [tab, setTab] = useState<'RF_SCANLINE' | 'DRONE_FPV'>('RF_SCANLINE');

  const selectedSatelliteId = useSimulationStore((s) => s.selectedSatelliteId);
  const orbit = useSimulationStore((s) => s.orbit);
  const rf = useSimulationStore((s) => s.rf);
  const acquisitionStage = useSimulationStore((s) => s.acquisitionStage);
  const activeFaults = useSimulationStore((s) => s.activeFaults);
  const drone = useSimulationStore((s) => s.drone);
  const agronomicOp = useSimulationStore((s) => s.agronomicOp);
  const irrigationActive = useSimulationStore((s) => s.irrigationActive);

  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fpvCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const sat = SATELLITE_PROFILES[selectedSatelliteId];
  const hasPacketLoss = activeFaults.includes('PACKET_LOSS');
  const hasCloudFault = activeFaults.includes('HIGH_CLOUD_COVER');
  const frameHash = useMemo(
    () => deterministicChecksum(selectedSatelliteId, rf.receivedMb, activeFaults),
    [selectedSatelliteId, rf.receivedMb, activeFaults],
  );

  // 1. Progressive Row-by-Row Satellite Frame Assembly Canvas
  useEffect(() => {
    if (tab !== 'RF_SCANLINE') return;
    const canvas = scanCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#050911';
    ctx.fillRect(0, 0, w, h);

    // Subtle unreceived telemetry grid
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.55)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const totalRows = 64;
    const revealedRows = Math.round((Math.min(100, rf.completionPct) / 100) * totalRows);
    const rowH = h / totalRows;
    const colW = w / 64;

    for (let row = 0; row < revealedRows; row++) {
      // Simulate corrupted / dropped CCSDS scanline frames under PACKET_LOSS
      const corruptedRow = hasPacketLoss && ((row * 7 + 3) % 10 < 3);
      if (corruptedRow) {
        ctx.fillStyle = 'rgba(225, 29, 72, 0.65)';
        ctx.fillRect(0, row * rowH, w, Math.ceil(rowH));
        continue;
      }
      for (let col = 0; col < 64; col++) {
        const [r, g, b] = sampleParcelPixelRgb(col / 63, row / 63, hasCloudFault);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(col * colW, row * rowH, Math.ceil(colW), Math.ceil(rowH));
      }
    }

    // Active scanline laser bar while receiving
    if (rf.completionPct > 0 && rf.completionPct < 100 && acquisitionStage === 'FRAME_RECEPTION') {
      const scanY = revealedRows * rowH;
      ctx.fillStyle = '#34d399';
      ctx.fillRect(0, Math.max(0, scanY - 1.5), w, 2.5);
    }
  }, [tab, rf.completionPct, acquisitionStage, hasPacketLoss, hasCloudFault]);

  // 2. Live Drone Gimbal Downward FPV Canvas
  useEffect(() => {
    if (tab !== 'DRONE_FPV') return;
    const canvas = fpvCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const uCenter = (drone.localX + 320) / 640;
    const vCenter = (drone.localZ + 290) / 580;

    // Ground footprint zooms in as altitude drops
    const viewSpan = Math.max(0.08, Math.min(0.45, 0.08 + (drone.altitudeM / 80) * 0.25));
    const step = 6;

    for (let py = 0; py < h; py += step) {
      for (let px = 0; px < w; px += step) {
        const u = Math.max(0, Math.min(1, uCenter + ((px / w) - 0.5) * viewSpan));
        const v = Math.max(0, Math.min(1, vCenter + ((py / h) - 0.5) * viewSpan));
        let [r, g, b] = sampleParcelPixelRgb(u, v, hasCloudFault);

        // Show irrigation pipe / wet soil strip around Bölge C (-140, 128 => u=0.28, v=0.72)
        if (Math.abs(v - 0.72) < 0.015 && Math.abs(u - 0.28) < 0.14) {
          r = 160;
          g = 178;
          b = 195;
        } else if (irrigationActive && Math.hypot(u - 0.28, v - 0.72) < 0.12) {
          r = Math.round(r * 0.72);
          g = Math.round(g * 0.85);
          b = Math.min(255, Math.round(b * 1.25));
        }

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(px, py, step, step);
      }
    }

    // Active spray swath overlay on FPV
    if ((agronomicOp === 'SPRAYING' || agronomicOp === 'FERTILIZATION') && drone.altitudeM > 1.5) {
      ctx.fillStyle = agronomicOp === 'FERTILIZATION' ? 'rgba(251, 191, 36, 0.22)' : 'rgba(56, 189, 248, 0.24)';
      ctx.fillRect(w * 0.25, h * 0.42, w * 0.5, h * 0.16);
    }

    // Precision Crosshair & Telemetry HUD
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 16, 0, Math.PI * 2);
    ctx.moveTo(w / 2 - 24, h / 2);
    ctx.lineTo(w / 2 - 8, h / 2);
    ctx.moveTo(w / 2 + 8, h / 2);
    ctx.lineTo(w / 2 + 24, h / 2);
    ctx.moveTo(w / 2, h / 2 - 24);
    ctx.lineTo(w / 2, h / 2 - 8);
    ctx.moveTo(w / 2, h / 2 + 8);
    ctx.lineTo(w / 2, h / 2 + 24);
    ctx.stroke();

    ctx.fillStyle = 'rgba(7, 11, 18, 0.78)';
    ctx.fillRect(6, 6, w - 12, 18);
    ctx.fillStyle = '#a7f3d0';
    ctx.font = '600 10px "IBM Plex Mono", monospace';
    ctx.fillText(
      `AGL ${drone.altitudeM.toFixed(1)}m · ${drone.groundSpeedMs.toFixed(1)}m/s · HDG ${drone.headingDeg.toFixed(0)}°`,
      12,
      18,
    );
  }, [tab, drone.localX, drone.localZ, drone.altitudeM, drone.groundSpeedMs, drone.headingDeg, agronomicOp, irrigationActive, hasCloudFault]);

  // Dynamic SVG FFT Power Spectrum points
  const spectrumPoints = useMemo(() => {
    const pts: string[] = [];
    const dopplerShiftPx = Math.max(-28, Math.min(28, orbit.dopplerKHz * 0.45));
    const center = 115 + dopplerShiftPx;
    const peakGain = rf.hardwareCompatible && orbit.isAboveHorizon ? Math.min(48, Math.max(4, rf.snrDb * 2.1)) : 3;

    for (let x = 0; x <= 230; x += 4) {
      const dist = Math.abs(x - center);
      const lobe = peakGain * Math.exp(-(dist * dist) / 95);
      const sideLobe = peakGain * 0.22 * Math.exp(-Math.pow(dist - 22, 2) / 36);
      const ripple = ((x * 13) % 5) * 0.65;
      const y = Math.max(6, 62 - lobe - sideLobe - ripple);
      pts.push(`${x},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [orbit.dopplerKHz, orbit.isAboveHorizon, rf.snrDb, rf.hardwareCompatible]);

  return (
    <div
      className={
        embedded
          ? 'bg-[#0b1220] border border-slate-800 rounded-md p-3 space-y-3'
          : 'w-[376px] max-w-[92vw] bg-[#0a101b] border border-slate-700 rounded-lg shadow-2xl p-3 space-y-2.5 text-xs text-slate-200'
      }
    >
      {/* Header + Tabs */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-[#080d16] border border-slate-800 rounded p-0.5 flex-1">
          <button
            type="button"
            onClick={() => setTab('RF_SCANLINE')}
            className={`flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
              tab === 'RF_SCANLINE' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-3 h-3" />
            <span>Uydu RF</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('DRONE_FPV')}
            className={`flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
              tab === 'DRONE_FPV' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-3 h-3" />
            <span>FPV ({drone.photosCollected})</span>
          </button>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {tab === 'RF_SCANLINE' ? (
        <div className="space-y-2.5">
          {/* Live FFT RF Spectrum */}
          <div className="bg-[#080d16] border border-slate-800 rounded p-2 space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-400 font-medium">Canlı RF Spektrum ({sat.frequencyGHz} GHz)</span>
              <span className={`font-mono-tabular font-semibold ${rf.carrierLocked ? 'text-emerald-400' : 'text-rose-400'}`}>
                {rf.carrierLocked ? `KİLİTLİ · ${rf.snrDb.toFixed(1)} dB` : 'KİLİT YOK'}
              </span>
            </div>
            <svg viewBox="0 0 230 70" className="w-full h-16 bg-[#050911] rounded border border-slate-800/80">
              <line x1="0" y1="62" x2="230" y2="62" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 2" />
              <line x1="115" y1="0" x2="115" y2="70" stroke="#1e293b" strokeWidth="1" />
              <polyline fill="none" stroke={rf.carrierLocked ? '#10b981' : '#f59e0b'} strokeWidth="1.6" points={spectrumPoints} />
              <text x="6" y="12" fill="#94a3b8" fontSize="8">
                Doppler: {orbit.dopplerKHz >= 0 ? '+' : ''}{orbit.dopplerKHz.toFixed(1)} kHz
              </text>
              <text x="224" y="12" fill="#94a3b8" fontSize="8" textAnchor="end">
                {rf.signalDbm.toFixed(0)} dBm
              </text>
            </svg>
          </div>

          {/* Progressive Satellite Scanline Proof */}
          <div className="bg-[#080d16] border border-slate-800 rounded p-2 space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-300 font-medium">Satır-Satır Ham Uydu İndirme</span>
              <span className="font-mono-tabular text-cyan-300">
                %{rf.completionPct.toFixed(0)} ({rf.receivedMb.toFixed(0)}/{rf.totalExpectedMb} MB)
              </span>
            </div>
            <canvas
              ref={scanCanvasRef}
              width={256}
              height={160}
              className="w-full h-36 rounded border border-slate-800 block"
            />
            <div className="flex items-center justify-between text-[10px] font-mono-tabular">
              <span className="flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="w-3 h-3" />
                <span>{frameHash}</span>
              </span>
              <span className={rf.packetLossPct > 5 ? 'text-rose-400' : 'text-slate-400'}>
                CRC Bütünlük: %{(100 - rf.packetLossPct).toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Live Drone Downward Gimbal Camera */}
          <div className="bg-[#080d16] border border-slate-800 rounded p-2 space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-300 font-medium">Canlı Gimbal Kamera (-90° Nadir)</span>
              <span className="font-mono-tabular text-cyan-300">
                {drone.lat.toFixed(5)}°, {drone.lon.toFixed(5)}°
              </span>
            </div>
            <canvas
              ref={fpvCanvasRef}
              width={280}
              height={150}
              className="w-full h-36 rounded border border-slate-800 block"
            />
          </div>

          {/* Geotagged Photo Evidence Strip */}
          <div className="bg-[#080d16] border border-slate-800 rounded p-2 space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-300 font-medium">Yakalanan Kanıt Kareleri</span>
              <span className="font-mono-tabular text-emerald-400">{drone.capturedPhotos.length} Adet</span>
            </div>
            {drone.capturedPhotos.length === 0 ? (
              <div className="text-[11px] text-slate-500 py-3 text-center">
                İHA görev noktalarına ulaştığında geotagged kanıt kareleri burada birikir.
              </div>
            ) : (
              <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                {drone.capturedPhotos.slice(-8).reverse().map((p, idx) => (
                  <div
                    key={`${p.timestamp}-${idx}`}
                    className="flex items-center justify-between gap-2 bg-[#0b1220] border border-slate-800 rounded px-2 py-1 text-[10px]"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="font-semibold text-slate-200 truncate">
                        {p.zone ?? 'Parsel Taraması'}
                      </span>
                    </div>
                    <span className="font-mono-tabular text-slate-400 shrink-0">
                      {p.lat.toFixed(4)}, {p.lon.toFixed(4)} · {p.timestamp}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
