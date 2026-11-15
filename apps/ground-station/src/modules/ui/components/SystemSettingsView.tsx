import React from 'react';
import { Box, Cpu, Server, ShieldCheck } from 'lucide-react';
import { DEFAULT_HARDWARE_ADAPTERS, FASTAPI_REFERENCE_BLUEPRINT } from '../../shared/adapters';
import { MODEL_ASSET_REGISTRY } from '../../shared/catalog';
import { useSimulationStore } from '../../telemetry/simulationStore';

export const SystemSettingsView: React.FC = () => {
  const operationMode = useSimulationStore((s) => s.operationMode);
  const setOperationMode = useSimulationStore((s) => s.setOperationMode);
  const isOffline = useSimulationStore((s) => s.isOffline);
  const setOfflineStatus = useSimulationStore((s) => s.setOfflineStatus);

  const sdr = DEFAULT_HARDWARE_ADAPTERS.sdr.getStatus();
  const rot = DEFAULT_HARDWARE_ADAPTERS.rotator.getStatus();
  const mav = DEFAULT_HARDWARE_ADAPTERS.drone.getStatus();
  const be = DEFAULT_HARDWARE_ADAPTERS.backend.getStatus();

  return (
    <div className="w-full h-full overflow-y-auto p-5 bg-[#070b12]">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Sistem Ayarları, Donanım Adaptörleri ve Varlık Mimarisi
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Simülasyon motoru ile gerçek donanım adaptörleri kesin olarak ayrılmıştır; bağlı olmayan donanımlar açıkça raporlanır.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOfflineStatus(!isOffline)}
              className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                isOffline
                  ? 'bg-amber-950/60 border-amber-500/50 text-amber-200'
                  : 'bg-[#0b1220] border-slate-700 text-slate-300'
              }`}
            >
              {isOffline ? 'İnternetsiz Yerel Mod: AÇIK' : 'Ağ Durumu: Çevrimiçi (Yerel Önbellek Hazır)'}
            </button>
          </div>
        </div>

        {/* Real Hardware Adapters */}
        <div className="bg-[#0b1220] border border-slate-800 rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>Modüler Gerçek Donanım & Backend Adaptörleri</span>
            </h3>
            <span className="text-[11px] font-mono-tabular text-amber-400">
              Aktif Çalışma Modu: {operationMode === 'SIMULATION' ? 'SİMÜLASYON' : 'GERÇEK VERİ'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {[
              { title: 'RF / SDR Alıcı Adaptörü', proto: DEFAULT_HARDWARE_ADAPTERS.sdr.protocol, st: sdr },
              { title: 'Anten Rotator / ACU Adaptörü', proto: DEFAULT_HARDWARE_ADAPTERS.rotator.protocol, st: rot },
              { title: 'İHA Kontrol (MAVLink / PX4 / DJI SDK)', proto: DEFAULT_HARDWARE_ADAPTERS.drone.protocol, st: mav },
              { title: 'AgroMax FastAPI / STAC Sunucusu', proto: DEFAULT_HARDWARE_ADAPTERS.backend.endpointUrl, st: be },
            ].map((item) => (
              <div key={item.title} className="bg-[#080d16] border border-slate-800 rounded p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-100">{item.title}</span>
                  <span className="text-[11px] font-mono-tabular text-rose-400 font-semibold">
                    BAĞLI DEĞİL
                  </span>
                </div>
                <div className="text-[11px] font-mono-tabular text-cyan-300">{item.proto}</div>
                <p className="text-[11px] text-slate-400">{item.st.reason}</p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 bg-[#080d16] border border-slate-800 rounded p-3 text-[11px] text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong>Emniyet ve Yetki Kuralı:</strong> Gerçek bir İHA&apos;ya görev gönderilmesi için operatör onayı,
              coğrafi sınır doğrulaması ve resmi MAVSDK/DJI SDK köprüsü zorunludur. Ticari veya şifreli uydu yayınları için
              yetkisiz çözümleme yapılmaz.
              {operationMode === 'REAL_DATA' && (
                <button
                  type="button"
                  onClick={() => setOperationMode('SIMULATION')}
                  className="ml-2 text-emerald-400 underline"
                >
                  Simülasyon Moduna Dön
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 3D Model Registry (Temporary Procedural vs GLB/GLTF) */}
        <div className="bg-[#0b1220] border border-slate-800 rounded-md p-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Box className="w-4 h-4 text-emerald-400" />
            <span>3D Varlık & GLB/GLTF Model Kayıt Sistemi</span>
          </h3>
          <div className="space-y-2">
            {MODEL_ASSET_REGISTRY.map((m) => (
              <div key={m.key} className="bg-[#080d16] border border-slate-800 rounded p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-semibold text-slate-100">
                    {m.name} <span className="text-slate-500 font-mono-tabular">({m.partCount} PBR Parça)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{m.notes}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-mono-tabular text-amber-400">{m.status}</div>
                  <div className="text-[10px] font-mono-tabular text-slate-500">GLTF Yuvası: {m.gltfSlotUrl}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Python FastAPI Reference Backend Blueprint */}
        <div className="bg-[#0b1220] border border-slate-800 rounded-md p-4 space-y-2">
          <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Server className="w-4 h-4 text-cyan-400" />
            <span>Önerilen Python FastAPI / Rasterio / MAVSDK Sunucu Şablonu</span>
          </h3>
          <pre className="bg-[#080d16] border border-slate-800 rounded p-3 text-[11px] font-mono-tabular text-slate-300 overflow-x-auto">
            {FASTAPI_REFERENCE_BLUEPRINT}
          </pre>
        </div>
      </div>
    </div>
  );
};
