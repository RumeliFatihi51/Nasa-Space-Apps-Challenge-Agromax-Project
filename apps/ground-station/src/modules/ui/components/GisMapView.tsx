import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, MapPin, PenTool, Upload } from 'lucide-react';
import { parseGeoJsonParcel } from '../../gis/gisUtils';
import { MapLayerId } from '../../shared/types';
import { useSimulationStore } from '../../telemetry/simulationStore';
import { ndmiColor, ndviColor } from '../three/textures';

export const GisMapView: React.FC = () => {
  const parcel = useSimulationStore((s) => s.parcel);
  const noFlyZones = useSimulationStore((s) => s.noFlyZones);
  const layers = useSimulationStore((s) => s.layers);
  const spectralAnalysis = useSimulationStore((s) => s.spectralAnalysis);
  const missionPlan = useSimulationStore((s) => s.missionPlan);
  const drone = useSimulationStore((s) => s.drone);

  const toggleMapLayer = useSimulationStore((s) => s.toggleMapLayer);
  const setMapLayerOpacity = useSimulationStore((s) => s.setMapLayerOpacity);
  const updateParcelPolygon = useSimulationStore((s) => s.updateParcelPolygon);
  const importParcel = useSimulationStore((s) => s.importParcel);
  const setActiveNav = useSimulationStore((s) => s.setActiveNav);
  const setCameraPreset = useSimulationStore((s) => s.setCameraPreset);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [cursorLonLat, setCursorLonLat] = useState<[number, number] | null>(null);
  const [geoJsonOpen, setGeoJsonOpen] = useState(false);
  const [geoJsonInput, setGeoJsonInput] = useState('');
  const [geoJsonErr, setGeoJsonErr] = useState<string | null>(null);

  // Geographic viewport bounds centered around Polatlı parcel
  const minLon = parcel.center[0] - 0.0052;
  const maxLon = parcel.center[0] + 0.0052;
  const minLat = parcel.center[1] - 0.0038;
  const maxLat = parcel.center[1] + 0.0038;

  const lonLatToCanvas = (lon: number, lat: number, w: number, h: number): [number, number] => [
    ((lon - minLon) / (maxLon - minLon)) * w,
    ((maxLat - lat) / (maxLat - minLat)) * h,
  ];

  const canvasToLonLat = (cx: number, cy: number, w: number, h: number): [number, number] => [
    Number((minLon + (cx / w) * (maxLon - minLon)).toFixed(6)),
    Number((maxLat - (cy / h) * (maxLat - minLat)).toFixed(6)),
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const layerMap = Object.fromEntries(layers.map((l) => [l.id, l])) as Record<MapLayerId, (typeof layers)[number]>;

    // Offline synthetic satellite base map
    ctx.fillStyle = '#0c1624';
    ctx.fillRect(0, 0, W, H);

    // Subtle neighboring agricultural grid & coordinate graticule
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const gx = (i / 10) * W;
      const gy = (i / 10) * H;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, H);
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();
    }

    // Parcel boundary path
    ctx.save();
    ctx.beginPath();
    parcel.coordinates.forEach(([lon, lat], i) => {
      const [x, y] = lonLatToCanvas(lon, lat, W, H);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = '#182b22';
    ctx.fill();

    // Clip raster layers to parcel bounding rect
    if (spectralAnalysis) {
      const pCoords = parcel.coordinates.map(([lon, lat]) => lonLatToCanvas(lon, lat, W, H));
      const pMinX = Math.min(...pCoords.map((p) => p[0]));
      const pMaxX = Math.max(...pCoords.map((p) => p[0]));
      const pMinY = Math.min(...pCoords.map((p) => p[1]));
      const pMaxY = Math.max(...pCoords.map((p) => p[1]));
      const pW = pMaxX - pMinX;
      const pH = pMaxY - pMinY;

      ctx.save();
      ctx.clip();
      const gw = spectralAnalysis.gridWidth;
      const gh = spectralAnalysis.gridHeight;
      const cw = pW / gw;
      const ch = pH / gh;

      const drawRaster = (mode: 'RGB' | 'NDVI' | 'NDMI' | 'NDRE', opacity: number) => {
        ctx.globalAlpha = opacity;
        for (let y = 0; y < gh; y++) {
          for (let x = 0; x < gw; x++) {
            const idx = y * gw + x;
            if (spectralAnalysis.cloudMask[idx] === 1) continue;
            if (mode === 'RGB') {
              const r = Math.min(255, Math.round(spectralAnalysis.red[idx] * 950));
              const g = Math.min(255, Math.round(spectralAnalysis.green[idx] * 950));
              const b = Math.min(255, Math.round(spectralAnalysis.blue[idx] * 950));
              ctx.fillStyle = `rgb(${r},${g},${b})`;
            } else if (mode === 'NDMI') {
              const [r, g, b] = ndmiColor(spectralAnalysis.ndmi[idx]);
              ctx.fillStyle = `rgb(${r},${g},${b})`;
            } else if (mode === 'NDRE') {
              const [r, g, b] = ndviColor(spectralAnalysis.ndre[idx] * 1.35);
              ctx.fillStyle = `rgb(${r},${g},${b})`;
            } else {
              const [r, g, b] = ndviColor(spectralAnalysis.ndvi[idx]);
              ctx.fillStyle = `rgb(${r},${g},${b})`;
            }
            ctx.fillRect(pMinX + x * cw, pMinY + y * ch, Math.ceil(cw), Math.ceil(ch));
          }
        }
      };

      if (layerMap.RGB?.visible) drawRaster('RGB', layerMap.RGB.opacity);
      if (layerMap.NDVI?.visible) drawRaster('NDVI', layerMap.NDVI.opacity);
      if (layerMap.NDMI?.visible) drawRaster('NDMI', layerMap.NDMI.opacity);
      if (layerMap.NDRE?.visible) drawRaster('NDRE', layerMap.NDRE.opacity);

      if (layerMap.CLOUD_MASK?.visible) {
        ctx.globalAlpha = layerMap.CLOUD_MASK.opacity;
        ctx.fillStyle = '#e2e8f0';
        for (let y = 0; y < gh; y++) {
          for (let x = 0; x < gw; x++) {
            if (spectralAnalysis.cloudMask[y * gw + x] === 1) {
              ctx.fillRect(pMinX + x * cw, pMinY + y * ch, Math.ceil(cw), Math.ceil(ch));
            }
          }
        }
      }
      ctx.restore();
    }

    // Parcel outline stroke
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // No-Fly Zones
    noFlyZones.forEach((nfz) => {
      ctx.beginPath();
      nfz.coordinates.forEach(([lon, lat], i) => {
        const [x, y] = lonLatToCanvas(lon, lat, W, H);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
      ctx.fill();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Priority Zones Overlay
    if (spectralAnalysis && layerMap.PRIORITY_ZONES?.visible) {
      ctx.globalAlpha = layerMap.PRIORITY_ZONES.opacity;
      spectralAnalysis.priorityZones.forEach((z) => {
        const [zx, zy] = lonLatToCanvas(z.centerCoord[0], z.centerCoord[1], W, H);
        ctx.strokeStyle =
          z.category === 'NORMAL'
            ? '#10b981'
            : z.category === 'LOW_NDVI'
              ? '#f59e0b'
              : z.category === 'LOW_NDMI'
                ? '#06b6d4'
                : '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(zx, zy, 34, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(7, 11, 18, 0.85)';
        ctx.fillRect(zx - 32, zy - 9, 64, 17);
        ctx.fillStyle = '#f8fafc';
        ctx.font = '600 10px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(z.code, zx, zy + 3);
      });
      ctx.globalAlpha = 1;
    }

    // Drone Planned Route
    if (missionPlan && layerMap.MISSION_ROUTE?.visible && missionPlan.waypoints.length > 0) {
      ctx.globalAlpha = layerMap.MISSION_ROUTE.opacity;
      ctx.strokeStyle = missionPlan.isFeasible ? '#06b6d4' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      missionPlan.waypoints.forEach((w, i) => {
        const [wx, wy] = lonLatToCanvas(w.lon, w.lat, W, H);
        if (i === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      missionPlan.waypoints.forEach((w) => {
        const [wx, wy] = lonLatToCanvas(w.lon, w.lat, W, H);
        ctx.fillStyle = w.visited ? '#10b981' : '#06b6d4';
        ctx.beginPath();
        ctx.arc(wx, wy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    // Actual Drone Track
    if (layerMap.ACTUAL_TRACK?.visible && drone.actualTrack.length >= 2) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      drone.actualTrack.forEach((p, i) => {
        const [tx, ty] = lonLatToCanvas(p.lon, p.lat, W, H);
        if (i === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      });
      ctx.stroke();
    }

    // Photo Capture Points
    if (layerMap.PHOTO_POINTS?.visible) {
      drone.capturedPhotos.forEach((ph) => {
        const [px, py] = lonLatToCanvas(ph.lon, ph.lat, W, H);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(px - 3, py - 3, 6, 6);
      });
    }

    // Current Drone Position Marker
    const [dx, dy] = lonLatToCanvas(drone.lon, drone.lat, W, H);
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate((drone.headingDeg * Math.PI) / 180);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(7, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // User Polygon Draft Points
    if (draftPoints.length > 0) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      draftPoints.forEach(([lon, lat], i) => {
        const [x, y] = lonLatToCanvas(lon, lat, W, H);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }, [parcel, noFlyZones, layers, spectralAnalysis, missionPlan, drone, draftPoints]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingMode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * canvasRef.current.width;
    const cy = ((e.clientY - rect.top) / rect.height) * canvasRef.current.height;
    const ll = canvasToLonLat(cx, cy, canvasRef.current.width, canvasRef.current.height);
    setDraftPoints((prev) => [...prev, ll]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * canvasRef.current.width;
    const cy = ((e.clientY - rect.top) / rect.height) * canvasRef.current.height;
    setCursorLonLat(canvasToLonLat(cx, cy, canvasRef.current.width, canvasRef.current.height));
  };

  const finishDrawing = () => {
    if (draftPoints.length >= 3) {
      updateParcelPolygon(draftPoints, 'Kullanıcı Çizimli Parsel');
    }
    setDraftPoints([]);
    setDrawingMode(false);
  };

  const handleGeoJsonImport = () => {
    const parsed = parseGeoJsonParcel(geoJsonInput);
    if (!parsed) {
      setGeoJsonErr('Geçerli bir GeoJSON Polygon veya FeatureCollection yapıştırın.');
      return;
    }
    importParcel(parsed);
    setGeoJsonErr(null);
    setGeoJsonOpen(false);
    setGeoJsonInput('');
  };

  return (
    <div className="w-full h-full overflow-y-auto p-4 bg-[#070b12] space-y-3">
      {/* Map Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">{parcel.name}</h2>
          <div className="text-[11px] text-slate-400 font-mono-tabular flex flex-wrap gap-2 mt-0.5">
            <span>Alan: {parcel.areaHectares} ha</span>
            <span>·</span>
            <span>Çevre: {parcel.perimeterMeters} m</span>
            <span>·</span>
            <span>Rakım: {parcel.elevationM} m</span>
            <span>·</span>
            <span>Merkez: {parcel.center[1].toFixed(4)}° N, {parcel.center[0].toFixed(4)}° E</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (drawingMode) finishDrawing();
              else setDrawingMode(true);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${
              drawingMode
                ? 'bg-amber-600 border-amber-500 text-white'
                : 'bg-[#0b1220] border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>{drawingMode ? `Poligonu Tamamla (${draftPoints.length} nokta)` : 'Parsel Çiz'}</span>
          </button>

          <button
            type="button"
            onClick={() => setGeoJsonOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#0b1220] border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-medium rounded transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>GeoJSON İçe Aktar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCameraPreset('FIELD_MAP_3D');
              setActiveNav('OPERASYON_MERKEZI');
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded transition-colors"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>3D Tarla Görünümü</span>
          </button>
        </div>
      </div>

      {geoJsonOpen && (
        <div className="bg-[#0b1220] border border-slate-700 rounded-md p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-200">GeoJSON Parsel İçe Aktarma (WGS84)</div>
          <textarea
            value={geoJsonInput}
            onChange={(e) => setGeoJsonInput(e.target.value)}
            rows={4}
            placeholder='{"type":"Polygon","coordinates":[[[32.144,39.586],[32.149,39.586],[32.149,39.582],[32.144,39.582],[32.144,39.586]]]}'
            className="w-full bg-[#080d16] border border-slate-800 rounded p-2 text-xs font-mono-tabular text-slate-200"
          />
          {geoJsonErr && <div className="text-xs text-rose-400">{geoJsonErr}</div>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setGeoJsonOpen(false)}
              className="px-3 py-1 text-xs text-slate-400 hover:text-white"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={handleGeoJsonImport}
              className="px-3 py-1 bg-emerald-600 text-white text-xs rounded"
            >
              Parseli Yükle
            </button>
          </div>
        </div>
      )}

      {/* Map Canvas + Layer Manager */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8 relative bg-[#0b1220] border border-slate-800 rounded-md overflow-hidden">
          <canvas
            ref={canvasRef}
            width={780}
            height={520}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            className="w-full h-auto cursor-crosshair block"
          />
          <div className="absolute bottom-2 left-2 bg-[#070b12]/90 border border-slate-700 rounded px-2.5 py-1 text-[11px] font-mono-tabular text-slate-200">
            {cursorLonLat
              ? `WGS84: ${cursorLonLat[1].toFixed(5)}° N, ${cursorLonLat[0].toFixed(5)}° E`
              : 'Koordinat okumak için imleci harita üzerinde gezdirin'}
          </div>
          <div className="absolute top-2 right-2 bg-[#070b12]/90 border border-slate-700 rounded px-2.5 py-1 text-[11px] text-slate-300">
            Çevrimdışı GIS Katman Motoru (Turf.js Doğrulamalı)
          </div>
        </div>

        {/* Layer Controls */}
        <div className="col-span-12 lg:col-span-4 bg-[#0b1220] border border-slate-800 rounded-md p-3 space-y-2.5 max-h-[540px] overflow-y-auto">
          <div className="text-xs font-semibold text-slate-200 pb-1 border-b border-slate-800">
            Harita Katman Kontrolleri
          </div>
          {layers.map((layer) => (
            <div key={layer.id} className="bg-[#080d16] border border-slate-800/80 rounded p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => toggleMapLayer(layer.id)}
                  className="flex items-center gap-2 text-xs font-medium text-slate-200 text-left"
                >
                  {layer.visible ? (
                    <Eye className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                  <span>{layer.label}</span>
                </button>
                <span className="text-[10px] font-mono-tabular text-slate-400">
                  %{Math.round(layer.opacity * 100)}
                </span>
              </div>

              <input
                type="range"
                min={10}
                max={100}
                value={Math.round(layer.opacity * 100)}
                onChange={(e) => setMapLayerOpacity(layer.id, Number(e.target.value) / 100)}
                className="w-full accent-emerald-500 h-1"
              />

              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{layer.legendText}</span>
                <span className="font-mono-tabular">{layer.sourceLabel}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
