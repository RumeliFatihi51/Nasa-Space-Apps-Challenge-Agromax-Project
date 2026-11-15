import { localMetersToLonLat } from '../gis/gisUtils';
import { DRONE_PROFILES } from '../shared/catalog';
import {
  DroneMissionPlan,
  DroneTelemetry,
  FaultType,
  GisParcel,
} from '../shared/types';

export function createInitialDroneTelemetry(parcel: GisParcel): DroneTelemetry {
  const takeoffX = -555;
  const takeoffZ = 310;
  const ll = localMetersToLonLat(takeoffX, takeoffZ, parcel.center);
  return {
    lat: ll.lat,
    lon: ll.lon,
    localX: takeoffX,
    localZ: takeoffZ,
    altitudeM: 0,
    groundSpeedMs: 0,
    verticalSpeedMs: 0,
    headingDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    batteryPct: 100,
    payloadTankPct: 100,
    appliedSprayLiters: 0,
    appliedFertilizerKg: 0,
    estimatedRemainingMin: 34,
    missionProgressPct: 0,
    gpsFix: 'RTK_FIXED',
    satellitesVisible: 18,
    linkQualityPct: 98,
    linkConnected: true,
    flightMode: 'HAZIR_BEKLEME',
    cameraStatus: 'BEKLEMEDE',
    photosCollected: 0,
    currentWaypointIndex: 0,
    totalWaypoints: 0,
    distanceFlownM: 0,
    flightElapsedSec: 0,
    actualTrack: [],
    capturedPhotos: [],
  };
}

export interface DroneStepOutcome {
  telemetry: DroneTelemetry;
  updatedPlan: DroneMissionPlan;
  completedNow: boolean;
  abortedReason: string | null;
  newLogMessage: string | null;
}

/**
 * Advances kinematic drone simulation by dtSec:
 * - Smooth acceleration, velocity cap, climb/descent vertical speeds
 * - Yaw heading alignment toward next waypoint
 * - Photo collection at CAPTURE_PHOTO / INSPECT_ZONE waypoints
 * - Battery discharge proportional to climb/cruise/hover power
 * - Failsafe RTL on CRITICAL_BATTERY or DRONE_LINK_LOSS
 */
