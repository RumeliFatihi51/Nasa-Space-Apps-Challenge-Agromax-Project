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
import {
  GestureHandling,
  Map3D,
  MapMode,
  Marker3D,
  Polygon3D,
  Polyline3D,
} from '@vis.gl/react-google-maps/3d';
import {
  Box,
  Camera,
  Compass,
  Crosshair,
  Globe,
  MapPin,
  Navigation,
  Pause,
  Play,
  Radio,
  Satellite,
  X,
} from 'lucide-react';
import {
  getGoogleMapsApiKey,
  GMP_ATTRIBUTION_ID,
  POLATLI_HIGHWAY_JUNCTION,
} from '../../gis/googleMapsConfig';
import {
  GROUND_STATION_COORDS,
  GROUND_STATION_HARDWARE,
  SATELLITE_PROFILES,
} from '../../shared/catalog';
import { AgronomicOperationType, StageBaseMode } from '../../shared/types';
import { useSimulationStore } from '../../telemetry/simulationStore';
import { StreetViewArOverlay } from '../three/StreetViewArOverlay';
import { ProofPanelDrawer } from './ProofPanelDrawer';

const AGRONOMIC_MODES: { id: AgronomicOperationType; label: string }[] = [
  { id: 'INSPECTION', label: 'Gözlem' },
  { id: 'SPRAYING', label: 'İlaçlama' },
  { id: 'IRRIGATION', label: 'Sulama' },
  { id: 'FERTILIZATION', label: 'Gübreleme' },
];

type SelectedMarkerInfo =
  | { kind: 'GROUND_STATION'; position: google.maps.LatLngLiteral }
  | { kind: 'DRONE'; position: google.maps.LatLngLiteral }
  | {
      kind: 'ZONE';
      position: google.maps.LatLngLiteral;
      code: string;
      label: string;
      ndvi: number;
      ndmi: number;
      action: string;
    };

interface StreetViewOverlayState {
  open: boolean;
  status: 'IDLE' | 'SEARCHING' | 'FOUND' | 'NO_COVERAGE';
  description?: string;
  imageDate?: string;
  cameraPosition?: google.maps.LatLngLiteral;
}

function isQuotaError(err: unknown): boolean {
  const str = String(err ?? '');
  return (
    str.includes('OVER_QUERY_LIMIT') ||
    str.includes('RESOURCE_EXHAUSTED') ||
    str.includes('429')
  );
}

