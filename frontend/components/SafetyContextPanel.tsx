'use client';

import React from 'react';
import { Wind, Radiation, Sun, TriangleAlert } from 'lucide-react';
import type { OxygenBudget, RadiationEstimate, SpaceWeather } from '../lib/missionTypes';

interface Props {
  oxygen?: OxygenBudget;
  radiation?: RadiationEstimate;
  weather: SpaceWeather | null;
  suit?: { o2_capacity_min: number; o2_reserve_pct: number; o2_slope_factor_per_deg: number; o2_load_weight: number; o2_stop_factor: number };
}

const Bar = ({ used, reserve, ok }: { used: number; reserve: number; ok: boolean }) => (
  <div className="relative h-2 w-full rounded bg-white/10 overflow-hidden" aria-label={`${Math.round(used)}% oxygen used`}>
    <div className={`h-full ${ok ? 'bg-cyan-400' : 'bg-red-500'}`} style={{ width: `${Math.min(100, Math.max(0, used))}%` }} />
    <div className="absolute top-0 bottom-0 w-[2px] bg-amber-300" style={{ left: `${100 - reserve}%` }} title={`reserve line (${reserve}% left)`} />
  </div>
);

/** Safety context: oxygen / travel budget, radiation, space weather. Everything is labelled with where it comes from. */
export const SafetyContextPanel: React.FC<Props> = ({ oxygen, radiation, weather, suit }) => (
  <div className="space-y-3">
    {oxygen && (
      <div className="rounded border border-white/10 p-2.5 space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold"><Wind className="w-4 h-4 text-cyan-300" />Oxygen budget <span className="ml-auto text-[9px] font-mono text-amber-300 border border-amber-400/30 rounded px-1">ASSUMPTION</span></div>
        <div className="text-[10px] font-mono text-white/55">One way (walk + science stop)</div>
        <Bar used={oxygen.one_way_used_pct} reserve={oxygen.reserve_pct} ok={oxygen.one_way_ok} />
        <div className="flex justify-between text-[11px] font-mono"><span>{oxygen.remaining_on_arrival_pct}% left on arrival</span><span className={oxygen.one_way_ok ? 'text-emerald-300' : 'text-red-300'}>{oxygen.one_way_ok ? 'within reserve' : 'BELOW RESERVE'}</span></div>
        <div className="text-[10px] font-mono text-white/55">Round trip (walk back the same way)</div>
        <Bar used={oxygen.round_trip_used_pct} reserve={oxygen.reserve_pct} ok={oxygen.round_trip_ok} />
        <div className="flex justify-between text-[11px] font-mono"><span>{oxygen.remaining_after_return_pct}% left after return</span><span className={oxygen.round_trip_ok ? 'text-emerald-300' : 'text-red-300'}>{oxygen.round_trip_ok ? 'within reserve' : 'BELOW RESERVE'}</span></div>
        <p className="text-[10px] text-white/45 leading-snug">Amber line = {oxygen.reserve_pct}% reserve. {suit ? `Model: ${suit.o2_capacity_min} min baseline tank, +${Math.round(suit.o2_slope_factor_per_deg * 100)}% use per degree of slope, cargo weight ${suit.o2_load_weight}, work stops at ${suit.o2_stop_factor}× walking use.` : ''} {oxygen.assumption}</p>
      </div>
    )}
    {radiation && (
      <div className="rounded border border-white/10 p-2.5 space-y-1.5">
        <div className="flex items-center gap-2 text-xs font-bold"><Radiation className="w-4 h-4 text-amber-300" />Radiation for this mission time <span className="ml-auto text-[9px] font-mono text-red-300 border border-red-400/30 rounded px-1">{radiation.synthetic ? 'ILLUSTRATIVE' : 'DATA'}</span></div>
        <div className="text-[11px] font-mono">≈ {radiation.estimated_dose_usv} µSv of {radiation.planning_limit_usv} µSv planning value <span className={radiation.within_limit ? 'text-emerald-300' : 'text-red-300'}>({radiation.within_limit ? 'within' : 'OVER'})</span></div>
        <p className="text-[10px] text-white/45 leading-snug">{radiation.assumption}</p>
      </div>
    )}
    {weather && (
      <div className="rounded border border-white/10 p-2.5 space-y-1.5">
        <div className="flex items-center gap-2 text-xs font-bold"><Sun className="w-4 h-4 text-yellow-300" />Space weather &amp; safety context</div>
        <div className="text-[10px] font-mono text-white/55">Source: {weather.source}</div>
        <div className="text-[11px] font-mono">Solar activity: {weather.solar_activity.level}</div>
        {weather.solar_activity.events.length > 0 && (
          <ul className="text-[10px] font-mono text-white/70">{weather.solar_activity.events.slice(0, 5).map((e, i) => <li key={i}>{e.class} · {e.peak ?? e.begin}</li>)}</ul>
        )}
        <ul className="space-y-1">{weather.safety_context.map((t, i) => <li key={i} className="text-[10px] text-white/60 leading-snug">• {t}</li>)}</ul>
        {weather.live_error && <div className="flex gap-1.5 text-[10px] text-amber-200"><TriangleAlert className="w-3.5 h-3.5 shrink-0" />{weather.live_error}</div>}
        {weather.how_to_go_live && weather.synthetic && <p className="text-[9px] text-white/35">{weather.how_to_go_live}</p>}
      </div>
    )}
  </div>
);
