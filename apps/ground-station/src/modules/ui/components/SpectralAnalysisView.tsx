import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Info, Layers } from 'lucide-react';
import { SpectralIndexType } from '../../shared/types';
import { useSimulationStore } from '../../telemetry/simulationStore';
import { ndmiColor, ndviColor } from '../three/textures';

const INDEX_OPTIONS: { id: SpectralIndexType; label: string; formula: string }[] = [
  { id: 'NDVI', label: 'NDVI', formula: '(NIR - RED) / (NIR + RED)' },
  { id: 'NDMI', label: 'NDMI', formula: '(NIR - SWIR) / (NIR + SWIR)' },
  { id: 'NDRE', label: 'NDRE', formula: '(NIR - RED_EDGE) / (NIR + RED_EDGE)' },
  { id: 'NDWI', label: 'NDWI', formula: '(GREEN - NIR) / (GREEN + NIR)' },
  { id: 'RGB', label: 'Doğal RGB', formula: 'B04 (R) · B03 (G) · B02 (B)' },
  { id: 'FALSE_COLOR', label: 'False Color', formula: 'NIR · RED · GREEN' },
  { id: 'CHANGE_DETECTION', label: 'Değişim Analizi', formula: 'ΔNDVI (Güncel - 10 Gün Önce)' },
];

