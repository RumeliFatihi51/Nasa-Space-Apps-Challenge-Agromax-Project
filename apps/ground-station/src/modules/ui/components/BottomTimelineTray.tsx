import React, { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  FileText,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
} from 'lucide-react';
import { FAULT_SCENARIOS } from '../../shared/catalog';
import { useSimulationStore } from '../../telemetry/simulationStore';

const SPEED_OPTIONS: (0.5 | 1 | 2 | 5 | 10)[] = [0.5, 1, 2, 5, 10];

export const BottomTimelineTray: React.FC = () => {
  const isRunning = useSimulationStore((s) => s.isRunning);
  const isPaused = useSimulationStore((s) => s.isPaused);
  const autoRun = useSimulationStore((s) => s.autoRun);
  const simSpeed = useSimulationStore((s) => s.simSpeed);
  const simTimeSec = useSimulationStore((s) => s.simTimeSec);
  const scenarioStage = useSimulationStore((s) => s.scenarioStage);
  const activeFaults = useSimulationStore((s) => s.activeFaults);
  const logs = useSimulationStore((s) => s.logs);
  const rf = useSimulationStore((s) => s.rf);
  const drone = useSimulationStore((s) => s.drone);

  const startSimulation = useSimulationStore((s) => s.startSimulation);
  const pauseSimulation = useSimulationStore((s) => s.pauseSimulation);
  const resumeSimulation = useSimulationStore((s) => s.resumeSimulation);
  const resetSimulation = useSimulationStore((s) => s.resetSimulation);
  const advanceToNextStage = useSimulationStore((s) => s.advanceToNextStage);
  const setAutoRun = useSimulationStore((s) => s.setAutoRun);
  const setSimSpeed = useSimulationStore((s) => s.setSimSpeed);
  const toggleFault = useSimulationStore((s) => s.toggleFault);
  const clearAllFaults = useSimulationStore((s) => s.clearAllFaults);
  const setActiveNav = useSimulationStore((s) => s.setActiveNav);
  const setPanels = useSimulationStore((s) => s.setPanels);

  const [faultMenuOpen, setFaultMenuOpen] = useState(false);

  return (
    <section className="shrink-0 agromax-panel border-t border-slate-800/90 select-none">
      {/* Control Toolbar Row */}
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80">
        {/* Primary Simulation Transport Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {!isRunning ? (
            <button
              type="button"
              onClick={startSimulation}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded whitespace-nowrap transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Simülasyonu Başlat</span>
            </button>
          ) : isPaused ? (
            <button
              type="button"
              onClick={resumeSimulation}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded whitespace-nowrap transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Devam Et</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={pauseSimulation}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded whitespace-nowrap transition-colors"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Duraklat</span>
            </button>
          )}

          <button
            type="button"
            onClick={resetSimulation}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded whitespace-nowrap transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Sıfırla</span>
          </button>

          <button
            type="button"
            onClick={advanceToNextStage}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-medium rounded whitespace-nowrap transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
            <span>Sonraki Aşama</span>
          </button>

          <div className="flex items-center bg-[#0f172a] border border-slate-800 rounded p-0.5 ml-1">
            <button
              type="button"
              onClick={() => setAutoRun(true)}
              className={`px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap transition-colors ${
                autoRun ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Otomatik Çalıştır
            </button>
            <button
              type="button"
              onClick={() => setAutoRun(false)}
              className={`px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap transition-colors ${
                !autoRun ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Manuel Kontrol
            </button>
          </div>
        </div>

        {/* Speed Multipliers, Fault Injection, Report & Tray Collapse */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-[#0f172a] border border-slate-800 rounded p-0.5">
            <span className="text-[11px] text-slate-400 px-1.5">Hız:</span>
            {SPEED_OPTIONS.map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => setSimSpeed(sp)}
                className={`px-2 py-0.5 text-[11px] font-mono-tabular rounded transition-colors ${
                  simSpeed === sp ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {sp}×
              </button>
            ))}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setFaultMenuOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border whitespace-nowrap transition-colors ${
                activeFaults.length > 0
                  ? 'bg-rose-950/70 border-rose-500/60 text-rose-300'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Hata Senaryosu ({activeFaults.length})</span>
            </button>

            {faultMenuOpen && (
              <div className="absolute right-0 bottom-10 z-50 w-80 bg-[#0d1522] border border-slate-700 rounded-md shadow-xl p-2">
                <div className="flex items-center justify-between px-2 py-1 border-b border-slate-800 mb-1">
                  <span className="text-xs font-semibold text-slate-200">Hata Enjeksiyonu</span>
                  {activeFaults.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAllFaults}
                      className="text-[11px] text-cyan-400 hover:underline"
                    >
                      Tümünü Temizle
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {FAULT_SCENARIOS.map((f) => {
                    const active = activeFaults.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleFault(f.id)}
                        className={`w-full text-left p-2 rounded text-xs border transition-colors ${
                          active
                            ? 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                            : 'bg-[#0a101b] border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between font-medium">
                          <span>{f.label}</span>
                          <span className="text-[10px] font-mono-tabular">
                            {active ? 'AKTİF' : f.subsystem}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{f.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setActiveNav('GOREV_RAPORLARI')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded whitespace-nowrap transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span>Görev Raporunu Aç</span>
          </button>

          <button
            type="button"
            onClick={() => setPanels({ bottomPanelOpen: false })}
            className="flex items-center gap-1 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded"
            title="Paneli Daralt"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            <span>Daralt</span>
          </button>
        </div>
      </div>

      {/* Expandable Progress & Live Event Logs */}
      {true && (
        <div className="grid grid-cols-12 gap-3 px-3 py-2 h-36">
          {/* Transfer & Mission Progress Gauges */}
          <div className="col-span-12 lg:col-span-4 flex flex-col justify-between agromax-inset border border-slate-800/90 rounded p-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Simülasyon Zamanı</span>
              <span className="font-mono-tabular text-slate-100 font-medium">
                T+{simTimeSec.toFixed(1)} s · Aşama {scenarioStage}/10
              </span>
            </div>

            <div className="space-y-1.5">
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                  <span>Uydu Veri Transferi</span>
                  <span className="font-mono-tabular text-cyan-300">
                    {rf.receivedMb.toFixed(1)} / {rf.totalExpectedMb} MB ({rf.completionPct.toFixed(0)}%)
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 transition-all"
                    style={{ width: `${Math.min(100, rf.completionPct)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                  <span>İHA Görev İlerlemesi</span>
                  <span className="font-mono-tabular text-emerald-300">
                    {drone.missionProgressPct.toFixed(0)}% · Batarya %{drone.batteryPct.toFixed(1)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.min(100, drone.missionProgressPct)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Live Event Logs */}
          <div className="col-span-12 lg:col-span-8 agromax-inset border border-slate-800/90 rounded p-2 overflow-y-auto">
            <div className="text-[11px] font-semibold text-slate-400 mb-1">
              Olay Kayıtları (Canlı Sistem Akışı)
            </div>
            <div className="space-y-1 font-mono-tabular text-[11px]">
              {logs.slice(0, 30).map((log) => (
                <div key={log.id} className="flex items-start gap-2 leading-tight">
                  <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                  <span
                    className={`shrink-0 font-semibold ${
                      log.level === 'ERROR'
                        ? 'text-rose-400'
                        : log.level === 'WARNING'
                          ? 'text-amber-400'
                          : log.level === 'SUCCESS'
                            ? 'text-emerald-400'
                            : 'text-cyan-400'
                    }`}
                  >
                    [{log.source}]
                  </span>
                  <span className="text-slate-300">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
