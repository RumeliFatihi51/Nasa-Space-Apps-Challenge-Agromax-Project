export const GMP_ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

export const POLATLI_HIGHWAY_JUNCTION = {
  name: 'Polatlı D200 Karayolu Erişimi',
  lat: 39.5841,
  lng: 32.1419,
};

export function getGoogleMapsApiKey(): string {
  const fromViteEnv = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const fromDefine = typeof __GOOGLE_MAPS_API_KEY__ !== 'undefined' ? __GOOGLE_MAPS_API_KEY__ : '';
  const fromGlobal = (globalThis as { GOOGLE_MAPS_API_KEY?: string }).GOOGLE_MAPS_API_KEY;
  const raw = (fromViteEnv || fromDefine || fromGlobal || '').trim();
  if (!raw || raw === 'MY_GOOGLE_MAPS_API_KEY') return '';
  return raw;
}

export interface StaticSatelliteOptions {
  apiKey: string;
  center: { lat: number; lng: number };
  zoom?: number;
  width?: number;
  height?: number;
  mapType?: 'hybrid' | 'satellite' | 'terrain' | 'roadmap';
  markers?: Array<{ lat: number; lng: number; color?: string; label?: string }>;
  parcelPath?: Array<[number, number]>; // [lon, lat]
}

export function buildStaticSatelliteUrl(opts: StaticSatelliteOptions): string {
  const params = new URLSearchParams({
    center: `${opts.center.lat.toFixed(6)},${opts.center.lng.toFixed(6)}`,
    zoom: String(opts.zoom ?? 16),
    size: `${opts.width ?? 640}x${opts.height ?? 320}`,
    scale: '2',
    maptype: opts.mapType ?? 'hybrid',
    language: 'tr',
    region: 'TR',
    key: opts.apiKey,
    solution_id: GMP_ATTRIBUTION_ID,
  });

  if (opts.markers) {
    opts.markers.forEach((m) => {
      const color = m.color ?? 'green';
      const label = m.label ? `label:${m.label}|` : '';
      params.append('markers', `color:${color}|${label}${m.lat.toFixed(6)},${m.lng.toFixed(6)}`);
    });
  }

  if (opts.parcelPath && opts.parcelPath.length >= 3) {
    const ring = [...opts.parcelPath, opts.parcelPath[0]]
      .map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
      .join('|');
    params.append('path', `color:0x10b981ff|weight:3|fillcolor:0x10b98126|${ring}`);
  }

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export interface StaticStreetViewOptions {
  apiKey: string;
  location: { lat: number; lng: number };
  width?: number;
  height?: number;
  heading?: number;
  fov?: number;
  pitch?: number;
  radius?: number;
}

export function buildStaticStreetViewUrl(opts: StaticStreetViewOptions): string {
  const params = new URLSearchParams({
    location: `${opts.location.lat.toFixed(6)},${opts.location.lng.toFixed(6)}`,
    size: `${opts.width ?? 640}x${opts.height ?? 320}`,
    fov: String(opts.fov ?? 90),
    pitch: String(opts.pitch ?? 2),
    radius: String(opts.radius ?? 3000),
    source: 'outdoor',
    return_error_code: 'true',
    key: opts.apiKey,
    solution_id: GMP_ATTRIBUTION_ID,
  });

  if (typeof opts.heading === 'number') {
    params.set('heading', String(Math.round(opts.heading)));
  }

  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}
