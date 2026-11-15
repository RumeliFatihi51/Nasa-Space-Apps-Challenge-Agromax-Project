import React, { useEffect } from 'react';
import { ChevronUp, FileText, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useSimulationStore } from './modules/telemetry/simulationStore';
import { BottomTimelineTray } from './modules/ui/components/BottomTimelineTray';
import { DataFlowView } from './modules/ui/components/DataFlowView';
import { GisMapView } from './modules/ui/components/GisMapView';
import { LeftNav } from './modules/ui/components/LeftNav';
import { MissionReportView } from './modules/ui/components/MissionReportView';
import { RightInspector } from './modules/ui/components/RightInspector';
import { SpectralAnalysisView } from './modules/ui/components/SpectralAnalysisView';
import { SystemSettingsView } from './modules/ui/components/SystemSettingsView';
import { TopStatusBar } from './modules/ui/components/TopStatusBar';
import { Viewport3D } from './modules/ui/three/Viewport3D';

export function App() {
  const activeNav = useSimulationStore((s) => s.activeNav);
  const leftPanelOpen = useSimulationStore((s) => s.leftPanelOpen);
  const rightPanelOpen = useSimulationStore((s) => s.rightPanelOpen);
  const bottomPanelOpen = useSimulationStore((s) => s.bottomPanelOpen);

  const isRunning = useSimulationStore((s) => s.isRunning);
  const isPaused = useSimulationStore((s) => s.isPaused);
  const simSpeed = useSimulationStore((s) => s.simSpeed);
  const scenarioStage = useSimulationStore((s) => s.scenarioStage);
  const rf = useSimulationStore((s) => s.rf);
  const drone = useSimulationStore((s) => s.drone);
  const activeFaults = useSimulationStore((s) => s.activeFaults);

  const startSimulation = useSimulationStore((s) => s.startSimulation);
  const pauseSimulation = useSimulationStore((s) => s.pauseSimulation);
  const resumeSimulation = useSimulationStore((s) => s.resumeSimulation);
  const resetSimulation = useSimulationStore((s) => s.resetSimulation);
  const advanceToNextStage = useSimulationStore((s) => s.advanceToNextStage);
  const setSimSpeed = useSimulationStore((s) => s.setSimSpeed);
  const setActiveNav = useSimulationStore((s) => s.setActiveNav);
  const setPanels = useSimulationStore((s) => s.setPanels);

  // Authoritative simulation clock loop (runs smoothly across all tabs)
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      useSimulationStore.getState().tickSimulation(dt);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    const onOnline = () => useSimulationStore.getState().setOfflineStatus(false);
    const onOffline = () => useSimulationStore.getState().setOfflineStatus(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const is3DStage =
    activeNav === 'OPERASYON_MERKEZI' ||
    activeNav === 'UYDU_YORUNGE' ||
    activeNav === 'YER_ISTASYONU' ||
    activeNav === 'DRONE_GOREV_PLANLAMA' ||
    activeNav === 'CANLI_OPERASYON';

  return (
    <div className="station-app h-screen w-screen flex flex-col bg-[#070b12] text-slate-100 overflow-hidden">
      {/* Top Mission Control Status Bar */}
      <TopStatusBar />

      {/* Center Workspace Row */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {leftPanelOpen && <LeftNav />}

        {/* Main Stage */}
        <main className="flex-1 min-w-0 min-h-0 relative overflow-hidden">
          {/* Keep Viewport3D mounted so WebGL context & camera persist across tab switches */}
          <div className={is3DStage ? 'w-full h-full' : 'hidden'}>
            <Viewport3D />
          </div>

          {activeNav === 'VERI_ALIMI' && <DataFlowView />}
          {activeNav === 'MULTISPEKTRAL_ANALIZ' && <SpectralAnalysisView />}
          {activeNav === 'HARITA_PARSELLER' && <GisMapView />}
          {activeNav === 'GOREV_RAPORLARI' && <MissionReportView />}
          {activeNav === 'SISTEM_AYARLARI' && <SystemSettingsView />}
        </main>

        {rightPanelOpen && <RightInspector />}
      </div>

      {/* Bottom Simulation Controls: Slim bar by default, expandable to full Timeline & Logs */}
      {bottomPanelOpen ? (
        <BottomTimelineTray />
      ) : (
        <footer className="h-11 shrink-0 agromax-panel border-t border-slate-800/90 px-3 flex items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-1.5">
            {!isRunning ? (
              <button
                type="button"
                onClick={startSimulation}
                className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded whitespace-nowrap transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Simülasyonu Başlat</span>
              </button>
            ) : isPaused ? (
              <button
                type="button"
                onClick={resumeSimulation}
                className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded whitespace-nowrap transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Devam Et</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={pauseSimulation}
                className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded whitespace-nowrap transition-colors"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Duraklat</span>
              </button>
            )}

            <button
              type="button"
              onClick={resetSimulation}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded whitespace-nowrap transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Sıfırla</span>
            </button>

            <button
              type="button"
              onClick={advanceToNextStage}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-medium rounded whitespace-nowrap transition-colors"
            >
              <SkipForward className="w-3 h-3" />
              <span>Sonraki Aşama</span>
            </button>

            <div className="hidden md:flex items-center gap-3 ml-3 text-[11px] font-mono-tabular text-slate-400">
              <span>Aşama {scenarioStage}/10</span>
              <span>·</span>
              <span className="text-cyan-300">Uydu %{rf.completionPct.toFixed(0)}</span>
              <span>·</span>
              <span className="text-emerald-300">İHA %{drone.missionProgressPct.toFixed(0)}</span>
              {activeFaults.length > 0 && (
                <>
                  <span>·</span>
                  <span className="text-rose-400">Hata ({activeFaults.length})</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-0.5 bg-[#0f172a] border border-slate-800 rounded p-0.5">
              {([1, 2, 5] as const).map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => setSimSpeed(sp)}
                  className={`px-2 py-0.5 text-[11px] font-mono-tabular rounded ${
                    simSpeed === sp ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {sp}×
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setActiveNav('GOREV_RAPORLARI')}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded whitespace-nowrap transition-colors"
            >
              <FileText className="w-3 h-3 text-emerald-400" />
              <span>Rapor</span>
            </button>

            <button
              type="button"
              onClick={() => setPanels({ bottomPanelOpen: true })}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#0f172a] hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium rounded whitespace-nowrap transition-colors"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Zaman Çizelgesi &amp; Kayıtlar</span>
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

export default App;
