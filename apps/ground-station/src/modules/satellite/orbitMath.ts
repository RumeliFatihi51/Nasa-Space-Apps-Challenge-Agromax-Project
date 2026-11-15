import { GROUND_STATION_COORDS } from '../shared/catalog';
import { OrbitTelemetry, SatelliteProfile } from '../shared/types';

const EARTH_RADIUS_KM = 6371.0;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MU_EARTH = 398600.4418; // km^3 / s^2

export interface EcefVec {
  x: number;
  y: number;
  z: number;
}

export function geodeticToEcef(latDeg: number, lonDeg: number, altKm: number): EcefVec {
  const lat = latDeg * DEG_TO_RAD;
  const lon = lonDeg * DEG_TO_RAD;
  const r = EARTH_RADIUS_KM + altKm;
  return {
    x: r * Math.cos(lat) * Math.cos(lon),
    y: r * Math.sin(lat),
    z: -r * Math.cos(lat) * Math.sin(lon), // Matches Three.js sphere UV convention (+X=0E, +Z=90W, -Z=90E, +Y=North)
  };
}

/**
 * Computes satellite sub-point (lat, lon) along an ascending pass directly
 * configured to traverse the Ankara/Polatlı visibility cone cleanly over a ~600s pass window.
 * passPhase in [-0.25 .. 1.25]:
 *   < 0.08 or > 0.92 => below horizon (for elevation validation tests)
 *   0.50 => peak elevation (~72 deg) over Ankara-Polatlı
 */
export function computeSatellitePassState(
  satellite: SatelliteProfile,
  passPhase: number,
  forceLosLoss = false,
): OrbitTelemetry {
  const gsLat = GROUND_STATION_COORDS.latDeg;
  const gsLon = GROUND_STATION_COORDS.lonDeg;
  const gsAltKm = GROUND_STATION_COORDS.altM / 1000;

  // Orbital velocity (vis-viva circular approximation)
  const rOrbit = EARTH_RADIUS_KM + satellite.altitudeKm;
  const velocityKmS = Math.sqrt(MU_EARTH / rOrbit);

  // Sweep ground track across +/- 26 degrees latitude around Ground Station
  // When passPhase = 0.5, satellite is near max elevation over Polatlı
  const incRad = satellite.inclinationDeg * DEG_TO_RAD;
  const alongTrackAngle = (passPhase - 0.5) * 0.95; // radians along orbit arc (~ +/- 27 deg)

  // Slight eastern/western cross-track offset depending on satellite profile
  const crossTrackLonOffset =
    satellite.id === 'EUMETCAST_DATA'
      ? 1.8
      : satellite.id === 'SENTINEL_2_OPTICAL'
        ? -2.2
        : satellite.id === 'LANDSAT_8_9'
          ? 2.9
          : -1.1;

  // Ascending/descending SSO ground track projection
  const latDeg = Math.max(
    -85,
    Math.min(85, gsLat + Math.sin(alongTrackAngle) * Math.sin(incRad) * 52),
  );
  const lonDeg =
    gsLon +
    crossTrackLonOffset +
    Math.sin(alongTrackAngle) * Math.cos(incRad) * 48 -
    (passPhase - 0.5) * 3.5; // Earth rotation westward drift

  // Standard spherical-Earth topocentric Azimuth / Elevation / Range
  const lat1 = gsLat * DEG_TO_RAD;
  const lon1 = gsLon * DEG_TO_RAD;
  const lat2 = latDeg * DEG_TO_RAD;
  const lon2 = lonDeg * DEG_TO_RAD;

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  // Central angle gamma between ground station and sub-satellite point
  const sinHalfGamma = Math.sqrt(
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2,
  );
  const gamma = 2 * Math.asin(Math.min(1, sinHalfGamma));

  const rs = EARTH_RADIUS_KM + satellite.altitudeKm;
  const re = EARTH_RADIUS_KM + gsAltKm;

  const slantRangeKm = Math.sqrt(re * re + rs * rs - 2 * re * rs * Math.cos(gamma));

  // Elevation angle above local tangent plane
  const cosEl = (rs * Math.sin(gamma)) / Math.max(1e-6, slantRangeKm);
  const sinEl = (rs * Math.cos(gamma) - re) / Math.max(1e-6, slantRangeKm);
  let elevationDeg = Math.atan2(sinEl, cosEl) * RAD_TO_DEG;

  if (forceLosLoss) {
    elevationDeg = -4.2;
  }

  // Forward azimuth from Ground Station (0 = North, 90 = East, 180 = South, 270 = West)
  const yAz = Math.sin(dLon) * Math.cos(lat2);
  const xAz = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const azimuthDeg = ((Math.atan2(yAz, xAz) * RAD_TO_DEG) + 360) % 360;

  // Doppler shift approximation based on radial range rate
  const cKmS = 299792.458;
  const radialVelFactor = -Math.sin(alongTrackAngle * 1.4) * Math.cos(Math.max(0, elevationDeg) * DEG_TO_RAD);
  const dopplerKHz = (satellite.frequencyGHz * 1e6 * (velocityKmS * radialVelFactor)) / cKmS;

  const isAboveHorizon = elevationDeg > 0;

  return {
    latDeg,
    lonDeg,
    altKm: satellite.altitudeKm,
    velocityKmS,
    azimuthDeg,
    elevationDeg,
    slantRangeKm,
    isAboveHorizon,
    dopplerKHz,
    passProgress: Math.max(0, Math.min(1, passPhase)),
    aosTimeLabel: '14:18:10 UTC',
    losTimeLabel: '14:27:45 UTC',
  };
}

