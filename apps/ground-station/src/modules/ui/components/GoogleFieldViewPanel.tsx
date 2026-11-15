import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APILoadingStatus,
  APIProvider,
  Circle,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  Polygon,
  Polyline,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Compass, Crosshair, ExternalLink, Layers, MapPin, Navigation, Radio, Satellite } from 'lucide-react';
import {
  getGoogleMapsApiKey,
  GMP_ATTRIBUTION_ID,
  POLATLI_HIGHWAY_JUNCTION,
} from '../../gis/googleMapsConfig';
import { GROUND_STATION_COORDS } from '../../shared/catalog';
import { useSimulationStore } from '../../telemetry/simulationStore';

type GoogleMapTypeId = 'hybrid' | 'satellite' | 'terrain' | 'roadmap';

type SelectedMarkerInfo =
  | { kind: 'GROUND_STATION'; position: google.maps.LatLngLiteral }
  | { kind: 'DRONE'; position: google.maps.LatLngLiteral }
  | { kind: 'ZONE'; position: google.maps.LatLngLiteral; code: string; label: string; ndvi: number; ndmi: number; action: string }
  | { kind: 'STREET_VIEW_CAMERA'; position: google.maps.LatLngLiteral; description: string };

interface StreetViewMetaState {
  status: 'IDLE' | 'SEARCHING' | 'FOUND' | 'NO_COVERAGE' | 'ERROR';
  panoId?: string;
  description?: string;
  imageDate?: string;
  cameraPosition?: google.maps.LatLngLiteral;
  searchRadiusM?: number;
  errorText?: string;
}

function isQuotaError(err: unknown): boolean {
  const str = String(err ?? '');
  return (
    str.includes('OVER_QUERY_LIMIT') ||
    str.includes('RESOURCE_EXHAUSTED') ||
    str.includes('429')
  );
}

