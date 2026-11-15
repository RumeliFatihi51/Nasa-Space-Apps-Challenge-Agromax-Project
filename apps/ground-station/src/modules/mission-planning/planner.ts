import * as turf from '@turf/turf';
import { doesSegmentIntersectNoFlyZones, localMetersToLonLat, lonLatToLocalMeters } from '../gis/gisUtils';
import { DRONE_PROFILES } from '../shared/catalog';
import {
  DroneMissionPlan,
  DroneProfileId,
  FaultType,
  GisParcel,
  MissionType,
  MissionWaypoint,
  NoFlyZone,
  SpectralAnalysisResult,
} from '../shared/types';

export interface MissionPlanOptions {
  missionType: MissionType;
  droneProfileId: DroneProfileId;
  altitudeM?: number;
  overlapPct?: number;
  parcel: GisParcel;
  noFlyZones: NoFlyZone[];
  analysis: SpectralAnalysisResult | null;
  activeFaults: FaultType[];
}

export function generateDroneMissionPlan(opts: MissionPlanOptions): DroneMissionPlan {
  const profile = DRONE_PROFILES[opts.droneProfileId];
  const altitudeM = opts.altitudeM ?? profile.defaultAltitudeM;
  const overlapPct = opts.overlapPct ?? (opts.missionType === 'PHOTOGRAMMETRY' ? 80 : 70);
  const speedMs = profile.cruiseSpeedMs;

  // Takeoff point: West edge of expanded parcel (near command PC & helipad)
  const takeoffLocalX = -555;
  const takeoffLocalZ = 310;
  const takeoffLonLat = localMetersToLonLat(takeoffLocalX, takeoffLocalZ, opts.parcel.center);
  const takeoffCoord: [number, number] = [takeoffLonLat.lon, takeoffLonLat.lat];

  const waypoints: MissionWaypoint[] = [];
  const explanationNotes: string[] = [];
  const targetZonesIncluded: string[] = [];

  const pushWp = (
    localX: number,
    localZ: number,
    altM: number,
    action: MissionWaypoint['action'],
    targetZoneCode?: string,
  ) => {
    const ll = localMetersToLonLat(localX, localZ, opts.parcel.center);
    waypoints.push({
      index: waypoints.length,
      lon: ll.lon,
      lat: ll.lat,
      localX: Number(localX.toFixed(1)),
      localZ: Number(localZ.toFixed(1)),
      altitudeM: altM,
      action,
      targetZoneCode,
      speedMs,
      visited: false,
    });
  };

  // 1. Takeoff waypoint
  pushWp(takeoffLocalX, takeoffLocalZ, altitudeM, 'TAKEOFF');

  // Compute parcel bounding box in local meters
  const localCorners = opts.parcel.coordinates.map((c) => lonLatToLocalMeters(c[0], c[1], opts.parcel.center));
  const minX = Math.min(...localCorners.map((p) => p.localX)) + 28;
  const maxX = Math.max(...localCorners.map((p) => p.localX)) - 28;
  const minZ = Math.min(...localCorners.map((p) => p.localZ)) + 28;
  const maxZ = Math.max(...localCorners.map((p) => p.localZ)) - 28;

  if (opts.missionType === 'TARGET_INSPECTION' || opts.missionType === 'VERIFICATION_FLIGHT') {
    const zones = (opts.analysis?.priorityZones ?? []).filter((z) => z.category !== 'NORMAL');
    // Nearest-neighbor ordering from takeoff point
    const remaining = [...zones];
    let currX = takeoffLocalX;
    let currZ = takeoffLocalZ;

    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const lm = lonLatToLocalMeters(
          remaining[i].centerCoord[0],
          remaining[i].centerCoord[1],
          opts.parcel.center,
        );
        const d = Math.hypot(lm.localX - currX, lm.localZ - currZ);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const chosen = remaining.splice(bestIdx, 1)[0];
      const lm = lonLatToLocalMeters(chosen.centerCoord[0], chosen.centerCoord[1], opts.parcel.center);
      targetZonesIncluded.push(chosen.code);

      // Build wide inspection pattern around priority zone (entry + 3 photo passes)
      const r = 68;
      pushWp(lm.localX - r, lm.localZ, altitudeM, 'INSPECT_ZONE', chosen.code);
      pushWp(lm.localX, lm.localZ - r * 0.65, altitudeM, 'CAPTURE_PHOTO', chosen.code);
      pushWp(lm.localX + r, lm.localZ, altitudeM, 'CAPTURE_PHOTO', chosen.code);
      pushWp(lm.localX, lm.localZ + r * 0.65, altitudeM, 'CAPTURE_PHOTO', chosen.code);
      currX = lm.localX;
      currZ = lm.localZ + r * 0.65;

      explanationNotes.push(`${chosen.code} (${chosen.category === 'LOW_NDVI' ? 'Düşük NDVI' : chosen.category === 'LOW_NDMI' ? 'Düşük NDMI' : 'Bulut Belirsiz'}): ${chosen.recommendedAction}`);
    }
  } else if (opts.missionType === 'SIMULATED_VARIABLE_RATE') {
    const zones = (opts.analysis?.priorityZones ?? []).filter(
      (z) => z.category === 'LOW_NDVI' || z.category === 'LOW_NDMI',
    );
    for (const z of zones) {
      const lm = lonLatToLocalMeters(z.centerCoord[0], z.centerCoord[1], opts.parcel.center);
      targetZonesIncluded.push(z.code);
      pushWp(lm.localX - 64, lm.localZ - 46, Math.min(18, altitudeM), 'VRA_SIM', z.code);
      pushWp(lm.localX + 64, lm.localZ - 46, Math.min(18, altitudeM), 'VRA_SIM', z.code);
      pushWp(lm.localX + 64, lm.localZ + 46, Math.min(18, altitudeM), 'VRA_SIM', z.code);
      pushWp(lm.localX - 64, lm.localZ + 46, Math.min(18, altitudeM), 'VRA_SIM', z.code);
      explanationNotes.push(`${z.code}: Sanal değişken oranlı uygulama (VRA) simülasyon koridoru tanımlandı.`);
    }
  } else {
    // AREA_SCAN or PHOTOGRAMMETRY: Wide Boustrophedon (Lawnmower) coverage across expanded parcel
    const footprintW = 2 * altitudeM * Math.tan(((profile.cameraFovDeg * Math.PI) / 180) / 2);
    const laneSpacing = Math.max(
      140,
      Math.min(230, footprintW * (1 - overlapPct / 100) * (opts.missionType === 'PHOTOGRAMMETRY' ? 1.55 : 2.15)),
    );
    const numLanes = Math.max(4, Math.min(6, Math.floor((maxZ - minZ) / laneSpacing) + 1));
    const dz = (maxZ - minZ) / Math.max(1, numLanes - 1);

    for (let i = 0; i < numLanes; i++) {
      const z = minZ + i * dz;
      const leftToRight = i % 2 === 0;
      const startX = leftToRight ? minX : maxX;
      const endX = leftToRight ? maxX : minX;
      const midX = (startX + endX) / 2;

      pushWp(startX, z, altitudeM, 'CAPTURE_PHOTO');
      pushWp(midX, z, altitudeM, 'CAPTURE_PHOTO');
      pushWp(endX, z, altitudeM, 'CAPTURE_PHOTO');
    }
    targetZonesIncluded.push('Tüm Parsel (Boustrophedon)');
    explanationNotes.push(
      `${numLanes} paralel hatlı Boustrophedon tarama rotası (%${overlapPct} bindirme, ${altitudeM} m irtifa) oluşturuldu.`,
    );
  }

  // If NO_FLY_ZONE_CONFLICT fault is injected, deliberately route a waypoint into the NFZ to demonstrate validation rejection
  if (opts.activeFaults.includes('NO_FLY_ZONE_CONFLICT') && opts.noFlyZones.length > 0) {
    const nfzCenter = turf.centroid(turf.polygon([opts.noFlyZones[0].coordinates])).geometry.coordinates;
    const nfzLocal = lonLatToLocalMeters(nfzCenter[0], nfzCenter[1], opts.parcel.center);
    pushWp(nfzLocal.localX, nfzLocal.localZ, altitudeM, 'TRANSIT', 'NFZ-İHLAL');
  }

  // Return to launch & landing
  pushWp(takeoffLocalX, takeoffLocalZ, altitudeM, 'RTL');
  pushWp(takeoffLocalX, takeoffLocalZ, 0, 'LAND');

  // Compute total distance & check no-fly zone intersections
  let totalDistanceM = 0;
  let nfzViolation: NoFlyZone | null = null;

  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const dHoriz = Math.hypot(curr.localX - prev.localX, curr.localZ - prev.localZ);
    const dVert = Math.abs(curr.altitudeM - prev.altitudeM);
    totalDistanceM += Math.hypot(dHoriz, dVert);

    if (!nfzViolation) {
      nfzViolation = doesSegmentIntersectNoFlyZones([prev.lon, prev.lat], [curr.lon, curr.lat], opts.noFlyZones);
    }
  }

  // Hover time at capture/inspect points (~0.6s per inspection/photo with snappy flight)
  const photoStops = waypoints.filter((w) => w.action === 'CAPTURE_PHOTO' || w.action === 'INSPECT_ZONE').length;
  const climbDescentSec = (altitudeM * 2) / 9.0;
  const cruiseSec = totalDistanceM / Math.max(1, speedMs);
  const estimatedDurationSec = Math.round(cruiseSec + climbDescentSec + photoStops * 0.6);

  // Energy consumption model (% battery)
  const maxFlightSec = profile.maxFlightTimeMin * 60;
  const estimatedBatteryUsePct = Number(((estimatedDurationSec / maxFlightSec) * 100).toFixed(1));
  const batteryReservePct = Number(Math.max(0, 100 - estimatedBatteryUsePct).toFixed(1));

  let isFeasible = true;
  let feasibilityReason = `Rota doğrulandı: ${Math.round(totalDistanceM)} m uçuş mesafesi, %${batteryReservePct} güvenli batarya rezervi.`;

  if (nfzViolation) {
    isFeasible = false;
    feasibilityReason = `GÖREV REDDEDİLDİ: Rota "${nfzViolation.name}" uçuşa kapalı bölgesini ihlal ediyor (${nfzViolation.reason}).`;
  } else if (totalDistanceM > profile.maxRangeM) {
    isFeasible = false;
    feasibilityReason = `GÖREV REDDEDİLDİ: Toplam mesafe (${Math.round(totalDistanceM)} m) seçili İHA menzilini (${profile.maxRangeM} m) aşıyor.`;
  } else if (batteryReservePct < 20) {
    isFeasible = false;
    feasibilityReason = `GÖREV REDDEDİLDİ: Kalan batarya rezervi (%${batteryReservePct}) %20 güvenli dönüş sınırının altında.`;
  }

  const missionTitleMap: Record<MissionType, string> = {
    AREA_SCAN: 'Parsel Alan Tarama Görevi (Boustrophedon)',
    TARGET_INSPECTION: 'Görev: Öncelikli Tarla İncelemesi',
    PHOTOGRAMMETRY: 'Yüksek Örtüşmeli Fotogrametri Uçuşu',
    VERIFICATION_FLIGHT: 'Anomali Kontrol ve Doğrulama Uçuşu',
    SIMULATED_VARIABLE_RATE: 'Simüle Edilmiş Değişken Oranlı Uygulama (VRA)',
  };

  return {
    id: `MSN-${Date.now().toString().slice(-5)}`,
    name: missionTitleMap[opts.missionType],
    missionType: opts.missionType,
    droneProfileId: opts.droneProfileId,
    altitudeM,
    overlapPct,
    speedMs,
    takeoffCoord,
    waypoints,
    totalDistanceM: Math.round(totalDistanceM),
    estimatedDurationSec,
    estimatedBatteryUsePct,
    batteryReservePct,
    isFeasible,
    feasibilityReason,
    explanationNotes,
    targetZonesIncluded,
  };
}