/**
 * Generates an orbital ring and ground track points for the 3D Earth scene.
 */
export function sampleOrbitTrajectory(
  satellite: SatelliteProfile,
  segments = 96,
): { orbitPoints: { latDeg: number; lonDeg: number; altKm: number }[]; groundTrack: { latDeg: number; lonDeg: number }[] } {
  const orbitPoints: { latDeg: number; lonDeg: number; altKm: number }[] = [];
  const groundTrack: { latDeg: number; lonDeg: number }[] = [];
  const gsLat = GROUND_STATION_COORDS.latDeg;
  const gsLon = GROUND_STATION_COORDS.lonDeg;
  const incRad = satellite.inclinationDeg * DEG_TO_RAD;
  const crossTrackLonOffset =
    satellite.id === 'EUMETCAST_DATA'
      ? 1.8
      : satellite.id === 'SENTINEL_2_OPTICAL'
        ? -2.2
        : satellite.id === 'LANDSAT_8_9'
          ? 2.9
          : -1.1;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = (t - 0.5) * Math.PI * 2;
    const latDeg = Math.asin(Math.sin(incRad) * Math.sin(angle + 0.72)) * RAD_TO_DEG;
    const lonOffset = Math.atan2(Math.cos(incRad) * Math.sin(angle + 0.72), Math.cos(angle + 0.72)) * RAD_TO_DEG;
    const lonDeg = gsLon + crossTrackLonOffset + lonOffset - 38;
    orbitPoints.push({ latDeg, lonDeg, altKm: satellite.altitudeKm });
    if (Math.abs(t - 0.5) < 0.25) {
      const gtLat = gsLat + Math.sin((t - 0.5) * 4 * 0.95) * Math.sin(incRad) * 52;
      const gtLon = gsLon + crossTrackLonOffset + Math.sin((t - 0.5) * 4 * 0.95) * Math.cos(incRad) * 48;
      groundTrack.push({ latDeg: gtLat, lonDeg: gtLon });
    }
  }

  return { orbitPoints, groundTrack };
}

/**
 * Computes shortest angular difference in degrees (-180..180)
 */
export function shortestAngleDelta(targetDeg: number, currentDeg: number): number {
  let diff = ((targetDeg - currentDeg + 540) % 360) - 180;
  return diff;
}

/**
 * Generates pass elevation & predicted SNR curve for telemetry chart.
 */
export function generatePassCurve(satellite: SatelliteProfile): { phasePct: number; elevationDeg: number; predictedSnrDb: number }[] {
  const pts: { phasePct: number; elevationDeg: number; predictedSnrDb: number }[] = [];
  for (let i = 0; i <= 24; i++) {
    const p = i / 24;
    const state = computeSatellitePassState(satellite, p, false);
    const el = Math.max(-5, state.elevationDeg);
    const snr = el > 0 ? 6 + Math.sin((el / 90) * (Math.PI / 2)) * 16 : 0;
    pts.push({
      phasePct: Math.round(p * 100),
      elevationDeg: Number(el.toFixed(1)),
      predictedSnrDb: Number(snr.toFixed(1)),
    });
  }
  return pts;
}