function computeBearingDeg(
  from: google.maps.LatLngLiteral,
  to: google.maps.LatLngLiteral,
): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const OperationsGoogleBaseInner: React.FC = () => {
  const stageBaseMode = useSimulationStore((s) => s.stageBaseMode);
  const setStageBaseMode = useSimulationStore((s) => s.setStageBaseMode);
  const parcel = useSimulationStore((s) => s.parcel);
  const noFlyZones = useSimulationStore((s) => s.noFlyZones);
  const spectralAnalysis = useSimulationStore((s) => s.spectralAnalysis);
  const missionPlan = useSimulationStore((s) => s.missionPlan);
  const drone = useSimulationStore((s) => s.drone);
  const selectedSatelliteId = useSimulationStore((s) => s.selectedSatelliteId);
  const hardwareId = useSimulationStore((s) => s.hardwareId);
  const orbit = useSimulationStore((s) => s.orbit);
  const rf = useSimulationStore((s) => s.rf);
  const agronomicOp = useSimulationStore((s) => s.agronomicOp);
  const irrigationActive = useSimulationStore((s) => s.irrigationActive);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const isPaused = useSimulationStore((s) => s.isPaused);
  const setAgronomicOp = useSimulationStore((s) => s.setAgronomicOp);
  const toggleIrrigation = useSimulationStore((s) => s.toggleIrrigation);
  const startSimulation = useSimulationStore((s) => s.startSimulation);
  const pauseSimulation = useSimulationStore((s) => s.pauseSimulation);
  const resumeSimulation = useSimulationStore((s) => s.resumeSimulation);

  const apiStatus = useApiLoadingStatus();
  const map = useMap('agromax-main-google-map');
  const streetViewLib = useMapsLibrary('streetView');

  const [proofOpen, setProofOpen] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<SelectedMarkerInfo | null>(null);
  const [map3dNotice, setMap3dNotice] = useState<string | null>(null);
  const [svState, setSvState] = useState<StreetViewOverlayState>({
    open: false,
    status: 'IDLE',
  });

  // Full-Screen Street View AR Stage State
  const fullPanoContainerRef = useRef<HTMLDivElement | null>(null);
  const [fullPanorama, setFullPanorama] = useState<google.maps.StreetViewPanorama | null>(null);
  const fullPanoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [fullSvStatus, setFullSvStatus] = useState<'SEARCHING' | 'FOUND' | 'NO_COVERAGE'>(
    'SEARCHING',
  );
  const [fullSvLabel, setFullSvLabel] = useState<string>('Polatlı Parsel 104 Cephesi');
  const [fullSvDate, setFullSvDate] = useState<string | undefined>(undefined);
  const [fullSvBearing, setFullSvBearing] = useState<number>(112);
  const [followDrone, setFollowDrone] = useState<boolean>(false);

  const panoContainerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const svServiceRef = useRef<google.maps.StreetViewService | null>(null);

  const sat = SATELLITE_PROFILES[selectedSatelliteId];
  const hw = GROUND_STATION_HARDWARE[hardwareId];

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
        path: nfz.coordinates.map(([lng, lat]) => ({ lat, lng })),
      })),
    [noFlyZones],
  );

  const missionRoutePath = useMemo<google.maps.LatLngLiteral[]>(
    () => (missionPlan ? missionPlan.waypoints.map((w) => ({ lat: w.lat, lng: w.lon })) : []),
    [missionPlan],
  );

  const missionRoutePath3d = useMemo<google.maps.LatLngAltitudeLiteral[]>(
    () =>
      missionPlan
        ? missionPlan.waypoints.map((w) => ({
            lat: w.lat,
            lng: w.lon,
            altitude: Math.max(8, w.altitudeM),
          }))
        : [],
    [missionPlan],
  );

  const actualTrackPath = useMemo<google.maps.LatLngLiteral[]>(
    () => drone.actualTrack.map((p) => ({ lat: p.lat, lng: p.lon })),
    [drone.actualTrack],
  );

  const actualTrackPath3d = useMemo<google.maps.LatLngAltitudeLiteral[]>(
    () =>
      drone.actualTrack.map((p) => ({
        lat: p.lat,
        lng: p.lon,
        altitude: Math.max(8, p.altitudeM),
      })),
    [drone.actualTrack],
  );

  // Full-Screen Street View Panorama Lookup & Orientation toward Parcel 104
  const loadFullStreetViewAt = useCallback(
    async (targets: google.maps.LatLngLiteral[], labelHint?: string) => {
      if (!streetViewLib) return;
      setFullSvStatus('SEARCHING');
      if (!svServiceRef.current) {
        svServiceRef.current = new streetViewLib.StreetViewService();
      }

      const radii = [250, 1500, 6500];
      for (const target of targets) {
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
              const camPos = loc.latLng
                ? { lat: loc.latLng.lat(), lng: loc.latLng.lng() }
                : target;
              const bearing = computeBearingDeg(camPos, parcelCenter);
              setFullSvBearing(bearing);
              setFullSvLabel(
                loc.description ||
                  loc.shortDescription ||
                  labelHint ||
                  'Polatlı Tarım Arazisi',
              );
              setFullSvDate(response.data.imageDate);
              setFullSvStatus('FOUND');

              if (fullPanoramaRef.current) {
                fullPanoramaRef.current.setPano(loc.pano);
                fullPanoramaRef.current.setPov({ heading: bearing, pitch: 4 });
                fullPanoramaRef.current.setZoom(1);
                fullPanoramaRef.current.setVisible(true);
              } else if (fullPanoContainerRef.current) {
                const pano = new streetViewLib.StreetViewPanorama(
                  fullPanoContainerRef.current,
                  {
                    pano: loc.pano,
                    pov: { heading: bearing, pitch: 4 },
                    zoom: 1,
                    visible: true,
                    addressControl: false,
                    linksControl: true,
                    panControl: true,
                    zoomControl: true,
                    fullscreenControl: false,
                    enableCloseButton: false,
                    motionTracking: false,
                    motionTrackingControl: false,
                    showRoadLabels: true,
                  },
                );
                fullPanoramaRef.current = pano;
                setFullPanorama(pano);
              }
              return;
            }
          } catch (err) {
            if (isQuotaError(err)) {
              window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
              return;
            }
          }
        }
      }

      setFullSvStatus('NO_COVERAGE');
    },
    [parcelCenter, streetViewLib],
  );

  // Initialize Full-Screen Street View AR Stage when active
  useEffect(() => {
    if (stageBaseMode !== 'GOOGLE_STREET_AR') {
      fullPanoramaRef.current = null;
      setFullPanorama(null);
      return;
    }
    if (!streetViewLib || !fullPanoContainerRef.current) return;

    void loadFullStreetViewAt(
      [
        parcelCenter,
        { lat: POLATLI_HIGHWAY_JUNCTION.lat, lng: POLATLI_HIGHWAY_JUNCTION.lng },
      ],
      'Polatlı Parsel 104 Cephesi',
    );
  }, [loadFullStreetViewAt, parcelCenter, stageBaseMode, streetViewLib]);

  const searchStreetViewAt = useCallback(
    async (target: google.maps.LatLngLiteral) => {
      setSvState((prev) => ({ ...prev, open: true, status: 'SEARCHING' }));
      if (!streetViewLib) return;
      if (!svServiceRef.current) {
        svServiceRef.current = new streetViewLib.StreetViewService();
      }

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
            const camPos = loc.latLng
              ? { lat: loc.latLng.lat(), lng: loc.latLng.lng() }
              : target;
            const bearing = computeBearingDeg(camPos, parcelCenter);
            if (panoramaRef.current) {
              panoramaRef.current.setPano(loc.pano);
              panoramaRef.current.setPov({ heading: bearing, pitch: 2 });
              panoramaRef.current.setVisible(true);
            }
            setSvState({
              open: true,
              status: 'FOUND',
              description:
                loc.description || loc.shortDescription || 'Polatlı Saha Çevresi',
              imageDate: response.data.imageDate,
              cameraPosition: camPos,
            });
            return;
          }
        } catch (err) {
          if (isQuotaError(err)) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            return;
          }
        }
      }

      setSvState({
        open: true,
        status: 'NO_COVERAGE',
      });
    },
    [parcelCenter, streetViewLib],
  );

  // Initialize docked StreetViewPanorama when the mini Street View drawer opens
  useEffect(() => {
    if (stageBaseMode !== 'GOOGLE_HYBRID' || !svState.open || !streetViewLib || !panoContainerRef.current) {
      return;
    }
    if (!panoramaRef.current) {
      const pano = new streetViewLib.StreetViewPanorama(panoContainerRef.current, {
        position: svState.cameraPosition ?? parcelCenter,
        pov: { heading: 145, pitch: 2 },
        visible: true,
        addressControl: false,
        linksControl: true,
        panControl: false,
        zoomControl: true,
        fullscreenControl: true,
        enableCloseButton: false,
        motionTracking: false,
        motionTrackingControl: false,
      });
      panoramaRef.current = pano;
      if (map) {
        map.setStreetView(pano);
      }
    }
  }, [map, parcelCenter, stageBaseMode, streetViewLib, svState.cameraPosition, svState.open]);

  // Dispose docked panorama ref when drawer closes or stage leaves hybrid mode
  useEffect(() => {
    if (!svState.open || stageBaseMode !== 'GOOGLE_HYBRID') {
      panoramaRef.current = null;
    }
  }, [stageBaseMode, svState.open]);

  const handleFocus = (pos: google.maps.LatLngLiteral, zoom: number) => {
    if (map && stageBaseMode === 'GOOGLE_HYBRID') {
      map.panTo(pos);
      map.setZoom(zoom);
    }
  };

  if (apiStatus === APILoadingStatus.AUTH_FAILURE || apiStatus === APILoadingStatus.FAILED) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#09111e] p-6">
        <div className="max-w-md bg-[#0d1522] border border-rose-700/70 rounded-lg p-5 text-center space-y-3">
          <div className="text-sm font-semibold text-rose-300">
            Google Maps Tabanı Yüklenemedi
          </div>
          <p className="text-xs text-slate-300">
            Maps JavaScript API kimlik doğrulaması veya ağ bağlantısı sağlanamadı. 3D sentetik sahaya geçerek simülasyona devam edebilirsiniz.
          </p>
          <button
            type="button"
            onClick={() => setStageBaseMode('THREE_3D')}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded"
          >
            3D Saha Görünümüne Geç
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#09111e] overflow-hidden select-none">
      {/* Live Base Layer: Street View 360° AR | Google 3D Terrain | Google Uydu Hybrid */}
      {stageBaseMode === 'GOOGLE_STREET_AR' ? (
        <div className="relative w-full h-full">
          <div ref={fullPanoContainerRef} className="w-full h-full" />
          <StreetViewArOverlay
            panorama={fullPanorama}
            parcelBearingDeg={fullSvBearing}
            followDrone={followDrone}
          />

          {fullSvStatus === 'SEARCHING' && (
            <div className="pointer-events-none absolute inset-0 z-[5] bg-[#070b12]/70 flex items-center justify-center">
              <div className="px-4 py-2.5 rounded-lg bg-[#0b1322] border border-cyan-700/70 text-xs text-cyan-200 flex items-center gap-2">
                <Compass className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Polatlı Parsel 104 çevresinde gerçek 360° Street View panoraması yükleniyor...</span>
              </div>
            </div>
          )}

          {fullSvStatus === 'NO_COVERAGE' && (
            <div className="absolute inset-0 z-[8] bg-[#070b12]/90 flex flex-col items-center justify-center p-6 text-center space-y-3">
              <div className="text-sm font-semibold text-amber-300">
                Bu koordinat için Street View 360° kapsamı bulunamadı
              </div>
              <p className="text-xs text-slate-300 max-w-md">
                D200 karayolu panoramasına atlayabilir veya Google Uydu / 3D Saha görünümüne geçebilirsiniz.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void loadFullStreetViewAt(
                      [{ lat: POLATLI_HIGHWAY_JUNCTION.lat, lng: POLATLI_HIGHWAY_JUNCTION.lng }],
                      POLATLI_HIGHWAY_JUNCTION.name,
                    )
                  }
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded"
                >
                  D200 Karayolu Panoramasını Dene
                </button>
                <button
                  type="button"
                  onClick={() => setStageBaseMode('GOOGLE_HYBRID')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded"
                >
                  Google Uydu Tabanına Geç
                </button>
              </div>
            </div>
          )}
        </div>
      ) : stageBaseMode === 'GOOGLE_3D' ? (
        <div className="w-full h-full">
          <Map3D
            id="agromax-main-map-3d"
            mode={MapMode.HYBRID}
            defaultCenter={{ lat: parcel.center[1], lng: parcel.center[0], altitude: 885 }}
            defaultRange={860}
            defaultTilt={56}
            defaultHeading={-22}
            gestureHandling={GestureHandling.GREEDY}
            internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
            className="w-full h-full"
            onError={() => {
              setMap3dNotice(
                'Bu tarayıcı ortamında Google 3D Tiles desteklenmediği için Google Uydu (Hibrit) tabanına geçildi.',
              );
              setStageBaseMode('GOOGLE_HYBRID');
            }}
          >
            <Polygon3D
              path={parcelPath}
              strokeColor="#10b981"
              fillColor="rgba(16, 185, 129, 0.20)"
              strokeWidth={3}
              altitudeMode="CLAMP_TO_GROUND"
            />

            {nfzPaths.map((nfz) => (
              <Polygon3D
                key={nfz.id}
                path={nfz.path}
                strokeColor="#ef4444"
                fillColor="rgba(239, 68, 68, 0.25)"
                strokeWidth={2}
                altitudeMode="CLAMP_TO_GROUND"
              />
            ))}

            {missionRoutePath3d.length >= 2 && (
              <Polyline3D
                path={missionRoutePath3d}
                strokeColor={missionPlan?.isFeasible ? '#38bdf8' : '#ef4444'}
                strokeWidth={3}
                extruded={true}
                altitudeMode="RELATIVE_TO_GROUND"
              />
            )}

            {actualTrackPath3d.length >= 2 && (
              <Polyline3D
                path={actualTrackPath3d}
                strokeColor="#34d399"
                strokeWidth={4}
                altitudeMode="RELATIVE_TO_GROUND"
              />
            )}

            <Marker3D
              position={{
                lat: groundStationPos.lat,
                lng: groundStationPos.lng,
                altitude: 10,
              }}
              altitudeMode="RELATIVE_TO_GROUND"
              label="Yer İstasyonu"
            />

            <Marker3D
              position={{
                lat: dronePos.lat,
                lng: dronePos.lng,
                altitude: Math.max(6, drone.altitudeM),
              }}
              altitudeMode="RELATIVE_TO_GROUND"
              label={`İHA ${drone.altitudeM.toFixed(0)}m`}
            />
          </Map3D>
        </div>
      ) : (
        <div className="w-full h-full">
          <GoogleMap
            id="agromax-main-google-map"
            mapId="DEMO_MAP_ID"
            defaultCenter={parcelCenter}
            defaultZoom={16}
            mapTypeId="hybrid"
            gestureHandling="greedy"
            streetViewControl={true}
            mapTypeControl={false}
            fullscreenControl={false}
            internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
            className="w-full h-full"
            onClick={(ev) => {
              const latLng = ev.detail.latLng;
              if (latLng && svState.open) {
                void searchStreetViewAt({ lat: latLng.lat, lng: latLng.lng });
              }
            }}
          >
            <Polygon
              paths={parcelPath}
              strokeColor="#10b981"
              strokeOpacity={0.95}
              strokeWeight={2.5}
              fillColor="#10b981"
              fillOpacity={0.14}
            />

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

            {missionRoutePath.length >= 2 && (
              <Polyline
                path={missionRoutePath}
                strokeColor={missionPlan?.isFeasible ? '#38bdf8' : '#ef4444'}
                strokeOpacity={0.9}
                strokeWeight={2.5}
              />
            )}

            {actualTrackPath.length >= 2 && (
              <Polyline
                path={actualTrackPath}
                strokeColor="#34d399"
                strokeOpacity={0.95}
                strokeWeight={3}
              />
            )}

            <AdvancedMarker
              position={groundStationPos}
              title={GROUND_STATION_COORDS.name}
              onClick={() =>
                setSelectedMarker({ kind: 'GROUND_STATION', position: groundStationPos })
              }
            >
              <Pin background="#0284c7" borderColor="#e0f2fe" glyphColor="#ffffff" glyphText="Y" />
            </AdvancedMarker>

            <AdvancedMarker
              position={dronePos}
              title="Canlı İHA"
              onClick={() => setSelectedMarker({ kind: 'DRONE', position: dronePos })}
            >
              <Pin background="#059669" borderColor="#d1fae5" glyphColor="#ffffff" glyphText="İ" />
            </AdvancedMarker>

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
              return (
                <AdvancedMarker
                  key={`zone-${z.code}`}
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
                  <Pin
                    background={bg}
                    borderColor="#f8fafc"
                    glyphColor="#ffffff"
                    glyphText={z.code.replace('Bölge ', '')}
                    scale={0.85}
                  />
                </AdvancedMarker>
              );
            })}

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
                      <div>
                        SNR: {rf.snrDb.toFixed(1)} dB ·{' '}
                        {rf.carrierLocked ? 'Taşıyıcı Kilitli' : 'Beklemede'}
                      </div>
                    </>
                  )}
                  {selectedMarker.kind === 'DRONE' && (
                    <>
                      <div className="font-bold text-emerald-800">Aktif İHA Telemetrisi</div>
                      <div>
                        İrtifa: {drone.altitudeM.toFixed(1)} m · Hız:{' '}
                        {drone.groundSpeedMs.toFixed(1)} m/s
                      </div>
                      <div>
                        Batarya: %{drone.batteryPct.toFixed(0)} · Operasyon: {agronomicOp}
                      </div>
                    </>
                  )}
                  {selectedMarker.kind === 'ZONE' && (
                    <>
                      <div className="font-bold text-slate-900">
                        {selectedMarker.code} · {selectedMarker.label}
                      </div>
                      <div>
                        Ort. NDVI: {selectedMarker.ndvi.toFixed(2)} · NDMI:{' '}
                        {selectedMarker.ndmi.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-slate-600">{selectedMarker.action}</div>
                    </>
                  )}
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </div>
      )}

      {/* Non-Overlapping Top HUD Bar */}
      <div className="absolute top-3 inset-x-3 z-10 flex flex-wrap items-start justify-between gap-2 pointer-events-none">
        {/* Left Cluster: Base Layer Switcher & Stage Context Actions */}
        <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
          <div className="flex items-center gap-0.5 agromax-hud border border-slate-700/90 rounded-md p-1">
            {(
              [
                { id: 'GOOGLE_STREET_AR', label: 'Street View AR', icon: Compass },
                { id: 'GOOGLE_HYBRID', label: 'Google Uydu', icon: Globe },
                { id: 'GOOGLE_3D', label: 'Google 3D', icon: Satellite },
                { id: 'THREE_3D', label: '3D Saha', icon: Box },
              ] as Array<{
                id: StageBaseMode;
                label: string;
                icon: React.ComponentType<{ className?: string }>;
              }>
            ).map((m) => {
              const Icon = m.icon;
              const active = stageBaseMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMap3dNotice(null);
                    setStageBaseMode(m.id);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          {stageBaseMode === 'GOOGLE_STREET_AR' && (
            <div className="flex flex-wrap items-center gap-0.5 agromax-hud border border-slate-700/90 rounded-md p-1">
              <button
                type="button"
                onClick={() =>
                  void loadFullStreetViewAt(
                    [parcelCenter],
                    'Polatlı Parsel 104 Cephesi',
                  )
                }
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-emerald-300 hover:bg-slate-800 rounded whitespace-nowrap"
              >
                <MapPin className="w-3 h-3" />
                <span>Tarla Cephesi</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void loadFullStreetViewAt(
                    [{ lat: POLATLI_HIGHWAY_JUNCTION.lat, lng: POLATLI_HIGHWAY_JUNCTION.lng }],
                    POLATLI_HIGHWAY_JUNCTION.name,
                  )
                }
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-cyan-300 hover:bg-slate-800 rounded whitespace-nowrap"
              >
                <Navigation className="w-3 h-3" />
                <span>D200 Karayolu</span>
              </button>
              <button
                type="button"
                onClick={() => setFollowDrone((v) => !v)}
                className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap transition-colors ${
                  followDrone
                    ? 'bg-amber-600 text-white'
                    : 'text-amber-300 hover:bg-slate-800'
                }`}
              >
                <Crosshair className="w-3 h-3" />
                <span>{followDrone ? 'İHA Takip Açık' : 'İHA Takip'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isRunning) startSimulation();
                  else if (isPaused) resumeSimulation();
                  else pauseSimulation();
                }}
                className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap transition-colors ${
                  isRunning && !isPaused
                    ? 'bg-sky-600 text-white'
                    : 'bg-emerald-600/90 hover:bg-emerald-500 text-white'
                }`}
              >
                {isRunning && !isPaused ? (
                  <>
                    <Pause className="w-3 h-3" />
                    <span>Duraklat</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" />
                    <span>{isPaused ? 'Devam Et' : 'Simülasyonu Başlat'}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {stageBaseMode === 'GOOGLE_HYBRID' && (
            <div className="flex items-center gap-0.5 agromax-hud border border-slate-700/90 rounded-md p-1">
              <button
                type="button"
                onClick={() => handleFocus(parcelCenter, 16)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-emerald-300 hover:bg-slate-800 rounded whitespace-nowrap"
              >
                <MapPin className="w-3 h-3" />
                <span>Parsel</span>
              </button>
              <button
                type="button"
                onClick={() => handleFocus(groundStationPos, 17)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-cyan-300 hover:bg-slate-800 rounded whitespace-nowrap"
              >
                <Radio className="w-3 h-3" />
                <span>İstasyon</span>
              </button>
              <button
                type="button"
                onClick={() => handleFocus(dronePos, 18)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-amber-300 hover:bg-slate-800 rounded whitespace-nowrap"
              >
                <Navigation className="w-3 h-3" />
                <span>İHA</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (svState.open) {
                    setSvState((prev) => ({ ...prev, open: false }));
                  } else {
                    void searchStreetViewAt(parcelCenter);
                  }
                }}
                className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap transition-colors ${
                  svState.open
                    ? 'bg-amber-600 text-white'
                    : 'text-amber-300 hover:bg-slate-800'
                }`}
              >
                <Compass className="w-3 h-3" />
                <span>Street View 360°</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Cluster: RF Status, Proof Drawer & Agronomic Intervention */}
        <div className="flex flex-col items-end gap-1.5 pointer-events-auto">
          <div className="flex items-center gap-1.5">
            {stageBaseMode === 'GOOGLE_STREET_AR' && fullSvStatus === 'FOUND' && (
              <div className="agromax-hud border border-amber-700/60 rounded-md px-2 py-1.5 text-[10px] text-amber-200 hidden xl:flex items-center gap-1.5 whitespace-nowrap">
                <Compass className="w-3 h-3 text-amber-400" />
                <span className="max-w-[170px] truncate">{fullSvLabel}</span>
                {fullSvDate && <span className="text-slate-400">· {fullSvDate}</span>}
              </div>
            )}

            <div className="agromax-hud border border-slate-700/90 rounded-md px-2.5 py-1.5 text-[11px] text-slate-200 flex items-center gap-2 whitespace-nowrap">
              <span className="font-mono-tabular font-medium text-cyan-300">
                {sat.shortName} · El {orbit.elevationDeg.toFixed(0)}°
              </span>
              <span className="text-slate-600">|</span>
              <span className="font-mono-tabular text-emerald-300">
                {hw.dishDiameterM}m → {rf.receivedMb.toFixed(0)}/{rf.totalExpectedMb} MB
              </span>
            </div>

            <button
              type="button"
              onClick={() => setProofOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-medium whitespace-nowrap transition-colors ${
                proofOpen
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'agromax-hud border-slate-700/90 text-cyan-300 hover:bg-slate-800'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Kanıt &amp; Kamera</span>
            </button>
          </div>

          <div className="flex items-center gap-1 agromax-hud border border-slate-700/90 rounded-md p-1">
            {AGRONOMIC_MODES.map((m) => {
              const active = m.id === 'IRRIGATION' ? irrigationActive : agronomicOp === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => (m.id === 'IRRIGATION' ? toggleIrrigation() : setAgronomicOp(m.id))}
                  className={`px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap transition-colors ${
                    active
                      ? m.id === 'IRRIGATION'
                        ? 'bg-cyan-600 text-white'
                        : m.id === 'SPRAYING'
                          ? 'bg-emerald-600 text-white'
                          : m.id === 'FERTILIZATION'
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-700 text-white'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {proofOpen && <ProofPanelDrawer onClose={() => setProofOpen(false)} />}
        </div>
      </div>

      {/* Optional 3D Fallback Info Toast */}
      {map3dNotice && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 agromax-hud border border-amber-600/70 rounded-md px-3 py-1.5 text-xs text-amber-200 flex items-center gap-2">
          <span>{map3dNotice}</span>
          <button
            type="button"
            onClick={() => setMap3dNotice(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Docked Google Street View 360° Mini Viewer (Bottom-Left in Hybrid Mode) */}
      {svState.open && stageBaseMode === 'GOOGLE_HYBRID' && (
        <div className="absolute bottom-8 left-3 z-10 w-[360px] max-w-[90vw] bg-[#0a101b] border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
          <div className="px-2.5 py-1.5 border-b border-slate-800 flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 font-medium text-amber-300 truncate">
              <Compass className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {svState.status === 'FOUND'
                  ? svState.description
                  : 'Google Street View 360°'}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() =>
                  void searchStreetViewAt({
                    lat: POLATLI_HIGHWAY_JUNCTION.lat,
                    lng: POLATLI_HIGHWAY_JUNCTION.lng,
                  })
                }
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-cyan-300"
              >
                D200 Yolu
              </button>
              <button
                type="button"
                onClick={() => setSvState((prev) => ({ ...prev, open: false }))}
                aria-label="Street View Kapat"
                className="p-0.5 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="relative w-full h-[215px] bg-[#060a12]">
            <div ref={panoContainerRef} className="w-full h-full" />
            {svState.status === 'SEARCHING' && (
              <div className="absolute inset-0 bg-[#070b12]/75 flex items-center justify-center text-xs text-cyan-200 pointer-events-none">
                Street View panoraması aranıyor...
              </div>
            )}
            {svState.status === 'NO_COVERAGE' && (
              <div className="absolute inset-0 bg-[#070b12]/90 flex flex-col items-center justify-center p-4 text-center space-y-2">
                <div className="text-xs font-medium text-amber-300">
                  Tarla merkezinde Street View kapsamı yok
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void searchStreetViewAt({
                      lat: POLATLI_HIGHWAY_JUNCTION.lat,
                      lng: POLATLI_HIGHWAY_JUNCTION.lng,
                    })
                  }
                  className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] rounded"
                >
                  En Yakın Karayolu (D200) Panoramasını Aç
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const OperationsGoogleBaseStage: React.FC = () => {
  const apiKey = getGoogleMapsApiKey();
  const setStageBaseMode = useSimulationStore((s) => s.setStageBaseMode);

  if (!apiKey) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#09111e] p-6">
        <div className="max-w-md bg-[#0d1522] border border-amber-700/70 rounded-lg p-5 text-center space-y-3">
          <div className="text-sm font-semibold text-amber-300">
            Google Maps API Anahtarı Bekleniyor
          </div>
          <p className="text-xs text-slate-300">
            Google Uydu tabanı için API anahtarı bulunamadı. 3D sentetik sahaya geçerek çalışmaya devam edebilirsiniz.
          </p>
          <button
            type="button"
            onClick={() => setStageBaseMode('THREE_3D')}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded"
          >
            3D Saha Görünümüne Geç
          </button>
        </div>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      libraries={['marker', 'streetView', 'maps3d']}
      language="tr"
      region="TR"
    >
      <OperationsGoogleBaseInner />
    </APIProvider>
  );
};
