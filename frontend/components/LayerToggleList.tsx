'use client';

import React from 'react';
import type { RasterLayer, Origin } from '../lib/missionTypes';
import type { LayerState } from './RasterMap';

export const ORIGIN: Record<Origin, { text: string; cls: string; title: string }> = {
  nasa: { text: 'NASA', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40', title: 'Your NASA .tif file' },
  derived: { text: 'DERIVED', cls: 'bg-sky-500/20 text-sky-200 border-sky-400/40', title: 'Calculated from your other layers' },
  demo: { text: 'DEMO', cls: 'bg-amber-500/20 text-amber-200 border-amber-400/40', title: 'Filled automatically - not your NASA file' },
  missing: { text: 'MISSING', cls: 'bg-red-500/20 text-red-200 border-red-400/40', title: 'No file' },
};
export const OriginBadge = ({ o }: { o: Origin }) => <span title={ORIGIN[o].title} className={`px-1.5 py-0.5 rounded border text-[9px] font-mono tracking-wider ${ORIGIN[o].cls}`}>{ORIGIN[o].text}</span>;

export const SWATCH: Record<string, string> = {
  orthomosaic: 'linear-gradient(to right,#5a4034,#b07a54,#e0b88c)',
  elevation: 'linear-gradient(to right,#2b1b4a,#3b4aa0,#2aa3a0,#7fc66a,#e8d36a,#fff)',
  hillshade: 'linear-gradient(to right,#111,#ddd)',
  hirise_slope: 'linear-gradient(to right,#1b9e5a,#ffd23f,#e0261f)',
  secondary_slope: 'linear-gradient(to right,#0ea5e9,#c026d3,#fb7185)',
  confidence: 'linear-gradient(to right,#1e3a8a,#14b8a6,#4ade80)',
  hazard: 'linear-gradient(to right,#22c55e,#f59e0b,#ef4444)',
};

/** One row per NASA layer: switch, colour, purpose, real/demo badge. Every layer is drawn in its own colour family. */
export const LayerToggleList: React.FC<{
  layers: RasterLayer[]; state: LayerState; onToggle: (key: string, on: boolean) => void; onOpacity?: (key: string, v: number) => void; compact?: boolean;
}> = ({ layers, state, onToggle, onOpacity, compact }) => (
  <ul className="space-y-1.5">
    {[...layers].sort((a, b) => b.z - a.z).map((l) => {
      const on = !!state[l.key]?.on;
      return (
        <li key={l.key} className={`rounded-lg border px-2.5 py-2 transition ${on ? 'border-white/25 bg-slate-900/70' : 'border-white/10 bg-slate-950/40'}`} style={on ? { boxShadow: `inset 3px 0 0 ${l.color}` } : undefined}>
          <label className="flex items-center gap-2 cursor-pointer">
            <button role="switch" aria-checked={on} aria-label={`${l.label} on/off`} onClick={() => onToggle(l.key, !on)}
              className={`relative w-9 h-5 rounded-full shrink-0 transition ${on ? 'bg-cyan-500/70' : 'bg-white/15'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
            <span className="flex-1 min-w-0 text-xs font-semibold truncate" onClick={() => onToggle(l.key, !on)}>{l.label}</span>
            <OriginBadge o={l.origin} />
          </label>
          {!compact && <div className="mt-1 text-[10px] text-white/50 leading-snug">{l.role}</div>}
          {on && <div className="mt-1.5 h-1.5 rounded" style={{ background: SWATCH[l.key] }} />}
          {on && onOpacity && !compact && (
            <input type="range" min={0.1} max={1} step={0.05} value={state[l.key].opacity} onChange={(e) => onOpacity(l.key, Number(e.target.value))} className="mt-1 w-full accent-cyan-400 h-1" aria-label={`${l.label} opacity`} />
          )}
        </li>
      );
    })}
  </ul>
);