export function stepDronePhysics(
  prev: DroneTelemetry,
  plan: DroneMissionPlan,
  parcel: GisParcel,
  activeFaults: FaultType[],
  dtSec: number,
  motorWarmupSec: number,
  agronomicOp: 'INSPECTION' | 'SPRAYING' | 'IRRIGATION' | 'FERTILIZATION' = 'INSPECTION',
): DroneStepOutcome {
  const profile = DRONE_PROFILES[plan.droneProfileId];
  let state: DroneTelemetry = {
    ...prev,
    actualTrack: prev.actualTrack,
    capturedPhotos: prev.capturedPhotos,
  };

  let waypoints = plan.waypoints.map((w) => ({ ...w }));
  let abortedReason: string | null = null;
  let completedNow = false;
  let newLogMessage: string | null = null;

  // Handle link loss fault
  const linkLost = activeFaults.includes('DRONE_LINK_LOSS');
  state.linkConnected = !linkLost;
  state.linkQualityPct = linkLost ? 0 : Math.max(82, 98 - Math.round(Math.hypot(state.localX, state.localZ) / 60));

  // Handle critical battery fault injection
  if (activeFaults.includes('CRITICAL_BATTERY') && state.batteryPct > 16) {
    state.batteryPct = 15.8;
    newLogMessage = 'ACİL DURUM: Batarya kritik seviyenin (%18) altına düştü — Güvenli Dönüş (RTL) başlatıldı.';
  }

  // Trigger Failsafe RTL if battery <= 18% or link lost while airborne
  const isAirborne = state.altitudeM > 0.5 || state.flightMode === 'KALKIS_TIRMANMA';
  if (
    isAirborne &&
    (state.batteryPct <= 18 || linkLost) &&
    state.flightMode !== 'ACIL_DURUM_RTL' &&
    state.flightMode !== 'INIS' &&
    state.flightMode !== 'GOREV_TAMAMLANDI'
  ) {
    state.flightMode = 'ACIL_DURUM_RTL';
    state.cameraStatus = 'BEKLEMEDE';
    abortedReason = linkLost
      ? 'İHA C2/Telemetri bağlantısı kesildi; otomatik Eve Dönüş (RTL) prosedürü uygulandı.'
      : 'Kritik batarya seviyesi (%18 altı); görev iptal edilip kalkış noktasına güvenli dönüş başlatıldı.';
    if (!newLogMessage) newLogMessage = abortedReason;
  }

  // Phase 1: Motor startup warmup
  if (state.flightMode === 'HAZIR_BEKLEME') {
    state.flightMode = 'MOTOR_BASLATMA';
    state.totalWaypoints = waypoints.length;
    state.currentWaypointIndex = 0;
    state.cameraStatus = 'BEKLEMEDE';
    newLogMessage = `${profile.name} motorları başlatılıyor (RTK-GPS kilitli, ${state.satellitesVisible} uydu).`;
    return {
      telemetry: state,
      updatedPlan: { ...plan, waypoints },
      completedNow: false,
      abortedReason: null,
      newLogMessage,
    };
  }

  if (state.flightMode === 'MOTOR_BASLATMA') {
    state.flightElapsedSec += dtSec;
    state.batteryPct = Math.max(0, state.batteryPct - 0.02 * dtSec);
    if (state.flightElapsedSec >= motorWarmupSec) {
      state.flightMode = 'KALKIS_TIRMANMA';
      newLogMessage = `Kalkış gerçekleşti — Görev irtifasına (${plan.altitudeM} m) tırmanılıyor.`;
    }
    return {
      telemetry: state,
      updatedPlan: { ...plan, waypoints },
      completedNow: false,
      abortedReason: null,
      newLogMessage,
    };
  }

  // Emergency RTL trajectory directly back to takeoff pad, then descend
  if (state.flightMode === 'ACIL_DURUM_RTL') {
    const home = waypoints[0];
    const dx = home.localX - state.localX;
    const dz = home.localZ - state.localZ;
    const horizDist = Math.hypot(dx, dz);

    if (horizDist > 3.0) {
      const targetSpeed = profile.cruiseSpeedMs * 1.1;
      state.groundSpeedMs = Math.min(targetSpeed, state.groundSpeedMs + 16.0 * dtSec);
      const step = Math.min(horizDist, state.groundSpeedMs * dtSec);
      state.localX += (dx / horizDist) * step;
      state.localZ += (dz / horizDist) * step;
      state.distanceFlownM += step;
      state.headingDeg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
      state.pitchDeg = -11.5;
    } else {
      state.groundSpeedMs = Math.max(0, state.groundSpeedMs - 18 * dtSec);
      state.pitchDeg = 0;
      state.flightMode = 'INIS';
      newLogMessage = 'Kalkış noktası üzerine ulaşıldı — Emniyet inişi yapılıyor.';
    }
  } else if (state.flightMode === 'KALKIS_TIRMANMA') {
    const targetAlt = plan.altitudeM;
    const climbRate = 10.5; // m/s brisk vertical climb
    state.verticalSpeedMs = climbRate;
    state.altitudeM = Math.min(targetAlt, state.altitudeM + climbRate * dtSec);
    if (Math.abs(state.altitudeM - targetAlt) < 0.4) {
      state.altitudeM = targetAlt;
      state.verticalSpeedMs = 0;
      if (waypoints[0]) waypoints[0].visited = true;
      state.currentWaypointIndex = Math.min(1, waypoints.length - 1);
      state.flightMode = 'ROTA_SEYRI';
      newLogMessage = `Görev irtifasına (${targetAlt} m) ulaşıldı. Hızlı otonom rota seyri başlıyor.`;
    }
  } else if (state.flightMode === 'ROTA_SEYRI' || state.flightMode === 'BOLGE_INCELEME' || state.flightMode === 'EVE_DONUS_RTL') {
    const wpIdx = state.currentWaypointIndex;
    const targetWp = waypoints[wpIdx];

    if (!targetWp) {
      state.flightMode = 'INIS';
    } else if (targetWp.action === 'LAND') {
      state.flightMode = 'INIS';
    } else {
      const dx = targetWp.localX - state.localX;
      const dz = targetWp.localZ - state.localZ;
      const dAlt = targetWp.altitudeM - state.altitudeM;
      const horizDist = Math.hypot(dx, dz);

      // Desired heading (0 = North = -Z, 90 = East = +X)
      if (horizDist > 1.0) {
        const targetHeading = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
        const diff = ((targetHeading - state.headingDeg + 540) % 360) - 180;
        const maxTurn = 240 * dtSec; // responsive yaw turn rate
        if (Math.abs(diff) <= maxTurn) state.headingDeg = targetHeading;
        else state.headingDeg = (state.headingDeg + Math.sign(diff) * maxTurn + 360) % 360;

        // Snappy acceleration & tight waypoint deceleration
        const desiredSpeed = horizDist < 7 ? Math.max(7.0, targetWp.speedMs * 0.55) : targetWp.speedMs;
        if (state.groundSpeedMs < desiredSpeed) {
          state.groundSpeedMs = Math.min(desiredSpeed, state.groundSpeedMs + 18.0 * dtSec);
        } else {
          state.groundSpeedMs = Math.max(desiredSpeed, state.groundSpeedMs - 16.0 * dtSec);
        }

        const moveStep = Math.min(horizDist, state.groundSpeedMs * dtSec);
        state.localX += (dx / horizDist) * moveStep;
        state.localZ += (dz / horizDist) * moveStep;
        state.distanceFlownM += moveStep;
        state.pitchDeg = -Math.min(15, (state.groundSpeedMs / profile.cruiseSpeedMs) * 12);
        state.rollDeg = Math.max(-14, Math.min(14, diff * 0.16));
      }

      // Vertical adjustment
      if (Math.abs(dAlt) > 0.25) {
        const vSpeed = Math.sign(dAlt) * 8.0;
        state.verticalSpeedMs = vSpeed;
        const altStep = Math.sign(dAlt) * Math.min(Math.abs(dAlt), 8.0 * dtSec);
        state.altitudeM += altStep;
      } else {
        state.altitudeM = targetWp.altitudeM;
        state.verticalSpeedMs = 0;
      }

      // Arrival check
      if (horizDist <= 3.5 && Math.abs(targetWp.altitudeM - state.altitudeM) <= 1.0) {
        targetWp.visited = true;

        if (targetWp.action === 'CAPTURE_PHOTO' || targetWp.action === 'INSPECT_ZONE' || targetWp.action === 'VRA_SIM') {
          state.flightMode = 'BOLGE_INCELEME';
          state.cameraStatus = 'CEKIM_YAPILIYOR';
          state.photosCollected += 1;
          const photoLL = localMetersToLonLat(state.localX, state.localZ, parcel.center);
          state.capturedPhotos = [
            ...state.capturedPhotos,
            {
              localX: Number(state.localX.toFixed(1)),
              localZ: Number(state.localZ.toFixed(1)),
              lon: photoLL.lon,
              lat: photoLL.lat,
              zone: targetWp.targetZoneCode,
              timestamp: new Date().toLocaleTimeString('tr-TR', { hour12: false }),
            },
          ];
          if (targetWp.targetZoneCode) {
            newLogMessage = `${targetWp.targetZoneCode} noktasında görüntü/veri yakalandı (Toplam: ${state.photosCollected}).`;
          }
        } else if (targetWp.action === 'RTL') {
          state.flightMode = 'EVE_DONUS_RTL';
          state.cameraStatus = 'AKTARIMDA';
          newLogMessage = 'Görev noktaları tamamlandı — Eve Dönüş (RTL) rotasına geçildi.';
        }

        if (wpIdx + 1 < waypoints.length) {
          state.currentWaypointIndex = wpIdx + 1;
          if (waypoints[state.currentWaypointIndex].action === 'RTL') {
            state.flightMode = 'EVE_DONUS_RTL';
          }
        } else {
          state.flightMode = 'INIS';
        }
      } else if (state.flightMode === 'BOLGE_INCELEME') {
        state.flightMode = 'ROTA_SEYRI';
        state.cameraStatus = 'BEKLEMEDE';
      }
    }
  } else if (state.flightMode === 'INIS') {
    state.groundSpeedMs = Math.max(0, state.groundSpeedMs - 14 * dtSec);
    state.pitchDeg = 0;
    state.rollDeg = 0;
    const descentRate = -7.5;
    state.verticalSpeedMs = descentRate;
    state.altitudeM = Math.max(0, state.altitudeM + descentRate * dtSec);
    if (state.altitudeM <= 0.08) {
      state.altitudeM = 0;
      state.verticalSpeedMs = 0;
      state.groundSpeedMs = 0;
      state.flightMode = 'GOREV_TAMAMLANDI';
      state.cameraStatus = 'AKTARIMDA';
      if (waypoints[waypoints.length - 1]) waypoints[waypoints.length - 1].visited = true;
      completedNow = true;
      newLogMessage = `İHA güvenli iniş yaptı. ${state.photosCollected} görüntü AgroMax sunucusuna aktarılıyor.`;
    }
  }

  // Update coordinates, elapsed time, battery discharge, and track
  state.flightElapsedSec += dtSec;
  const currentLL = localMetersToLonLat(state.localX, state.localZ, parcel.center);
  state.lon = currentLL.lon;
  state.lat = currentLL.lat;

  // Realistic battery drain rate (% per second) based on airframe endurance
  if (state.flightMode !== 'GOREV_TAMAMLANDI') {
    const drainPerSec = 100 / (profile.maxFlightTimeMin * 60);
    const climbPenalty = state.verticalSpeedMs > 0.5 ? 1.25 : 1.0;
    state.batteryPct = Number(Math.max(0, state.batteryPct - drainPerSec * climbPenalty * dtSec).toFixed(2));
  }

  // Payload tank depletion & applied agronomic quantity during active application
  if (
    (state.flightMode === 'ROTA_SEYRI' || state.flightMode === 'BOLGE_INCELEME') &&
    state.payloadTankPct > 0
  ) {
    if (agronomicOp === 'SPRAYING') {
      const litersStep = 0.95 * dtSec;
      state.appliedSprayLiters = Number((state.appliedSprayLiters + litersStep).toFixed(2));
      state.payloadTankPct = Number(Math.max(0, state.payloadTankPct - (litersStep / 16) * 100).toFixed(1));
    } else if (agronomicOp === 'FERTILIZATION') {
      const kgStep = 1.25 * dtSec;
      state.appliedFertilizerKg = Number((state.appliedFertilizerKg + kgStep).toFixed(2));
      state.payloadTankPct = Number(Math.max(0, state.payloadTankPct - (kgStep / 22) * 100).toFixed(1));
    }
  }

  state.estimatedRemainingMin = Number(((state.batteryPct / 100) * profile.maxFlightTimeMin).toFixed(1));
  const visitedCount = waypoints.filter((w) => w.visited).length;
  state.missionProgressPct =
    state.flightMode === 'GOREV_TAMAMLANDI'
      ? 100
      : Number(Math.min(99, (visitedCount / Math.max(1, waypoints.length)) * 100).toFixed(1));

  // Append track point if moved >= 4 meters from last recorded point
  const lastTrack = state.actualTrack[state.actualTrack.length - 1];
  if (
    !lastTrack ||
    Math.hypot(state.localX - lastTrack.localX, state.localZ - lastTrack.localZ) >= 4 ||
    Math.abs(state.altitudeM - lastTrack.altitudeM) >= 3
  ) {
    state.actualTrack = [
      ...state.actualTrack,
      {
        localX: Number(state.localX.toFixed(1)),
        localZ: Number(state.localZ.toFixed(1)),
        altitudeM: Number(state.altitudeM.toFixed(1)),
        lon: state.lon,
        lat: state.lat,
      },
    ];
  }

  return {
    telemetry: state,
    updatedPlan: { ...plan, waypoints },
    completedNow,
    abortedReason,
    newLogMessage,
  };
}
