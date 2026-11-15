import React, { useEffect, useState } from 'react';
import { PanelBottom, PanelLeft, PanelRight, Radio, Satellite } from 'lucide-react';
import { useSimulationStore } from '../../telemetry/simulationStore';

export const TopStatusBar: React.FC = () => {
  const operationMode = useSimulationStore((s) => s.operationMode);
  const setOperationMode = useSimulationStore((s) => s.setOperationMode);
  const rf = useSimulationStore((s) => s.rf);
  const orbit = useSimulationStore((s) => s.orbit);
  const localServerConnected = useSimulationStore((s) => s.localServerConnected);
  const drone = useSimulationStore((s) => s.drone);
  const missionPlan = useSimulationStore((s) => s.missionPlan);
  const acquisitionStage = useSimulationStore((s) => s.acquisitionStage);
  const isOffline = useSimulationStore((s) => s.isOffline);
  const leftPanelOpen = useSimulationStore((s) => s.leftPanelOpen);
  const rightPanelOpen = useSimulationStore((s) => s.rightPanelOpen);
  const bottomPanelOpen = useSimulationStore((s) => s.bottomPanelOpen);
  const setPanels = useSimulationStore((s) => s.setPanels);

  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('tr-TR', { hour12: false }));

  useEffect(() => {
    const id = window.setInterval(() => {
      setClock(new Date().toLocaleTimeString('tr-TR', { hour12: false }));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const satLinkLabel =
    operationMode === 'REAL_DATA'
      ? 'BAĞLI DEĞİL'
      : !rf.hardwareCompatible
        ? 'DONANIM UYUMSUZ'
        : rf.carrierLocked
          ? 'KİLİTLİ'
          : orbit.isAboveHorizon
            ? 'GÖRÜŞTE'
            : 'UFUK ALTI';

  const gsStatusLabel =
    operationMode === 'REAL_DATA'
      ? 'BAĞLI DEĞİL'
      : acquisitionStage === 'FAULT'
        ? 'HATA'
        : acquisitionStage === 'IDLE'
          ? 'HAZIR'
          : 'TAKİPTE';

  const droneLinkLabel =
    operationMode === 'REAL_DATA'
      ? 'BAĞLI DEĞİL'
      : drone.linkConnected
        ? `AKTİF (%${drone.linkQualityPct})`
        : 'KOPUK';

  return (
    <header className="h-12 shrink-0 agromax-panel border-b border-slate-800/90 px-3 flex items-center justify-between gap-4 select-none">
      {/* Zone 1: Brand + Mode Toggle */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Satellite className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-100 whitespace-nowrap">
            AgroMax
          </span>
        </div>

        <span className="text-slate-700">|</span>

        <div className="flex items-center agromax-inset border border-slate-800 rounded p-0.5">
          <button
            type="button"
            onClick={() => setOperationMode('SIMULATION')}
            className={`px-2 py-0.5 text-[11px] font-medium rounded whitespace-nowrap transition-colors ${
              operationMode === 'SIMULATION'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            SİMÜLASYON
          </button>
          <button
            type="button"
            onClick={() => setOperationMode('REAL_DATA')}
            className={`px-2 py-0.5 text-[11px] font-medium rounded whitespace-nowrap transition-colors ${
              operationMode === 'REAL_DATA'
                ? 'bg-amber-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            GERÇEK VERİ
          </button>
        </div>
      </div>

      {/* Zone 2: Telemetry Status Strip */}
      <div className="hidden xl:flex items-center gap-4 text-[11px] text-slate-400 overflow-hidden">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span>Yer İstasyonu:</span>
          <span className={`font-mono-tabular font-medium ${gsStatusLabel === 'HATA' || gsStatusLabel === 'BAĞLI DEĞİL' ? 'text-amber-400' : 'text-emerald-400'}`}>
            {gsStatusLabel}
          </span>
        </div>
        <span className="text-slate-800">/</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span>Uydu Bağlantısı:</span>
          <span
            className={`font-mono-tabular font-medium ${
              satLinkLabel === 'KİLİTLİ'
                ? 'text-emerald-400'
                : satLinkLabel === 'DONANIM UYUMSUZ' || satLinkLabel === 'BAĞLI DEĞİL'
                  ? 'text-rose-400'
                  : 'text-cyan-400'
            }`}
          >
            {satLinkLabel}
          </span>
        </div>
        <span className="text-slate-800">/</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span>Veri Akışı:</span>
          <span className="font-mono-tabular font-medium text-slate-200">
            {rf.dataRateMbps.toFixed(1)} Mbps
          </span>
        </div>
        <span className="text-slate-800">/</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span>Yerel Sunucu:</span>
          <span className={`font-mono-tabular font-medium ${localServerConnected && operationMode === 'SIMULATION' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {operationMode === 'REAL_DATA' ? 'BAĞLI DEĞİL' : localServerConnected ? 'ÇEVRİMİÇİ' : 'KESİNTİ'}
          </span>
        </div>
        <span className="text-slate-800">/</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span>Drone:</span>
          <span className={`font-mono-tabular font-medium ${drone.linkConnected && operationMode === 'SIMULATION' ? 'text-cyan-400' : 'text-rose-400'}`}>
            {droneLinkLabel}
          </span>
        </div>
        <span className="text-slate-800">/</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap max-w-[190px]">
          <span>Görev:</span>
          <span className="text-slate-200 truncate">
            {missionPlan ? missionPlan.name.replace('Görev: ', '') : 'Beklemede'}
          </span>
        </div>
      </div>

      {/* Zone 3: Panel Visibility Controls, Offline Status & System Clock */}
      <div className="flex items-center gap-2 shrink-0">
        {isOffline && (
          <span className="text-[11px] font-mono-tabular text-amber-400 mr-1 whitespace-nowrap">
            ÇEVRİMDIŞI MOD
          </span>
        )}
        <div className="flex items-center gap-1 border border-slate-800 rounded p-0.5 bg-[#0f172a]">
          <button
            type="button"
            title="Sol Menüyü Gizle / Göster"
            onClick={() => setPanels({ leftPanelOpen: !leftPanelOpen })}
            className={`p-1 rounded transition-colors ${leftPanelOpen ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-200'}`}
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Alt Zaman Çizelgesini Gizle / Göster"
            onClick={() => setPanels({ bottomPanelOpen: !bottomPanelOpen })}
            className={`p-1 rounded transition-colors ${bottomPanelOpen ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-200'}`}
          >
            <PanelBottom className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Sağ Bilgi Panelini Gizle / Göster"
            onClick={() => setPanels({ rightPanelOpen: !rightPanelOpen })}
            className={`p-1 rounded transition-colors ${rightPanelOpen ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-200'}`}
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800 text-xs font-mono-tabular text-slate-300">
          <Radio className="w-3.5 h-3.5 text-cyan-400" />
          <span>{clock}</span>
        </div>
      </div>
    </header>
  );
};
