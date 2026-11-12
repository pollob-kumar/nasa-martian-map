import type { RegionMeta } from './missionTypes';

const R = 3_396_190;
const D2R = Math.PI / 180;

/** lat/lon -> fractional [0..1] position inside the region picture (same maths as backend/app/geo.py). */
export function latLonToFrac(meta: RegionMeta, lat: number, lon: number) {
  const g = meta.grid;
  const row = ((g.north_lat - lat) * R * D2R) / g.cell_m;
  const col = ((lon - g.west_lon) * R * Math.cos(lat * D2R) * D2R) / g.cell_m;
  return { fx: col / g.width, fy: row / g.height };
}

export function fracToLatLon(meta: RegionMeta, fx: number, fy: number) {
  const g = meta.grid;
  const lat = g.north_lat - (fy * g.height * g.cell_m) / (R * D2R);
  const lon = g.west_lon + (fx * g.width * g.cell_m) / (R * Math.cos(lat * D2R) * D2R);
  return { lat, lon };
}

/** metres east / south of (lat0,lon0) -> (dx, dy). */
export function offsetM(lat0: number, lon0: number, lat: number, lon: number) {
  const dy = -(lat - lat0) * R * D2R;
  const dx = (lon - lon0) * R * Math.cos(lat0 * D2R) * D2R;
  return { dx, dy };
}

export const bearingDeg = (dx: number, dy: number) => (Math.atan2(dx, -dy) / D2R + 360) % 360;

export function fmtLat(lat: number) {
  return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
}
export function fmtLon(lon: number) {
  return `${(((lon % 360) + 360) % 360).toFixed(4)}°E`;
}
