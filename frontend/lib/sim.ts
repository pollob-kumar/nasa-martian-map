import type { Hazard, RegionMeta, RouteResult, Site } from './missionTypes';
import type { DetectedObject, NavigationRoute, Waypoint } from '../types';
import { api } from './api';
import { bearingDeg, fmtLat, fmtLon, offsetM } from './geo';

export interface PathState {
  cum: number[]; // cumulative metres along the route
  total: number;
}

export function pathState(route: RouteResult | null): PathState {
  const pts = route?.points ?? [];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { cum, total: cum[cum.length - 1] ?? 0 };
}

/** Where the (simulated) astronaut is after walking `walked` metres along the route. */
export function positionAt(route: RouteResult | null, ps: PathState, walked: number) {
  const pts = route?.points;
  if (!pts || pts.length === 0) return null;
  const d = Math.min(Math.max(walked, 0), ps.total);
  let i = 1;
  while (i < pts.length - 1 && ps.cum[i] < d) i++;
  const a = pts[i - 1] ?? pts[0];
  const b = pts[i] ?? a;
  const seg = Math.max(ps.cum[i] - ps.cum[i - 1], 1e-6);
  const t = Math.min(Math.max((d - ps.cum[i - 1]) / seg, 0), 1);
  const lerp = (p: number, q: number) => p + (q - p) * t;
  // look ahead ~40 m for a stable heading
  const ahead = pts[Math.min(pts.length - 1, i + 2)] ?? b;
  const heading = bearingDeg(ahead.x - a.x, ahead.y - a.y);
  return { lat: lerp(a.lat, b.lat), lon: lerp(a.lon, b.lon), elev: lerp(a.elev_m, b.elev_m), slope: lerp(a.slope_deg, b.slope_deg), heading };
}

/** Turn the cell path into a few human turn-by-turn steps. */
export function buildNavRoute(route: RouteResult | null, ps: PathState, goal: Site | null, walked: number): NavigationRoute {
  const pts = route?.points ?? [];
  const wps: (Waypoint & { at: number })[] = [];
  let lastHeading: number | null = null;
  let lastAt = 0;
  for (let i = 2; i < pts.length; i++) {
    const h = bearingDeg(pts[i].x - pts[i - 2].x, pts[i].y - pts[i - 2].y);
    if (lastHeading === null) lastHeading = h;
    let diff = ((h - lastHeading + 540) % 360) - 180;
    if ((Math.abs(diff) > 30 && ps.cum[i] - lastAt > 60) || ps.cum[i] - lastAt > 400) {
      const turn: Waypoint['turnType'] = Math.abs(diff) <= 30 ? 'straight' : diff > 60 ? 'sharp-right' : diff > 0 ? 'slight-right' : 'slight-left';
      wps.push({
        id: `wp-${i}`, at: ps.cum[i], name: `Waypoint ${wps.length + 1}`, distanceMeters: 0,
        instruction: turn === 'straight' ? `Continue bearing ${Math.round(h)}°` : `Turn ${diff > 0 ? 'right' : 'left'} ${Math.round(Math.abs(diff))}° → bearing ${Math.round(h)}°`,
        turnType: turn, bearing: Math.round(h), completed: false,
      });
      lastHeading = h;
      lastAt = ps.cum[i];
    }
  }
  wps.push({
    id: 'wp-goal', at: ps.total, name: goal?.name ?? 'Destination', distanceMeters: 0,
    instruction: `Arrive at ${goal?.name ?? 'destination'}`, turnType: 'destination',
    bearing: Math.round(bearingDeg((pts.at(-1)?.x ?? 0) - (pts.at(-2)?.x ?? 0), (pts.at(-1)?.y ?? 0) - (pts.at(-2)?.y ?? 0))), completed: false,
  });
  const idx = Math.max(0, wps.findIndex((w) => w.at > walked));
  const last = pts.at(-1);
  return {
    destinationName: goal?.name ?? '—',
    destinationType: goal?.goal ?? '',
    totalDistanceMeters: ps.total,
    estimatedTimeSeconds: Math.round((route?.walk_time_min ?? 0) * 60),
    currentStepIndex: idx,
    currentDistanceRemaining: Math.max(0, ps.total - walked),
    waypoints: wps.map((w) => ({ ...w, distanceMeters: Math.max(0, w.at - walked), completed: w.at <= walked })),
    targetCoordinates: { lat: last ? fmtLat(last.lat) : '', lng: last ? fmtLon(last.lon) : '', elevation: last ? `${Math.round(last.elev_m)} m` : '' },
  };
}