export const SpectralAnalysisView: React.FC = () => {
  const spectralAnalysis = useSimulationStore((s) => s.spectralAnalysis);
  const activeSpectralIndex = useSimulationStore((s) => s.activeSpectralIndex);
  const setActiveSpectralIndex = useSimulationStore((s) => s.setActiveSpectralIndex);
  const rf = useSimulationStore((s) => s.rf);
  const runSpectralAnalysisNow = useSimulationStore((s) => s.runSpectralAnalysisNow);
  const buildMissionPlanNow = useSimulationStore((s) => s.buildMissionPlanNow);
  const setActiveNav = useSimulationStore((s) => s.setActiveNav);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; val: string; cloud: boolean } | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [splitPct, setSplitPct] = useState(50);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spectralAnalysis) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gw = spectralAnalysis.gridWidth;
    const gh = spectralAnalysis.gridHeight;
    const cellW = canvas.width / gw;
    const cellH = canvas.height / gh;

    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const idx = y * gw + x;
        let pixelColor = '';
        if (spectralAnalysis.cloudMask[idx] === 1) {
          pixelColor = '#cbd5e1';
        } else if (activeSpectralIndex === 'RGB') {
          const r = Math.min(255, Math.round(spectralAnalysis.red[idx] * 950));
          const g = Math.min(255, Math.round(spectralAnalysis.green[idx] * 950));
          const b = Math.min(255, Math.round(spectralAnalysis.blue[idx] * 950));
          pixelColor = `rgb(${r},${g},${b})`;
        } else if (activeSpectralIndex === 'FALSE_COLOR') {
          const r = Math.min(255, Math.round(spectralAnalysis.nir[idx] * 480));
          const g = Math.min(255, Math.round(spectralAnalysis.red[idx] * 900));
          const b = Math.min(255, Math.round(spectralAnalysis.green[idx] * 800));
          pixelColor = `rgb(${r},${g},${b})`;
        } else if (activeSpectralIndex === 'NDMI' || activeSpectralIndex === 'NDWI') {
          const baseVal = activeSpectralIndex === 'NDMI' ? spectralAnalysis.ndmi[idx] : spectralAnalysis.ndwi[idx];
          const isPost = compareMode && x / gw >= splitPct / 100;
          const boostedVal = isPost && baseVal < 0.28 ? Math.min(0.45, baseVal + 0.24) : baseVal;
          const [r, g, b] = ndmiColor(boostedVal);
          pixelColor = `rgb(${r},${g},${b})`;
        } else {
          const baseVal =
            activeSpectralIndex === 'NDRE'
              ? spectralAnalysis.ndre[idx] * 1.35
              : activeSpectralIndex === 'CHANGE_DETECTION'
                ? spectralAnalysis.changeDeltaNdvi[idx] + 0.55
                : spectralAnalysis.ndvi[idx];
          const isPost = compareMode && x / gw >= splitPct / 100;
          const boostedVal = isPost && baseVal < 0.62 ? Math.min(0.76, baseVal + 0.21) : baseVal;
          const [r, g, b] = ndviColor(boostedVal);
          pixelColor = `rgb(${r},${g},${b})`;
        }
        ctx.fillStyle = pixelColor;
        ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }

    if (compareMode) {
      const sx = (splitPct / 100) * canvas.width;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvas.height);
      ctx.stroke();

      ctx.fillStyle = 'rgba(7, 11, 18, 0.85)';
      ctx.fillRect(8, 8, 112, 20);
      ctx.fillRect(canvas.width - 134, 8, 126, 20);
      ctx.fillStyle = '#fbbf24';
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('MÜDAHALE ÖNCESİ', 14, 21);
      ctx.fillStyle = '#34d399';
      ctx.fillText('MÜDAHALE SONRASI', canvas.width - 128, 21);
    }

    // Draw zone annotations
    spectralAnalysis.priorityZones.forEach((z) => {
      const cx = z.centerNormalized[0] * canvas.width;
      const cy = z.centerNormalized[1] * canvas.height;
      ctx.strokeStyle =
        z.category === 'NORMAL'
          ? '#10b981'
          : z.category === 'LOW_NDVI'
            ? '#f59e0b'
            : z.category === 'LOW_NDMI'
              ? '#06b6d4'
              : '#f8fafc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(7, 11, 18, 0.82)';
      ctx.fillRect(cx - 28, cy - 10, 56, 18);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(z.code, cx, cy + 3);
    });
  }, [spectralAnalysis, activeSpectralIndex, compareMode, splitPct]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!spectralAnalysis || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = Math.floor(((e.clientX - rect.left) / rect.width) * spectralAnalysis.gridWidth);
    const py = Math.floor(((e.clientY - rect.top) / rect.height) * spectralAnalysis.gridHeight);
    if (px < 0 || py < 0 || px >= spectralAnalysis.gridWidth || py >= spectralAnalysis.gridHeight) return;

    const idx = py * spectralAnalysis.gridWidth + px;
    const isCloud = spectralAnalysis.cloudMask[idx] === 1;
    let valText = 'Bulut / Geçersiz';
    if (!isCloud) {
      if (activeSpectralIndex === 'NDVI') valText = `NDVI: ${spectralAnalysis.ndvi[idx].toFixed(3)}`;
      else if (activeSpectralIndex === 'NDMI') valText = `NDMI: ${spectralAnalysis.ndmi[idx].toFixed(3)}`;
      else if (activeSpectralIndex === 'NDRE') valText = `NDRE: ${spectralAnalysis.ndre[idx].toFixed(3)}`;
      else if (activeSpectralIndex === 'NDWI') valText = `NDWI: ${spectralAnalysis.ndwi[idx].toFixed(3)}`;
      else if (activeSpectralIndex === 'CHANGE_DETECTION') valText = `ΔNDVI: ${spectralAnalysis.changeDeltaNdvi[idx].toFixed(3)}`;
      else valText = `NIR: ${spectralAnalysis.nir[idx].toFixed(2)} · RED: ${spectralAnalysis.red[idx].toFixed(2)}`;
    }
    setHoverInfo({ x: px, y: py, val: valText, cloud: isCloud });
  };

  if (!spectralAnalysis) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#070b12] p-6">
        <div className="max-w-lg w-full bg-[#0b1220] border border-slate-800 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-amber-400">
            <Layers className="w-5 h-5" />
            <h2 className="text-base font-semibold text-slate-100">
              Multispektral Görüntü İşleme Motoru Beklemede
            </h2>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Bilimsel işleme hattı kuralı gereği, uydu veri alımı ve yerel sunucu aktarımı tamamlanmadan
            NDVI / NDMI analiz sonuçları üretilmez.
          </p>
          <div className="bg-[#080d16] border border-slate-800 rounded p-3 text-xs font-mono-tabular flex justify-between">
            <span className="text-slate-400">Mevcut Veri Transferi:</span>
            <span className="text-cyan-300">
              {rf.receivedMb.toFixed(1)} / {rf.totalExpectedMb} MB (%{rf.completionPct.toFixed(0)})
            </span>
          </div>
          <button
            type="button"
            onClick={runSpectralAnalysisNow}
            disabled={rf.completionPct < 100}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-medium rounded transition-colors"
          >
            {rf.completionPct >= 100
              ? 'Multispektral Analizi Şimdi Çalıştır'
              : 'Önce Uydu Veri Alımını Tamamlayın (Simülasyonu Başlat / Sonraki Aşama)'}
          </button>
        </div>
      </div>
    );
  }

  const activeFormula = INDEX_OPTIONS.find((o) => o.id === activeSpectralIndex)?.formula ?? '';

  return (
    <div className="w-full h-full overflow-y-auto p-4 bg-[#070b12] space-y-4">
      {/* Header & Index Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Multispektral Görüntü İşleme & Tarımsal İndeks Analizi
          </h2>
          <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-2">
            <span>{spectralAnalysis.sourceSatelliteName}</span>
            <span>·</span>
            <span className="font-mono-tabular">Çözünürlük: {spectralAnalysis.spatialResolutionM} m</span>
            <span>·</span>
            <span className="font-mono-tabular">Tarih: {spectralAnalysis.acquisitionTimestamp}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-[#0b1220] border border-slate-800 rounded p-1">
          {INDEX_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setActiveSpectralIndex(opt.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                activeSpectralIndex === opt.id
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Raster Map + Summary Metrics */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6 bg-[#0b1220] border border-slate-800 rounded-md p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-slate-200">{activeSpectralIndex} Katman Görünümü</span>
            <div className="flex items-center gap-2">
              <span className="font-mono-tabular text-[11px] text-cyan-300">{activeFormula}</span>
              <button
                type="button"
                onClick={() => setCompareMode((v) => !v)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  compareMode
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-[#080d16] border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {compareMode ? 'Karşılaştırmayı Kapat' : 'Öncesi / Sonrası'}
              </button>
            </div>
          </div>

          <div className="relative bg-[#080d16] border border-slate-800 rounded overflow-hidden">
            <canvas
              ref={canvasRef}
              width={440}
              height={400}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverInfo(null)}
              className="w-full h-auto cursor-crosshair block"
            />
            {hoverInfo && (
              <div className="absolute bottom-2 left-2 bg-[#070b12]/95 border border-slate-700 rounded px-2.5 py-1 text-[11px] font-mono-tabular text-slate-100">
                Piksel ({hoverInfo.x}, {hoverInfo.y}) · {hoverInfo.val}
              </div>
            )}
          </div>

          {compareMode && (
            <div className="flex items-center gap-3 pt-1 text-[11px]">
              <span className="text-amber-300 font-medium whitespace-nowrap">Müdahale Öncesi</span>
              <input
                type="range"
                min={10}
                max={90}
                value={splitPct}
                onChange={(e) => setSplitPct(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <span className="text-emerald-300 font-medium whitespace-nowrap">Sonrası (Öngörü)</span>
            </div>
          )}
        </div>

        {/* Summary KPIs & Priority Zones */}
        <div className="col-span-12 lg:col-span-6 space-y-3">
          {/* Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-[#0b1220] border border-slate-800 rounded p-2.5">
              <div className="text-[11px] text-slate-400">Ort. NDVI</div>
              <div className="text-lg font-mono-tabular font-semibold text-emerald-400">
                {spectralAnalysis.meanNdvi}
              </div>
              <div className="text-[10px] font-mono-tabular text-slate-500">
                {spectralAnalysis.minNdvi} – {spectralAnalysis.maxNdvi}
              </div>
            </div>
            <div className="bg-[#0b1220] border border-slate-800 rounded p-2.5">
              <div className="text-[11px] text-slate-400">Ort. NDMI</div>
              <div className="text-lg font-mono-tabular font-semibold text-cyan-400">
                {spectralAnalysis.meanNdmi}
              </div>
              <div className="text-[10px] font-mono-tabular text-slate-500">
                Düşük Nem: %{spectralAnalysis.ndmiDistribution.lowPct}
              </div>
            </div>
            <div className="bg-[#0b1220] border border-slate-800 rounded p-2.5">
              <div className="text-[11px] text-slate-400">Bulut Oranı</div>
              <div className={`text-lg font-mono-tabular font-semibold ${spectralAnalysis.cloudCoverPct > 25 ? 'text-amber-400' : 'text-slate-100'}`}>
                %{spectralAnalysis.cloudCoverPct}
              </div>
              <div className="text-[10px] font-mono-tabular text-slate-500">
                {spectralAnalysis.validPixelCount}/{spectralAnalysis.totalPixelCount} geçerli px
              </div>
            </div>
            <div className="bg-[#0b1220] border border-slate-800 rounded p-2.5">
              <div className="text-[11px] text-slate-400">Güvenilirlik</div>
              <div
                className={`text-lg font-semibold ${
                  spectralAnalysis.reliabilityLabel === 'YÜKSEK'
                    ? 'text-emerald-400'
                    : spectralAnalysis.reliabilityLabel === 'ORTA'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }`}
              >
                {spectralAnalysis.reliabilityLabel}
              </div>
              <div className="text-[10px] text-slate-400 truncate" title={spectralAnalysis.reliabilityNote}>
                {spectralAnalysis.reliabilityNote}
              </div>
            </div>
          </div>

          {/* Priority Zones A/B/C/D */}
          <div className="bg-[#0b1220] border border-slate-800 rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-200">
                Öncelikli İncelenmesi Önerilen Bölgeler
              </h3>
              <button
                type="button"
                onClick={() => {
                  buildMissionPlanNow();
                  setActiveNav('DRONE_GOREV_PLANLAMA');
                }}
                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium rounded transition-colors"
              >
                <span>Drone Görevine Aktar</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-2">
              {spectralAnalysis.priorityZones.map((z) => (
                <div key={z.id} className="bg-[#080d16] border border-slate-800 rounded p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-100">
                      {z.code} — {z.label}
                    </span>
                    <span
                      className={`text-[10px] font-mono-tabular font-semibold ${
                        z.priority === 'YÜKSEK'
                          ? 'text-amber-400'
                          : z.priority === 'ORTA'
                            ? 'text-cyan-400'
                            : 'text-emerald-400'
                      }`}
                    >
                      ÖNCELİK: {z.priority}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{z.rationale}</p>
                  <div className="flex flex-wrap gap-3 text-[11px] font-mono-tabular text-slate-300 pt-0.5">
                    <span>NDVI: {z.category === 'CLOUD_UNCERTAIN' ? 'Maskeli' : z.meanNdvi}</span>
                    <span>NDMI: {z.category === 'CLOUD_UNCERTAIN' ? 'Maskeli' : z.meanNdmi}</span>
                    <span>Alan: {z.areaHectares} ha</span>
                  </div>
                  <div className="pt-1 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-emerald-300 font-medium">{z.prescription.treatmentLabel}</span>
                    <span className="font-mono-tabular text-cyan-300">
                      {[
                        z.prescription.sprayLitersPerHa > 0 ? `İlaç: ${z.prescription.sprayLitersPerHa} L/ha` : null,
                        z.prescription.irrigationMm > 0 ? `Sulama: ${z.prescription.irrigationMm} mm` : null,
                        z.prescription.fertilizerKgPerHa > 0 ? `Gübre: ${z.prescription.fertilizerKgPerHa} kg/ha` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Müdahale Gerekmiyor'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scientific Accuracy Caveats & Spectral Band Signature */}
          <div className="bg-[#0b1220] border border-slate-800 rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-cyan-300">
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                <span>Spektral Yansıma İmzası (Bant Eğrisi)</span>
              </span>
              <span className="text-[10px] font-mono-tabular text-slate-400">
                A (Sağlıklı) · B (Düşük NDVI) · C (Kuru)
              </span>
            </div>
            {(() => {
              const gw = spectralAnalysis.gridWidth;
              const gh = spectralAnalysis.gridHeight;
              const sampleSig = (u: number, v: number) => {
                const px = Math.max(0, Math.min(gw - 1, Math.round(u * (gw - 1))));
                const py = Math.max(0, Math.min(gh - 1, Math.round(v * (gh - 1))));
                const idx = py * gw + px;
                return [
                  spectralAnalysis.blue[idx],
                  spectralAnalysis.green[idx],
                  spectralAnalysis.red[idx],
                  spectralAnalysis.redEdge[idx],
                  spectralAnalysis.nir[idx],
                  spectralAnalysis.swir[idx],
                ];
              };
              const sigA = sampleSig(0.24, 0.25);
              const sigB = sampleSig(0.72, 0.3);
              const sigC = sampleSig(0.28, 0.72);
              const toPts = (arr: number[]) =>
                arr.map((v, i) => `${16 + i * 52},${64 - Math.min(0.6, v) * 95}`).join(' ');
              const labels = ['B2 Blue', 'B3 Grn', 'B4 Red', 'B5 RE', 'B8 NIR', 'B11 SWIR'];
              return (
                <div className="bg-[#080d16] border border-slate-800 rounded p-2">
                  <svg viewBox="0 0 295 78" className="w-full h-20">
                    <line x1="12" y1="64" x2="282" y2="64" stroke="#1e293b" strokeWidth="1" />
                    <polyline fill="none" stroke="#10b981" strokeWidth="1.8" points={toPts(sigA)} />
                    <polyline fill="none" stroke="#f59e0b" strokeWidth="1.8" points={toPts(sigB)} />
                    <polyline fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeDasharray="3 2" points={toPts(sigC)} />
                    {labels.map((lb, i) => (
                      <text key={lb} x={16 + i * 52} y={74} fill="#94a3b8" fontSize="8" textAnchor="middle">
                        {lb}
                      </text>
                    ))}
                  </svg>
                </div>
              );
            })()}

            <ul className="space-y-1 text-[11px] text-slate-400 pt-1">
              {spectralAnalysis.scientificCaveats.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  {i === 0 ? <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />}
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
