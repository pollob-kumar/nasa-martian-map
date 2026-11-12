'use client';

import React from 'react';
import type { RegionSummary } from '../lib/missionTypes';

interface Props {
  regions: RegionSummary[];
  activeId: string | null;
  onPick: (id: string) => void;
  compact?: boolean;
}

/** Plain lat/lon chart of Mars (no image = nothing pretends to be NASA imagery) showing where each selectable region is.
 *  The five Bangladesh-named craters are plotted at their (published / approximate) crater-centre coordinates. */
export const MarsOverviewMap: React.FC<Props> = ({ regions, activeId, onPick, compact }) => {
  const W = 720, H = 360;
  const X = (lon: number) => (((lon % 360) + 360) % 360) / 360 * W;
  const Y = (lat: number) => ((90 - lat) / 180) * H;
  const pts = regions
    .filter((r) => r.role === 'primary' || r.role === 'bangladesh')
    .map((r) => {
      const c = r.bangladesh?.crater_center ?? r.center;
      return { r, x: X(c.lon), y: Y(c.lat), bd: r.role === 'bangladesh', approx: r.coord_status === 'approx_needs_verify' };
    });
  return (
    <div className="space-y-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded border border-white/15 bg-slate-950" role="img" aria-label="Mars overview chart with selectable regions">
        {[-60, -30, 0, 30, 60].map((lat) => <line key={lat} x1={0} x2={W} y1={Y(lat)} y2={Y(lat)} stroke="#ffffff22" strokeDasharray={lat === 0 ? undefined : '4 4'} />)}
        {[0, 60, 120, 180, 240, 300].map((lon) => <g key={lon}><line x1={X(lon)} x2={X(lon)} y1={0} y2={H} stroke="#ffffff22" strokeDasharray="4 4" /><text x={X(lon) + 3} y={H - 4} fill="#ffffff66" fontSize="11" fontFamily="monospace">{lon}°E</text></g>)}
        {[-60, -30, 0, 30, 60].map((lat) => <text key={lat} x={3} y={Y(lat) - 3} fill="#ffffff66" fontSize="11" fontFamily="monospace">{lat}°</text>)}
        {pts.map(({ r, x, y, bd, approx }) => {
          const active = r.id === activeId;
          const label = r.bangladesh?.name ?? 'Jezero';
          const right = x < W - 110;
          return (
            <g key={r.id} onClick={() => onPick(r.id)} className="cursor-pointer" role="button" aria-label={`Select region ${r.name}`}>
              <circle cx={x} cy={y} r={active ? 9 : 6.5} fill={bd ? '#34d399' : '#f97316'} stroke={active ? '#fff' : '#000'} strokeWidth={active ? 3 : 1.5} />
              {approx && <circle cx={x} cy={y} r={12} fill="none" stroke="#fbbf24" strokeDasharray="3 3" />}
              <text x={right ? x + 12 : x - 12} y={y + 4} textAnchor={right ? 'start' : 'end'} fill="#fff" fontSize="13" fontFamily="monospace" stroke="#000" strokeWidth="3" paintOrder="stroke">{label}</text>
            </g>
          );
        })}
      </svg>
      {!compact && (
        <ul className="grid grid-cols-1 gap-1">
          {regions.filter((r) => r.bangladesh).map((r) => (
            <li key={r.id}>
              <button onClick={() => onPick(r.id)} className={`w-full text-left rounded border px-2 py-1 text-[10px] font-mono ${activeId === r.id ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-white/10 bg-slate-900/40 hover:border-white/30'}`}>
                <span className="text-emerald-300">{r.bangladesh!.name}</span> · Ø {r.bangladesh!.diameter_km} km · approved {r.bangladesh!.approved}
                <span className="text-white/45"> · named after {r.bangladesh!.named_after}</span>
                {r.coord_status === 'approx_needs_verify' && <span className="text-amber-300"> · position approximate</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[9px] text-white/40 leading-snug">Green = craters carrying Bangladeshi place names (IAU/USGS Gazetteer). Orange = main Marswalk region. Dashed amber ring = coordinates still to be verified. Chart shows positions only; no imagery.</p>
    </div>
  );
};
