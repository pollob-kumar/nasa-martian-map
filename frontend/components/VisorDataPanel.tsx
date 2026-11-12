'use client';

import React, { useState } from 'react';
import { Database, X } from 'lucide-react';
import type { ProbeResult, RasterLayer } from '../lib/missionTypes';
import { OriginBadge } from './LayerToggleList';

export type VisorState = Record<string, boolean>;

/** What each NASA layer does on the visor. */
export const VISOR_USE: Record<string, string> = {
  orthomosaic: 'Photo under the radar',
  hillshade: 'Relief under the radar',
  elevation: 'Height readout',
  hirise_slope: 'Slope readout + warnings',
  secondary_slope: 'Second slope (check)',
  confidence: 'Data-trust tag',
  hazard: 'Hazard markers + zone alert',
};

export const VisorDataPanel: React.FC<{
  layers: RasterLayer[];
  state: VisorState;
  onChange: (s: VisorState) => void;
  onClick?: () => void;
  active?: boolean;
  onToggleActive?: () => void;
}> = ({ layers, state, onChange, onClick, active = true, onToggleActive }) => {
  const [open, setOpen] = useState(false);
  const shown = layers.filter((l) => state[l.key]).length;
  const realCount = layers.filter((l) => l.origin === 'nasa').length;
  const set = (k: string, v: boolean) => { onClick?.(); onChange({ ...state, [k]: v }); };

  const toggleAll = (enable: boolean) => {
    onClick?.();
    const updated: VisorState = { ...state };
    layers.forEach((l) => { updated[l.key] = enable; });
    onChange(updated);
  };

  return (
    <div className="absolute left-5 bottom-[176px] z-30 pointer-events-auto">
      {open && (
        <div className="mb-2 w-80 rounded-xl border border-cyan-400/40 bg-slate-950/95 backdrop-blur-2xl p-3.5 shadow-[0_0_30px_rgba(6,182,212,0.35)]" role="dialog" aria-label="NASA Data shown on visor">
          <div className="mb-2.5 flex items-center justify-between border-b border-white/10 pb-2">
            <div>
              <div className="font-mono text-xs font-bold tracking-widest text-cyan-200 flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-cyan-400" />
                NASA DATA VISOR
              </div>
              <div className="font-mono text-[9px] text-emerald-300 font-semibold mt-0.5">
                {realCount} REAL NASA RASTERS ACTIVE
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Quick Master Actions */}
          <div className="mb-2.5 flex items-center gap-2">
            {onToggleActive && (
              <button
                onClick={() => { onClick?.(); onToggleActive(); }}
                className={`flex-1 rounded-lg border py-1.5 font-mono text-[10px] font-bold tracking-wider transition ${
                  active ? 'bg-emerald-500/25 border-emerald-400/60 text-emerald-200' : 'bg-red-500/20 border-red-400/40 text-red-200'
                }`}
              >
                HUD OVERLAY: {active ? 'ON' : 'OFF'}
              </button>
            )}
            <button
              onClick={() => toggleAll(true)}
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 font-mono text-[10px] text-white/70 hover:bg-white/10"
            >
              ALL
            </button>
            <button
              onClick={() => toggleAll(false)}
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 font-mono text-[10px] text-white/70 hover:bg-white/10"
            >
              NONE
            </button>
          </div>

          <ul className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
            {[...layers].sort((a, b) => a.z - b.z).map((l) => {
              const on = !!state[l.key];
              return (
                <li key={l.key} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 transition ${on ? 'border-cyan-400/30 bg-slate-900/80' : 'border-white/5 bg-slate-950/40 opacity-60'}`}>
                  <button role="switch" aria-checked={on} aria-label={`${l.label} on visor`} onClick={() => set(l.key, !on)} className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-emerald-500/70' : 'bg-white/15'}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.color }} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-[11px] font-semibold text-white">{l.label}</div>
                    <div className="truncate text-[9px] text-white/45">{VISOR_USE[l.key]}</div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <OriginBadge o={l.origin} />
                    <span className={`font-mono text-[8px] font-bold ${on ? 'text-emerald-300' : 'text-white/35'}`}>{on ? 'ACTIVE' : 'OFF'}</span>
                  </div>
                </li>
              );
            })}
            {([['route', 'Route line'], ['markers', 'Sites & hazard marks']] as const).map(([k, label]) => (
              <li key={k} className="flex items-center gap-2 rounded-lg border border-dashed border-white/10 px-2 py-1.5">
                <button role="switch" aria-checked={!!state[k]} aria-label={label} onClick={() => set(k, !state[k])} className={`relative h-5 w-9 shrink-0 rounded-full transition ${state[k] ? 'bg-cyan-500/70' : 'bg-white/15'}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${state[k] ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <span className="flex-1 text-[11px] font-mono text-white/80">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button onClick={() => { onClick?.(); setOpen(!open); }} aria-expanded={open}
        className={`flex items-center gap-2 rounded-full border px-3 py-2 text-white backdrop-blur-xl transition-all active:scale-95 shadow-lg ${
          active ? 'border-cyan-400/60 bg-slate-950/85 hover:border-cyan-300' : 'border-white/20 bg-slate-950/60 opacity-60'
        }`}>
        <Database className={`h-3.5 w-3.5 ${active ? 'text-cyan-300' : 'text-white/50'}`} />
        <span className="font-mono text-[11px] font-bold tracking-wider text-cyan-200">NASA SENSORS</span>
        <span className="rounded-full border border-emerald-400/40 bg-emerald-400/20 px-1.5 font-mono text-[9px] font-bold text-emerald-300">{shown}/{layers.length}</span>
      </button>
    </div>
  );
};

/** Small value strip: only for layers switched ON. */
export const LiveDataStrip: React.FC<{ live: ProbeResult | null; state: VisorState; layers: RasterLayer[] }> = ({ live, state, layers }) => {
  if (!live || !live.inside) return null;
  const col = (k: string) => layers.find((l) => l.key === k)?.color ?? '#fff';
  const chips: { k: string; t: string; cls?: string }[] = [];
  if (state.elevation && live.elevation_m != null) chips.push({ k: 'elevation', t: `H ${Math.round(live.elevation_m)} m` });
  if (state.hirise_slope && live.slope_main_deg != null) chips.push({ k: 'hirise_slope', t: `SLOPE ${live.slope_main_deg}°` });
  if (state.secondary_slope && live.slope_check_deg != null) chips.push({ k: 'secondary_slope', t: `CHECK ${live.slope_check_deg}°` });
  if (state.hazard && live.hazard) chips.push({ k: 'hazard', t: live.hazard.toUpperCase(), cls: live.hazard === 'danger' ? 'text-red-300' : live.hazard === 'medium risk' ? 'text-amber-300' : 'text-emerald-300' });
  if (state.confidence && live.trust) chips.push({ k: 'confidence', t: `TRUST ${live.trust.toUpperCase()}` });
  if (!chips.length) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-[132px] z-30 flex -translate-x-1/2 flex-wrap justify-center gap-1.5">
      {chips.map((c) => (
        <span key={c.k} className={`flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/70 px-2.5 py-1 font-mono text-[10px] backdrop-blur ${c.cls ?? 'text-white'}`}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: col(c.k) }} />{c.t}
        </span>
      ))}
    </div>
  );
};
