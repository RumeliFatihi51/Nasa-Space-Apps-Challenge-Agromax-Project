import React from 'react';
import { Download, FileText, Map, Navigation, Printer, ShieldCheck } from 'lucide-react';
import { buildMissionReport } from '../../reporting/reportGenerator';
import { GROUND_STATION_HARDWARE, SATELLITE_PROFILES } from '../../shared/catalog';
import { useSimulationStore } from '../../telemetry/simulationStore';

export const MissionReportView: React.FC = () => {
  const s = useSimulationStore();
  const report = buildMissionReport({
    operationMode: s.operationMode,
    satellite: SATELLITE_PROFILES[s.selectedSatelliteId],
    hardware: GROUND_STATION_HARDWARE[s.hardwareId],
    rf: s.rf,
    parcel: s.parcel,
    analysis: s.spectralAnalysis,
    missionPlan: s.missionPlan,
    drone: s.drone,
    logs: s.logs,
    processingDurationSec: s.processingDurationSec,
    appliedIrrigationM3: s.appliedIrrigationM3,
  });

  const triggerDownload = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJson = () => {
    triggerDownload(`${report.reportId}.json`, JSON.stringify(report, null, 2), 'application/json');
  };

  const downloadQgcPlan = () => {
    if (!s.missionPlan) return;
    const qgcPlan = {
      fileType: 'Plan',
      groundStation: 'AgroMax Mission Control',
      version: 1,
      mission: {
        cruiseSpeed: s.missionPlan.speedMs,
        firmwareType: 12, // PX4 Pro
        plannedHomePosition: [s.parcel.center[1], s.parcel.center[0], s.parcel.elevationM],
        items: s.missionPlan.waypoints.map((w, idx) => ({
          autoContinue: true,
          command: w.action === 'TAKEOFF' ? 22 : w.action === 'LAND' ? 21 : w.action === 'RTL' ? 20 : 16,
          doJumpId: idx + 1,
          frame: 3,
          params: [0, 0, 0, null, w.lat, w.lon, w.altitudeM],
          type: 'SimpleItem',
        })),
      },
      geoFence: { polygons: [{ inclusion: true, polygon: s.parcel.coordinates.map(([lon, lat]) => [lat, lon]) }] },
    };
    triggerDownload(`${s.missionPlan.id}.plan`, JSON.stringify(qgcPlan, null, 2), 'application/json');
  };

  const downloadVraGeoJson = () => {
    const features = [
      {
        type: 'Feature',
        properties: { name: s.parcel.name, areaHectares: s.parcel.areaHectares, cropType: s.parcel.cropType },
        geometry: { type: 'Polygon', coordinates: [s.parcel.coordinates] },
      },
      ...(s.spectralAnalysis?.priorityZones ?? []).map((z) => ({
        type: 'Feature',
        properties: {
          code: z.code,
          category: z.category,
          meanNdvi: z.meanNdvi,
          meanNdmi: z.meanNdmi,
          treatmentLabel: z.prescription.treatmentLabel,
          sprayLitersPerHa: z.prescription.sprayLitersPerHa,
          irrigationMm: z.prescription.irrigationMm,
          fertilizerKgPerHa: z.prescription.fertilizerKgPerHa,
        },
        geometry: { type: 'Point', coordinates: z.centerCoord },
      })),
    ];
    triggerDownload(
      `AgroMax-VRA-${s.parcel.id}.geojson`,
      JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
      'application/geo+json',
    );
  };

  return (
    <div className="w-full h-full overflow-y-auto p-5 bg-[#070b12]">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                AgroMax Operasyon ve Görev Sonu Raporu
              </h2>
              <div className="text-[11px] font-mono-tabular text-slate-400">
                {report.reportId} · {report.generatedAt} · Mod: {report.operationMode}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={downloadQgcPlan}
              disabled={!s.missionPlan}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-cyan-300 text-xs font-medium rounded transition-colors"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>QGC .plan</span>
            </button>
            <button
              type="button"
              onClick={downloadVraGeoJson}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-medium rounded transition-colors"
            >
              <Map className="w-3.5 h-3.5" />
              <span>VRA GeoJSON</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Yazdır / PDF</span>
            </button>
            <button
              type="button"
              onClick={downloadJson}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JSON Rapor</span>
            </button>
          </div>
        </div>

        {/* Summary Status Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-[#0b1220] border border-slate-800 rounded p-3">
            <div className="text-[11px] text-slate-400">Görev Durumu</div>
            <div
              className={`text-sm font-semibold mt-1 ${
                report.missionStatus === 'BAŞARILI'
                  ? 'text-emerald-400'
                  : report.missionStatus === 'İPTAL_EDİLDİ'
                    ? 'text-rose-400'
                    : 'text-amber-400'
              }`}
            >
              {report.missionStatus.replace('_', ' ')}
            </div>
          </div>
          <div className="bg-[#0b1220] border border-slate-800 rounded p-3">
            <div className="text-[11px] text-slate-400">Analiz Alanı</div>
            <div className="text-base font-mono-tabular font-semibold text-slate-100 mt-1">
              {report.analyzedAreaHectares} ha
            </div>
          </div>
          <div className="bg-[#0b1220] border border-slate-800 rounded p-3">
            <div className="text-[11px] text-slate-400">Uçuş &amp; Kare</div>
            <div className="text-sm font-mono-tabular font-semibold text-cyan-300 mt-1">
              {report.actualFlightDistanceM} m · {report.photosCollected} Kare
            </div>
          </div>
          <div className="bg-[#0b1220] border border-slate-800 rounded p-3">
            <div className="text-[11px] text-slate-400">İlaç / Gübre</div>
            <div className="text-sm font-mono-tabular font-semibold text-emerald-300 mt-1">
              {report.appliedSprayLiters} L · {report.appliedFertilizerKg} kg
            </div>
          </div>
          <div className="bg-[#0b1220] border border-slate-800 rounded p-3">
            <div className="text-[11px] text-slate-400">Uygulanan Sulama</div>
            <div className="text-base font-mono-tabular font-semibold text-cyan-300 mt-1">
              {report.appliedIrrigationM3} m³
            </div>
          </div>
        </div>

        {/* Detailed Sections */}
        <div className="bg-[#0b1220] border border-slate-800 rounded-md p-4 space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-slate-400 mb-0.5">Kullanılan Uydu Veri Seti</div>
              <div className="text-slate-100 font-medium">{report.satelliteDataset}</div>
            </div>
            <div>
              <div className="text-slate-400 mb-0.5">Yer İstasyonu Bağlantı Özeti</div>
              <div className="text-slate-100 font-mono-tabular">{report.groundStationSummary}</div>
            </div>
            <div>
              <div className="text-slate-400 mb-0.5">Veri İşleme Süresi</div>
              <div className="text-slate-100 font-mono-tabular">{report.processingDurationSec} saniye</div>
            </div>
            <div>
              <div className="text-slate-400 mb-0.5">Oluşturulan Drone Rotası</div>
              <div className="text-slate-100">{report.missionRouteSummary}</div>
            </div>
          </div>
        </div>

        {/* Data Integrity & Geotagged Drone Capture Proof */}
        <div className="bg-[#0b1220] border border-slate-800 rounded-md p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Veri Kaynağı Doğrulaması &amp; İHA Çekim Kanıtları</span>
            </h3>
            <span className="text-[11px] font-mono-tabular text-emerald-400">
              CCSDS Bütünlük: %{(100 - s.rf.packetLossPct).toFixed(1)} · Alınan: {s.rf.receivedMb.toFixed(0)}/{s.rf.totalExpectedMb} MB
            </span>
          </div>
          {s.drone.capturedPhotos.length === 0 ? (
            <div className="text-xs text-slate-400">
              İHA uçuşu tamamlandığında yakalanan geotagged kanıt kareleri burada listelenir.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {s.drone.capturedPhotos.slice(-9).map((p, idx) => (
                <div key={`${p.timestamp}-${idx}`} className="bg-[#080d16] border border-slate-800 rounded p-2 text-[11px] flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-200 truncate">
                    #{idx + 1} · {p.zone ?? 'Parsel'}
                  </span>
                  <span className="font-mono-tabular text-slate-400 shrink-0">
                    {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Priority Zones */}
        <div className="bg-[#0b1220] border border-slate-800 rounded-md p-4 space-y-2">
          <h3 className="text-xs font-semibold text-slate-200">Belirlenen Öncelikli Bölgeler</h3>
          {report.priorityZonesSummary.length === 0 ? (
            <div className="text-xs text-slate-400">Henüz multispektral analiz çalıştırılmadı.</div>
          ) : (
            <div className="space-y-2">
              {report.priorityZonesSummary.map((z) => (
                <div key={z.code} className="bg-[#080d16] border border-slate-800 rounded p-2.5 text-xs">
                  <div className="font-semibold text-slate-100">
                    {z.code} — {z.category}
                  </div>
                  <div className="text-slate-400 mt-0.5">{z.rationale}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Warnings & Recommended Next Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-[#0b1220] border border-slate-800 rounded-md p-4 space-y-2">
            <h3 className="text-xs font-semibold text-amber-300">Sistem Uyarıları ve Olay Kayıtları</h3>
            {report.warnings.length === 0 ? (
              <div className="text-xs text-slate-400">Operasyon sırasında kritik uyarı kaydedilmedi.</div>
            ) : (
              <ul className="space-y-1 text-[11px] font-mono-tabular text-rose-300">
                {report.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-[#0b1220] border border-slate-800 rounded-md p-4 space-y-2">
            <h3 className="text-xs font-semibold text-emerald-300">Önerilen Sonraki İşlemler</h3>
            <ul className="space-y-1 text-xs text-slate-300">
              {report.recommendedNextSteps.map((step, i) => (
                <li key={i}>• {step}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
