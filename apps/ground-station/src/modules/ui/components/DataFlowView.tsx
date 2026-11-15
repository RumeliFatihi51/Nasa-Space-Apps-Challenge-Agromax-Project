import React from 'react';
import { ArrowRight, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { PipelineNodeState, PipelineNodeStatus } from '../../shared/types';
import { deriveDataFlowNodes, useSimulationStore } from '../../telemetry/simulationStore';
import { ProofPanelDrawer } from './ProofPanelDrawer';

const STATUS_STYLE: Record<
  PipelineNodeStatus,
  { border: string; bg: string; text: string; label: string }
> = {
  BEKLIYOR: { border: 'border-slate-800', bg: 'bg-[#0b1220]', text: 'text-slate-400', label: 'Bekliyor' },
  BAGLANIYOR: { border: 'border-amber-500/50', bg: 'bg-amber-950/20', text: 'text-amber-300', label: 'Bağlanıyor' },
  AKTIF: { border: 'border-cyan-500/60', bg: 'bg-cyan-950/25', text: 'text-cyan-300', label: 'Aktif Akış' },
  ISLENIYOR: { border: 'border-cyan-400/70', bg: 'bg-cyan-950/35', text: 'text-cyan-200', label: 'İşleniyor' },
  TAMAMLANDI: { border: 'border-emerald-500/60', bg: 'bg-emerald-950/25', text: 'text-emerald-300', label: 'Tamamlandı' },
  HATA: { border: 'border-rose-500/70', bg: 'bg-rose-950/30', text: 'text-rose-300', label: 'Hata / Kesinti' },
};

export const DataFlowView: React.FC = () => {
  const store = useSimulationStore();
  const nodes: PipelineNodeState[] = deriveDataFlowNodes(store);

  const satSegment = nodes.slice(0, 5); // Uydu -> Yerel Sunucu
  const agroSegment = nodes.slice(5, 10); // Görüntü İşleme -> Drone

  const renderNodeCard = (node: PipelineNodeState, idx: number, showArrow: boolean) => {
    const st = STATUS_STYLE[node.status];
    return (
      <React.Fragment key={node.id}>
        <div className={`flex-1 min-w-[155px] border ${st.border} ${st.bg} rounded-md p-3 flex flex-col justify-between`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono-tabular text-slate-500">
              {String(idx + 1).padStart(2, '0')}
            </span>
            <span className={`text-[11px] font-medium flex items-center gap-1 ${st.text}`}>
              {node.status === 'TAMAMLANDI' && <CheckCircle2 className="w-3.5 h-3.5" />}
              {node.status === 'HATA' && <AlertTriangle className="w-3.5 h-3.5" />}
              {(node.status === 'AKTIF' || node.status === 'ISLENIYOR' || node.status === 'BAGLANIYOR') && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              <span>{st.label}</span>
            </span>
          </div>
          <div className="my-2">
            <div className="text-sm font-semibold text-slate-100">{node.label}</div>
            <div className="text-[11px] text-slate-400 truncate">{node.sublabel}</div>
          </div>
          <div className="pt-2 border-t border-slate-800/80 text-xs font-mono-tabular text-slate-200">
            {node.metric}
          </div>
        </div>
        {showArrow && (
          <div className="hidden lg:flex items-center justify-center px-0.5">
            <ArrowRight
              className={`w-4 h-4 ${
                node.status === 'HATA'
                  ? 'text-rose-500'
                  : node.status === 'AKTIF' || node.status === 'ISLENIYOR' || node.status === 'TAMAMLANDI'
                    ? 'text-emerald-400'
                    : 'text-slate-700'
              }`}
            />
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="w-full h-full overflow-y-auto p-4 bg-[#070b12] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Gerçek Zamanlı Veri Akışı ve Sistem Mimarisi
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Düğüm ve bağlantı durumları doğrudan canlı simülasyon durum makinesinden üretilir; bağımsız animasyon kullanılmaz.
          </p>
        </div>
        <div className="text-xs font-mono-tabular text-cyan-300">
          Mod: {store.operationMode === 'SIMULATION' ? 'SİMÜLASYON' : 'GERÇEK VERİ (BAĞLI DEĞİL)'}
        </div>
      </div>

      {/* Segment 1: Uydu -> Yer İstasyonu -> AgroMax Sunucusu */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-300">
          Hat 1: Uydu Haberleşmesi → Yer İstasyonu → AgroMax Yerel Sunucusu
        </div>
        <div className="flex flex-wrap lg:flex-nowrap items-stretch gap-2">
          {satSegment.map((n, i) => renderNodeCard(n, i, i < satSegment.length - 1))}
        </div>
      </div>

      {/* Segment 2: AgroMax Sunucusu -> Analiz -> Drone GCS -> Drone */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-300">
          Hat 2: Multispektral İşleme → Görev Planlama → İHA Yer Kontrol (GCS) → Otonom Drone
        </div>
        <div className="flex flex-wrap lg:flex-nowrap items-stretch gap-2">
          {agroSegment.map((n, i) => renderNodeCard(n, i + 5, i < agroSegment.length - 1))}
        </div>
      </div>

      {/* Live Acquisition Proof & Architectural Separation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-5">
          <ProofPanelDrawer embedded />
        </div>
        <div className="lg:col-span-7 bg-[#0b1220] border border-slate-800 rounded-md p-4 text-xs text-slate-300 space-y-2">
          <div className="font-semibold text-emerald-400">Mimari Ayrım ve Veri Kaynağı Doğrulaması</div>
          <p className="text-slate-400 leading-relaxed">
            Uydu yer istasyonu RF/SDR hattı ile İHA yer kontrol istasyonu (MAVLink/GCS) birbirinden tamamen bağımsız alt sistemlerdir.
            İHA hiçbir aşamada doğrudan uyduya bağlanmaz; yalnızca AgroMax sunucusu tarafından analiz sonrası üretilen görev paketini alır.
          </p>
          <p className="text-slate-400 leading-relaxed">
            Sol taraftaki canlı panelde yer istasyonu antenine gelen RF taşıyıcı spektrumu (Doppler kayması ve SNR dB), satır-satır çözümlenen
            ham uydu çerçevesi ve İHA gimbal kamerasının nadir görüntüsü eşzamanlı olarak doğrulanabilir.
          </p>
        </div>
      </div>
    </div>
  );
};
