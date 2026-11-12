'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { ProbeResult } from '../lib/missionTypes';
import { fmtLat, fmtLon } from '../lib/geo';
import { OriginBadge } from './LayerToggleList';

/** Click-on-map information card (like NASA Trek's "what is here"). Few words, big numbers. */
export const ProbeCard: React.FC<{ data: ProbeResult | null; loading: boolean; onClose: () => void }> = ({ data, loading, onClose }) => {
  const [more, setMore] = useState(false);
  const hazCls = data?.hazard === 'danger' ? 'text-red-300' : data?.hazard === 'medium risk' ? 'text-amber-300' : 'text-emerald-300';
  return (
    <div className="w-72 rounded-xl border border-cyan-400/40 bg-slate-950/92 backdrop-blur-md shadow-2xl p-3 text-xs cursor-default">
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono text-[10px] text-cyan-300 tracking-widest">THIS SPOT</div>
        <button onClick={onClose} aria-label="Close" className="p-0.5 rounded hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
      </div>
      {loading && <div className="py-3 font-mono text-white/60">Reading data…</div>}
      {!loading && data && (
        <>
          <div className="font-mono text-[10px] text-white/50 mt-0.5">{fmtLat(data.lat)} {fmtLon(data.lon)}</div>
          {!data.inside ? <div className="mt-2 text-white/70">Outside the mapped area.</div> : (
            <>
              <div className="mt-2 text-sm font-semibold capitalize">{data.summary}</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono">
                <div className="rounded bg-white/5 p-1.5"><div className="text-[9px] text-white/40">HEIGHT</div><div className="text-sm">{data.elevation_m != null ? `${data.elevation_m} m` : '—'}</div></div>
                <div className="rounded bg-white/5 p-1.5"><div className="text-[9px] text-white/40">SLOPE</div><div className="text-sm">{data.slope_main_deg ?? data.slope_check_deg ?? '—'}°</div></div>
                <div className="rounded bg-white/5 p-1.5"><div className="text-[9px] text-white/40">HAZARD</div><div className={`text-sm capitalize ${hazCls}`}>{data.hazard ?? '—'}</div></div>
                <div className="rounded bg-white/5 p-1.5"><div className="text-[9px] text-white/40">DATA TRUST</div><div className="text-sm capitalize">{data.trust ?? '—'}</div></div>
              </div>
              <button onClick={() => setMore(!more)} className="mt-2 text-[10px] font-mono text-cyan-300 hover:underline">{more ? 'Hide' : 'Show'} data sources ({data.layers.length})</button>
              {more && (
                <ul className="mt-1.5 space-y-1 max-h-48 overflow-y-auto pr-1">
                  {data.layers.map((l) => (
                    <li key={l.key} className="rounded border border-white/10 p-1.5">
                      <div className="flex items-center justify-between gap-2"><span className="font-semibold">{l.label}</span><OriginBadge o={l.origin} /></div>
                      <div className="font-mono text-white/80">{l.value}</div>
                      <div className="text-[9px] text-white/40">{l.source}{l.res_m ? ` · ${l.res_m} m/px` : ''}</div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