const GoogleFieldViewInner: React.FC = () => {
  const parcel = useSimulationStore((s) => s.parcel);
  const noFlyZones = useSimulationStore((s) => s.noFlyZones);
  const spectralAnalysis = useSimulationStore((s) => s.spectralAnalysis);
  const missionPlan = useSimulationStore((s) => s.missionPlan);
  const drone = useSimulationStore((s) => s.drone);
  const rf = useSimulationStore((s) => s.rf);
  const agronomicOp = useSimulationStore((s) => s.agronomicOp);

  const apiStatus = useApiLoadingStatus();
  const map = useMap('agromax-google-map');
  const streetViewLib = useMapsLibrary('streetView');

  const [mapType, setMapType] = useState<GoogleMapTypeId>('hybrid');
  const [selectedMarker, setSelectedMarker] = useState<SelectedMarkerInfo | null>(null);
  const [svMeta, setSvMeta] = useState<StreetViewMetaState>({ status: 'IDLE' });

  const panoContainerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const svServiceRef = useRef<google.maps.StreetViewService | null>(null);
  const initialLookupDoneRef = useRef(false);

  const parcelCenter = useMemo<google.maps.LatLngLiteral>(
    () => ({ lat: parcel.center[1], lng: parcel.center[0] }),
    [parcel.center],
  );
  const groundStationPos = useMemo<google.maps.LatLngLiteral>(
    () => ({ lat: GROUND_STATION_COORDS.latDeg, lng: GROUND_STATION_COORDS.lonDeg }),
    [],
  );
  const dronePos = useMemo<google.maps.LatLngLiteral>(
    () => ({ lat: drone.lat, lng: drone.lon }),
    [drone.lat, drone.lon],
  );

  const parcelPath = useMemo<google.maps.LatLngLiteral[]>(
    () => parcel.coordinates.map(([lng, lat]) => ({ lat, lng })),
    [parcel.coordinates],
  );

  const nfzPaths = useMemo(
    () =>
      noFlyZones.map((nfz) => ({
        id: nfz.id,
        name: nfz.name,
        path: nfz.coordinates.map(([lng, lat]) => ({ lat, lng })),
      })),
    [noFlyZones],
  );

  const missionRoutePath = useMemo<google.maps.LatLngLiteral[]>(
    () => (missionPlan ? missionPlan.waypoints.map((w) => ({ lat: w.lat, lng: w.lon })) : []),
    [missionPlan],
  );

  const actualTrackPath = useMemo<google.maps.LatLngLiteral[]>(
    () => drone.actualTrack.map((p) => ({ lat: p.lat, lng: p.lon })),
    [drone.actualTrack],
  );

  // Lookup nearest outdoor Street View panorama with expanding radius cascade
  const searchStreetViewAt = useCallback(
    async (target: google.maps.LatLngLiteral, panMap = false) => {
      if (!streetViewLib || !panoramaRef.current) return;
      if (!svServiceRef.current) {
        svServiceRef.current = new streetViewLib.StreetViewService();
      }
      if (panMap && map) {
        map.panTo(target);
      }

      setSvMeta((prev) => ({ ...prev, status: 'SEARCHING', errorText: undefined }));
      const radii = [150, 1500, 6000];

      for (const radius of radii) {
        try {
          const response = await svServiceRef.current.getPanorama({
            location: target,
            radius,
            preference: streetViewLib.StreetViewPreference.NEAREST,
            source: streetViewLib.StreetViewSource.OUTDOOR,
          });

          const loc = response.data.location;
          if (loc?.pano) {
            panoramaRef.current.setPano(loc.pano);
            panoramaRef.current.setPov({ heading: 145, pitch: 2 });
            panoramaRef.current.setVisible(true);

            const camPos = loc.latLng
              ? { lat: loc.latLng.lat(), lng: loc.latLng.lng() }
              : target;

            setSvMeta({
              status: 'FOUND',
              panoId: loc.pano,
              description: loc.description || loc.shortDescription || 'Polatlı Çevre Yolu / Saha Yakını',
              imageDate: response.data.imageDate,
              cameraPosition: camPos,
              searchRadiusM: radius,
            });
            return;
          }
        } catch (err) {
          if (isQuotaError(err)) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            setSvMeta({
              status: 'ERROR',
              errorText: 'Google Maps Platform kota limitine ulaşıldı.',
            });
            return;
          }
          // ZERO_RESULTS on this radius -> continue to wider radius
        }
      }

      setSvMeta({
        status: 'NO_COVERAGE',
        searchRadiusM: 6000,
        errorText:
          'Seçilen koordinatın 6 km çevresinde dış mekan Street View panoraması bulunamadı. Haritadaki ana yollardan birine tıklayın veya "D200 Karayolu" butonunu kullanın.',
      });
    },
    [map, streetViewLib],
  );

  // Initialize interactive StreetViewPanorama instance & link map Pegman
  useEffect(() => {
    if (!streetViewLib || !panoContainerRef.current || panoramaRef.current) return;

    const pano = new streetViewLib.StreetViewPanorama(panoContainerRef.current, {
      position: parcelCenter,
      pov: { heading: 145, pitch: 2 },
      visible: true,
      addressControl: true,
      linksControl: true,
      panControl: true,
      zoomControl: true,
      fullscreenControl: true,
      enableCloseButton: false,
      motionTracking: false,
      motionTrackingControl: false,
    });

    pano.addListener('position_changed', () => {
      const pos = pano.getPosition();
      if (!pos) return;
      setSvMeta((prev) => ({
        ...prev,
        status: 'FOUND',
        panoId: pano.getPano(),
        cameraPosition: { lat: pos.lat(), lng: pos.lng() },
      }));
    });

    panoramaRef.current = pano;
    if (map) {
      map.setStreetView(pano);
    }

    return () => {
      panoramaRef.current = null;
    };
  }, [map, parcelCenter, streetViewLib]);

  // Ensure Pegman link persists when map resolves after panorama
  useEffect(() => {
    if (map && panoramaRef.current) {
      map.setStreetView(panoramaRef.current);
    }
  }, [map]);

  // Run initial Street View lookup once library & panorama are ready
  useEffect(() => {
    if (streetViewLib && panoramaRef.current && !initialLookupDoneRef.current) {
      initialLookupDoneRef.current = true;
      void searchStreetViewAt(parcelCenter, false);
    }
  }, [parcelCenter, searchStreetViewAt, streetViewLib]);

  const handleFocusLocation = (pos: google.maps.LatLngLiteral, zoom: number) => {
    if (map) {
      map.panTo(pos);
      map.setZoom(zoom);
    }
    void searchStreetViewAt(pos, false);
  };

  if (apiStatus === APILoadingStatus.AUTH_FAILURE || apiStatus === APILoadingStatus.FAILED) {
    return (
      <div className="bg-[#0b1220] border border-rose-800/70 rounded-lg p-6 text-center space-y-2">
        <div className="text-sm font-semibold text-rose-300">
          Google Maps Platform Kimlik / Yükleme Hatası
        </div>
        <p className="text-xs text-slate-400 max-w-xl mx-auto">
          Harita servisi yüklenemedi. API anahtarının etkinleştirildiğini ve Maps JavaScript API iznine sahip olduğunu doğrulayın.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top Toolbar: Basemap Mode + Quick Jump Coordinates */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0b1220] border border-slate-800 rounded-md px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] font-medium text-slate-400 mr-1 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Altlık:</span>
          </span>
          {(
            [
              { id: 'hybrid', label: 'Hibrit Uydu' },
              { id: 'satellite', label: 'Saf Uydu' },
              { id: 'terrain', label: 'Arazi' },
              { id: 'roadmap', label: 'Yol Haritası' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMapType(t.id)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                mapType === t.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#080d16] text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleFocusLocation(parcelCenter, 16)}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#080d16] hover:bg-slate-800 border border-slate-700 text-emerald-300 text-[11px] font-medium rounded transition-colors"
          >
            <MapPin className="w-3 h-3" />
            <span>Parsel 104</span>
          </button>
          <button
            type="button"
            onClick={() => handleFocusLocation(groundStationPos, 17)}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#080d16] hover:bg-slate-800 border border-slate-700 text-cyan-300 text-[11px] font-medium rounded transition-colors"
          >
            <Radio className="w-3 h-3" />
            <span>Yer İstasyonu</span>
          </button>
          <button
            type="button"
            onClick={() => handleFocusLocation(dronePos, 18)}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#080d16] hover:bg-slate-800 border border-slate-700 text-amber-300 text-[11px] font-medium rounded transition-colors"
          >
            <Navigation className="w-3 h-3" />
            <span>Canlı İHA</span>
          </button>
          <button
            type="button"
            onClick={() =>
              handleFocusLocation(
                { lat: POLATLI_HIGHWAY_JUNCTION.lat, lng: POLATLI_HIGHWAY_JUNCTION.lng },
                16,
              )
            }
            className="flex items-center gap-1 px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-700/70 text-cyan-200 text-[11px] font-medium rounded transition-colors"
          >
            <Compass className="w-3 h-3" />
            <span>D200 Karayolu (Street View)</span>
          </button>
        </div>
      </div>

      {/* Split Live Google Satellite Map + Interactive 360° Google Street View Panorama */}
      <div className="grid grid-cols-12 gap-3">
        {/* Interactive Google Satellite / Hybrid Map */}
        <div className="col-span-12 xl:col-span-7 bg-[#0b1220] border border-slate-800 rounded-md overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 font-medium text-slate-200">
              <Satellite className="w-3.5 h-3.5 text-emerald-400" />
              <span>Google Maps Gerçek Uydu &amp; Telemetri Katmanı</span>
            </div>
            <span className="text-slate-400">
              Street View taraması için haritada herhangi bir noktaya tıklayın veya Pegman’i sürükleyin
            </span>
          </div>

          <div className="relative w-full h-[460px] lg:h-[520px]">
            <GoogleMap
              id="agromax-google-map"
              mapId="DEMO_MAP_ID"
              defaultCenter={parcelCenter}
              defaultZoom={16}
              mapTypeId={mapType}
              gestureHandling="greedy"
              streetViewControl={true}
              mapTypeControl={false}
              fullscreenControl={true}
              internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
              className="w-full h-full"
              onClick={(ev) => {
                const latLng = ev.detail.latLng;
                if (latLng) {
                  void searchStreetViewAt({ lat: latLng.lat, lng: latLng.lng }, false);
                }
              }}
            >
              {/* Parcel 104 Boundary Polygon */}
              <Polygon
                paths={parcelPath}
                strokeColor="#10b981"
                strokeOpacity={0.95}
                strokeWeight={2.5}
                fillColor="#10b981"
                fillOpacity={0.14}
              />

              {/* No-Fly Zones */}
              {nfzPaths.map((nfz) => (
                <Polygon
                  key={nfz.id}
                  paths={nfz.path}
                  strokeColor="#ef4444"
                  strokeOpacity={0.9}
                  strokeWeight={2}
                  fillColor="#ef4444"
                  fillOpacity={0.22}
                />
              ))}

              {/* Priority Spectral Zones */}
              {spectralAnalysis?.priorityZones.map((z) => {
                const zColor =
                  z.category === 'NORMAL'
                    ? '#10b981'
                    : z.category === 'LOW_NDVI'
                      ? '#f59e0b'
                      : z.category === 'LOW_NDMI'
                        ? '#06b6d4'
                        : '#94a3b8';
                return (
                  <Circle
                    key={z.code}
                    center={{ lat: z.centerCoord[1], lng: z.centerCoord[0] }}
                    radius={z.radiusMeters}
                    strokeColor={zColor}
                    strokeOpacity={0.9}
                    strokeWeight={2}
                    fillColor={zColor}
                    fillOpacity={0.18}
                  />
                );
              })}

              {/* Drone Planned Waypoint Route */}
              {missionRoutePath.length >= 2 && (
                <Polyline
                  path={missionRoutePath}
                  strokeColor={missionPlan?.isFeasible ? '#38bdf8' : '#ef4444'}
                  strokeOpacity={0.9}
                  strokeWeight={2.5}
                />
              )}

              {/* Live Actual Drone Flight Trail */}
              {actualTrackPath.length >= 2 && (
                <Polyline
                  path={actualTrackPath}
                  strokeColor="#34d399"
                  strokeOpacity={0.95}
                  strokeWeight={3}
                />
              )}

              {/* Ground Station AdvancedMarker */}
              <AdvancedMarker
                position={groundStationPos}
                title={GROUND_STATION_COORDS.name}
                onClick={() =>
                  setSelectedMarker({ kind: 'GROUND_STATION', position: groundStationPos })
                }
              >
                <Pin background="#0284c7" borderColor="#e0f2fe" glyphColor="#ffffff" glyphText="Y" />
              </AdvancedMarker>

              {/* Live Drone AdvancedMarker */}
              <AdvancedMarker
                position={dronePos}
                title="Canlı İHA Konumu"
                onClick={() => setSelectedMarker({ kind: 'DRONE', position: dronePos })}
              >
                <Pin background="#059669" borderColor="#d1fae5" glyphColor="#ffffff" glyphText="İ" />
              </AdvancedMarker>

              {/* Priority Zone Markers */}
              {spectralAnalysis?.priorityZones.map((z) => {
                const pos = { lat: z.centerCoord[1], lng: z.centerCoord[0] };
                const bg =
                  z.category === 'LOW_NDVI'
                    ? '#d97706'
                    : z.category === 'LOW_NDMI'
                      ? '#0891b2'
                      : z.category === 'NORMAL'
                        ? '#047857'
                        : '#475569';
                const shortCode = z.code.replace('Bölge ', '');
                return (
                  <AdvancedMarker
                    key={`marker-${z.code}`}
                    position={pos}
                    title={`${z.code} - ${z.label}`}
                    onClick={() =>
                      setSelectedMarker({
                        kind: 'ZONE',
                        position: pos,
                        code: z.code,
                        label: z.label,
                        ndvi: z.meanNdvi,
                        ndmi: z.meanNdmi,
                        action: z.recommendedAction,
                      })
                    }
                  >
                    <Pin background={bg} borderColor="#f8fafc" glyphColor="#ffffff" glyphText={shortCode} scale={0.85} />
                  </AdvancedMarker>
                );
              })}

              {/* Active Street View Camera Locus Marker */}
              {svMeta.status === 'FOUND' && svMeta.cameraPosition && (
                <AdvancedMarker
                  position={svMeta.cameraPosition}
                  title="Aktif Google Street View Kamerası"
                  onClick={() =>
                    setSelectedMarker({
                      kind: 'STREET_VIEW_CAMERA',
                      position: svMeta.cameraPosition!,
                      description: svMeta.description || 'Street View Panorama Noktası',
                    })
                  }
                >
                  <Pin background="#f59e0b" borderColor="#fef3c7" glyphColor="#111827" glyphText="SV" scale={0.88} />
                </AdvancedMarker>
              )}

              {/* Telemetry InfoWindow */}
              {selectedMarker && (
                <InfoWindow
                  position={selectedMarker.position}
                  onCloseClick={() => setSelectedMarker(null)}
                >
                  <div className="text-slate-900 text-xs max-w-[230px] space-y-1 p-0.5">
                    {selectedMarker.kind === 'GROUND_STATION' && (
                      <>
                        <div className="font-bold text-sky-800">{GROUND_STATION_COORDS.name}</div>
                        <div>Rakım: {GROUND_STATION_COORDS.altM} m</div>
                        <div>SNR: {rf.snrDb.toFixed(1)} dB · {rf.carrierLocked ? 'Taşıyıcı Kilitli' : 'Beklemede'}</div>
                      </>
                    )}
                    {selectedMarker.kind === 'DRONE' && (
                      <>
                        <div className="font-bold text-emerald-800">Aktif İHA Telemetrisi</div>
                        <div>İrtifa: {drone.altitudeM.toFixed(1)} m · Hız: {drone.groundSpeedMs.toFixed(1)} m/s</div>
                        <div>Batarya: %{drone.batteryPct.toFixed(0)} · Operasyon: {agronomicOp}</div>
                      </>
                    )}
                    {selectedMarker.kind === 'ZONE' && (
                      <>
                        <div className="font-bold text-slate-900">{selectedMarker.code} · {selectedMarker.label}</div>
                        <div>Ort. NDVI: {selectedMarker.ndvi.toFixed(2)} · NDMI: {selectedMarker.ndmi.toFixed(2)}</div>
                        <div className="text-[11px] text-slate-600">{selectedMarker.action}</div>
                      </>
                    )}
                    {selectedMarker.kind === 'STREET_VIEW_CAMERA' && (
                      <>
                        <div className="font-bold text-amber-800">Google Street View Kamerası</div>
                        <div>{selectedMarker.description}</div>
                        <div className="text-[11px] text-slate-600">
                          {selectedMarker.position.lat.toFixed(5)}° N, {selectedMarker.position.lng.toFixed(5)}° E
                        </div>
                      </>
                    )}
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          </div>
        </div>

        {/* Interactive Google Street View 360° Panorama Panel */}
        <div className="col-span-12 xl:col-span-5 bg-[#0b1220] border border-slate-800 rounded-md overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 font-medium text-slate-200">
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span>Google Street View 360° Saha Görünümü</span>
            </div>
            <button
              type="button"
              onClick={() => void searchStreetViewAt(parcelCenter, false)}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#080d16] hover:bg-slate-800 border border-slate-700 text-cyan-300"
            >
              <Crosshair className="w-3 h-3" />
              <span>Parsel Çevresi Ara</span>
            </button>
          </div>

          <div className="relative w-full h-[360px] lg:h-[430px] bg-[#060a12]">
            <div ref={panoContainerRef} className="w-full h-full" />

            {svMeta.status === 'SEARCHING' && (
              <div className="absolute inset-0 bg-[#070b12]/75 flex items-center justify-center p-4 pointer-events-none">
                <div className="bg-[#0b1220] border border-cyan-700/70 rounded px-3 py-2 text-xs text-cyan-200">
                  En yakın Google Street View panoraması aranıyor...
                </div>
              </div>
            )}

            {svMeta.status === 'NO_COVERAGE' && (
              <div className="absolute inset-0 bg-[#070b12]/90 flex flex-col items-center justify-center p-5 text-center space-y-2.5">
                <div className="text-xs font-semibold text-amber-300">
                  Bu Noktada Street View Kapsamı Yok
                </div>
                <p className="text-[11px] text-slate-300 max-w-xs">{svMeta.errorText}</p>
                <button
                  type="button"
                  onClick={() =>
                    handleFocusLocation(
                      { lat: POLATLI_HIGHWAY_JUNCTION.lat, lng: POLATLI_HIGHWAY_JUNCTION.lng },
                      16,
                    )
                  }
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded transition-colors"
                >
                  Polatlı D200 Karayoluna Git
                </button>
              </div>
            )}
          </div>

          {/* Street View Metadata Footer */}
          <div className="p-3 border-t border-slate-800 bg-[#080d16] space-y-1 text-[11px] flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-200 truncate">
                {svMeta.status === 'FOUND'
                  ? svMeta.description
                  : svMeta.status === 'SEARCHING'
                    ? 'Tarama yapılıyor...'
                    : 'Konum bilgisi bekleniyor'}
              </span>
              {svMeta.imageDate && (
                <span className="font-mono-tabular text-[10px] text-emerald-400 shrink-0">
                  Çekim: {svMeta.imageDate}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 font-mono-tabular">
              <span>
                {svMeta.cameraPosition
                  ? `Kamera: ${svMeta.cameraPosition.lat.toFixed(5)}° N, ${svMeta.cameraPosition.lng.toFixed(5)}° E`
                  : `Hedef: ${parcelCenter.lat.toFixed(5)}° N, ${parcelCenter.lng.toFixed(5)}° E`}
              </span>
              {svMeta.searchRadiusM && svMeta.status === 'FOUND' && (
                <span className="text-cyan-300">Arama Yarıçapı: {svMeta.searchRadiusM} m</span>
              )}
            </div>
            {svMeta.cameraPosition && (
              <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500">
                <span>Haritadaki sarı “SV” pini aktif Street View kamerasını gösterir.</span>
                <a
                  href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${svMeta.cameraPosition.lat},${svMeta.cameraPosition.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
                >
                  <span>Tam Ekran</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const GoogleFieldViewPanel: React.FC = () => {
  const apiKey = getGoogleMapsApiKey();

  if (!apiKey) {
    return (
      <div className="bg-[#0b1220] border border-amber-700/60 rounded-lg p-6 text-center space-y-2">
        <div className="text-sm font-semibold text-amber-300">
          Google Maps API Anahtarı Yapılandırması Bekleniyor
        </div>
        <p className="text-xs text-slate-300 max-w-xl mx-auto">
          Gerçek Google Uydu haritası ve Street View 360° saha verilerini görüntülemek için{' '}
          <code className="px-1.5 py-0.5 bg-slate-900 rounded text-cyan-300">VITE_GOOGLE_MAPS_API_KEY</code>{' '}
          ortam değişkeninin tanımlı olduğundan emin olun. Çevrimdışı spektral analiz için yukarıdan &ldquo;Spektral GIS Katmanları&rdquo; sekmesini kullanabilirsiniz.
        </p>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      libraries={['marker', 'streetView']}
      language="tr"
      region="TR"
    >
      <GoogleFieldViewInner />
    </APIProvider>
  );
};
