import React, { useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Compass,
  Cpu,
  FileText,
  Layers,
  Map,
  Navigation,
  Radio,
  Satellite,
  Settings,
} from 'lucide-react';
import { NavSectionId } from '../../shared/types';
import { useSimulationStore } from '../../telemetry/simulationStore';

const NAV_ITEMS: { id: NavSectionId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'OPERASYON_MERKEZI', label: 'Operasyon Merkezi', icon: Compass },
  { id: 'UYDU_YORUNGE', label: 'Uydu ve Yörünge', icon: Satellite },
  { id: 'YER_ISTASYONU', label: 'Yer İstasyonu', icon: Radio },
  { id: 'VERI_ALIMI', label: 'Veri Alımı', icon: Activity },
  { id: 'MULTISPEKTRAL_ANALIZ', label: 'Multispektral Analiz', icon: Layers },
  { id: 'HARITA_PARSELLER', label: 'Harita ve Parseller', icon: Map },
  { id: 'DRONE_GOREV_PLANLAMA', label: 'Drone Görev Planlama', icon: Navigation },
  { id: 'CANLI_OPERASYON', label: 'Canlı Operasyon', icon: Cpu },
  { id: 'GOREV_RAPORLARI', label: 'Görev Raporları', icon: FileText },
  { id: 'SISTEM_AYARLARI', label: 'Sistem Ayarları', icon: Settings },
];

const STAGE_NAMES = [
  '1. Uydu Seçimi',
  '2. İstasyon Hazırlığı',
  '3. Veri Alımı',
  '4. Sunucu Aktarımı',
  '5. Multispektral İşlem',
  '6. Öncelik Bölgeleri',
  '7. Drone Görev Planı',
  '8. Otonom Uçuş',
  '9. Veri Aktarımı',
  '10. Operasyon Raporu',
];

export const LeftNav: React.FC = () => {
  const activeNav = useSimulationStore((s) => s.activeNav);
  const setActiveNav = useSimulationStore((s) => s.setActiveNav);
  const scenarioStage = useSimulationStore((s) => s.scenarioStage);
  const [compact, setCompact] = useState(false);

  const stageLabel = STAGE_NAMES[Math.max(0, Math.min(9, scenarioStage - 1))];

  return (
    <aside
      className={`${
        compact ? 'w-12' : 'w-44'
      } shrink-0 agromax-panel border-r border-slate-800/90 flex flex-col justify-between overflow-y-auto select-none transition-all duration-150`}
    >
      <div className="p-1.5">
        <div className="flex items-center justify-between px-1.5 pb-1.5">
          {!compact && (
            <span className="text-[11px] font-semibold text-slate-400">
              Modüller
            </span>
          )}
          <button
            type="button"
            title={compact ? 'Menüyü Genişlet' : 'İkon Moduna Daralt'}
            onClick={() => setCompact((v) => !v)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 ml-auto"
          >
            {compact ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center ${
                  compact ? 'justify-center px-1.5' : 'gap-2 px-2'
                } py-2 text-xs font-medium rounded transition-colors text-left whitespace-nowrap ${
                  active
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white border border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-400' : 'text-slate-400'}`} />
                {!compact && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Compact Scenario Pipeline Indicator */}
      {!compact ? (
        <div className="p-2.5 border-t border-slate-800/90 agromax-inset space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">Senaryo</span>
            <span className="font-mono-tabular text-cyan-300 font-semibold">{scenarioStage}/10</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${scenarioStage * 10}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-300 truncate" title={stageLabel}>
            {stageLabel}
          </div>
        </div>
      ) : (
        <div className="p-1.5 border-t border-slate-800/90 agromax-inset text-center">
          <span className="text-[10px] font-mono-tabular text-cyan-300 font-semibold">
            {scenarioStage}/10
          </span>
        </div>
      )}
    </aside>
  );
};