/** Sites + hazards seen from the astronaut's current position (feeds the AR overlay & radar). */
export function buildObjects(meta: RegionMeta | null, sites: Site[], hazards: Hazard[], pos: { lat: number; lon: number } | null): DetectedObject[] {
  if (!meta || !pos) return [];
  const out: DetectedObject[] = [];
  for (const s of sites) {
    const { dx, dy } = offsetM(pos.lat, pos.lon, s.lat, s.lon);
    const d = Math.hypot(dx, dy);
    out.push({
      id: s.id, category: 'SCIENCE', categoryLabel: 'SCIENCE SITE', title: s.name, subtitle: s.goal,
      distanceMeters: Math.round(d), initialDistance: Math.round(d), azimuthDeg: bearingDeg(dx, dy), elevationDeg: 0,
      image: s.pov_images[0] ? api.assetUrl(s.pov_images[0].url) : undefined,
      nasaMission: s.mission,
      details: [
        { label: 'Science goal', value: s.goal || '—' },
        { label: 'About', value: s.description || '—' },
        { label: 'Mission / source', value: s.mission || '—' },
        { label: 'Observed', value: s.observed || '—' },
        { label: 'Reference', value: s.source_url || 'not provided' },
      ],
    });
  }
  for (const h of hazards) {
    const { dx, dy } = offsetM(pos.lat, pos.lon, h.lat, h.lon);
    const d = Math.hypot(dx, dy);
    out.push({
      id: h.id, category: 'HAZARD', categoryLabel: 'MARKED HAZARD', title: h.name, subtitle: h.reason,
      distanceMeters: Math.round(d), initialDistance: Math.round(d), azimuthDeg: bearingDeg(dx, dy), elevationDeg: 0,
      hazardLevel: 'high', nasaMission: 'Analyst-marked from orbital imagery',
      details: [
        { label: 'Radius', value: `${h.radius_m} m` },
        { label: 'Reason', value: h.reason || '—' },
        { label: 'Source', value: h.source_url || 'not provided' },
        { label: 'Note', value: 'A route avoids this area. Potential hazard, not a guarantee of safety elsewhere.' },
      ],
    });
  }
  return out;
}


/** Interpolate a per-point route quantity (t_min or o2_used_pct) at `walked` metres. */
export function quantityAt(route: RouteResult | null, ps: PathState, walked: number, key: 't_min' | 'o2_used_pct'): number | null {
  const pts = route?.points;
  if (!pts || pts.length === 0 || pts[0][key] == null) return null;
  const d = Math.min(Math.max(walked, 0), ps.total);
  let i = 1;
  while (i < pts.length - 1 && ps.cum[i] < d) i++;
  const a = pts[i - 1] ?? pts[0];
  const b = pts[i] ?? a;
  const seg = Math.max(ps.cum[i] - ps.cum[i - 1], 1e-6);
  const t = Math.min(Math.max((d - ps.cum[i - 1]) / seg, 0), 1);
  return (a[key] as number) + ((b[key] as number) - (a[key] as number)) * t;
}

/** Steepest slope within the next `ahead` metres of the route, and how far away it is. */
export function slopeAhead(route: RouteResult | null, ps: PathState, walked: number, ahead = 80): { slope: number; atM: number } | null {
  const pts = route?.points;
  if (!pts) return null;
  let best: { slope: number; atM: number } | null = null;
  for (let i = 0; i < pts.length; i++) {
    const dm = ps.cum[i] - walked;
    if (dm < 0 || dm > ahead) continue;
    if (!best || pts[i].slope_deg > best.slope) best = { slope: pts[i].slope_deg, atM: dm };
  }
  return best;
}
