import * as turf from '@turf/turf';
import { GisParcel, NoFlyZone } from '../shared/types';

export function computeParcelMetrics(coordinates: [number, number][]): {
  closedCoords: [number, number][];
  areaHectares: number;
  perimeterMeters: number;
  center: [number, number];
} {
  if (coordinates.length < 3) {
    return {
      closedCoords: coordinates,
      areaHectares: 0,
      perimeterMeters: 0,
      center: coordinates[0] ?? [32.1468, 39.5842],
    };
  }
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const closedCoords =
    first[0] === last[0] && first[1] === last[1] ? [...coordinates] : [...coordinates, first];

  const poly = turf.polygon([closedCoords]);
  const areaSqM = turf.area(poly);
  const line = turf.lineString(closedCoords);
  const perimeterMeters = turf.length(line, { units: 'meters' });
  const centroid = turf.centroid(poly);

  return {
    closedCoords,
    areaHectares: Number((areaSqM / 10000).toFixed(2)),
    perimeterMeters: Math.round(perimeterMeters),
    center: [
      Number(centroid.geometry.coordinates[0].toFixed(6)),
      Number(centroid.geometry.coordinates[1].toFixed(6)),
    ],
  };
}

/**
 * Converts [lon, lat] to local meters [x, z] relative to parcel center.
 * +X = East, +Z = South (Three.js ground plane convention where -Z = North)
 */
export function lonLatToLocalMeters(
  lon: number,
  lat: number,
  origin: [number, number],
): { localX: number; localZ: number } {
  const latRad = (origin[1] * Math.PI) / 180;
  const metersPerDegLat = 111132.92;
  const metersPerDegLon = 111412.84 * Math.cos(latRad);

  const localX = (lon - origin[0]) * metersPerDegLon;
  const localZ = -(lat - origin[1]) * metersPerDegLat;
  return { localX, localZ };
}

export function localMetersToLonLat(
  localX: number,
  localZ: number,
  origin: [number, number],
): { lon: number; lat: number } {
  const latRad = (origin[1] * Math.PI) / 180;
  const metersPerDegLat = 111132.92;
  const metersPerDegLon = 111412.84 * Math.cos(latRad);

  const lon = origin[0] + localX / metersPerDegLon;
  const lat = origin[1] - localZ / metersPerDegLat;
  return { lon: Number(lon.toFixed(6)), lat: Number(lat.toFixed(6)) };
}

export function doesSegmentIntersectNoFlyZones(
  p1: [number, number],
  p2: [number, number],
  noFlyZones: NoFlyZone[],
): NoFlyZone | null {
  const seg = turf.lineString([p1, p2]);
  for (const nfz of noFlyZones) {
    if (nfz.coordinates.length < 4) continue;
    const nfzPoly = turf.polygon([nfz.coordinates]);
    if (
      turf.booleanPointInPolygon(turf.point(p1), nfzPoly) ||
      turf.booleanPointInPolygon(turf.point(p2), nfzPoly) ||
      turf.booleanIntersects(seg, nfzPoly)
    ) {
      return nfz;
    }
  }
  return null;
}

export function parseGeoJsonParcel(jsonText: string): GisParcel | null {
  try {
    const parsed = JSON.parse(jsonText);
    let coords: [number, number][] | null = null;
    let name = 'İçe Aktarılan GeoJSON Parseli';

    if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features) && parsed.features.length > 0) {
      const feat = parsed.features[0];
      if (feat.geometry?.type === 'Polygon') {
        coords = feat.geometry.coordinates[0];
        name = feat.properties?.name || name;
      }
    } else if (parsed.type === 'Feature' && parsed.geometry?.type === 'Polygon') {
      coords = parsed.geometry.coordinates[0];
      name = parsed.properties?.name || name;
    } else if (parsed.type === 'Polygon' && Array.isArray(parsed.coordinates)) {
      coords = parsed.coordinates[0];
    }

    if (!coords || coords.length < 3) return null;
    const metrics = computeParcelMetrics(coords);
    return {
      id: `PARCEL-IMP-${Date.now().toString().slice(-4)}`,
      name,
      cropType: 'Kullanıcı Tanımlı Parsel',
      coordinates: metrics.closedCoords,
      areaHectares: metrics.areaHectares,
      perimeterMeters: metrics.perimeterMeters,
      center: metrics.center,
      elevationM: 880,
    };
  } catch {
    return null;
  }
}
