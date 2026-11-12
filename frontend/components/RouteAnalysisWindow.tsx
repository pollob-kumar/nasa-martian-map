'use client';

import React from 'react';
import { X, Database, Ban, Target, GitCompare, ClipboardCheck, TriangleAlert, Lightbulb } from 'lucide-react';
import type { Insight, RouteResult } from '../lib/missionTypes';
import { fmtLat, fmtLon } from '../lib/geo';

interface Props {
  route: RouteResult;
  strategyLabel: string;
  insights: Insight[];
  onClose: () => void;
}

const LEVEL: Record<Insight['level'], string> = {
  ok: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
  info: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100',
  warning: 'border-amber-400/40 bg-amber-500/10 text-amber-100',
  critical: 'border-red-400/50 bg-red-500/15 text-red-100',
};
const ALT_LABEL: Record<string, string> = { balanced: 'Balanced', safest: 'Gentlest slopes', shortest_feasible: 'Shortest feasible' };

const Section = ({ n, icon, title, children }: { n: number; icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <section className="rounded-lg border border-white/10 bg-slate-900/50 p-3 space-y-2">
    <h3 className="flex items-center gap-2 text-xs font-bold tracking-wide"><span className="w-5 h-5 rounded-full bg-cyan-500/25 border border-cyan-400/40 text-[10px] font-mono flex items-center justify-center">{n}</span>{icon}{title}</h3>
    {children}
  </section>
);

/** The window that opens after a route is planned. It answers the five questions from the NASA brief. */
export const RouteAnalysisWindow: React.FC<Props> = ({ route, strategyLabel, insights, onClose }) => {
  const ex = route.explanation;
  if (!ex) return null;
  const d = ex.science_destination;
  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label="Route analysis">
      <div className="w-full max-w-4xl max-h-full overflow-y-auto rounded-xl border border-cyan-400/30 bg-[#0a0610] shadow-[0_0_60px_rgba(34,211,238,0.15)]">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-[#0a0610]/95 backdrop-blur">
          <div>
            <div className="font-mono text-[10px] tracking-widest text-cyan-300">ROUTE ANALYSIS</div>
            <div className="text-sm font-bold">{strategyLabel} route to {d.name}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full border border-white/15 hover:border-cyan-400/50" aria-label="Close route analysis"><X className="w-4 h-4" /></button>
        </header>

        <div className="p-4 space-y-3">
          {insights.length > 0 && (
            <div className="space-y-1.5">
              {insights.map((i, k) => <div key={k} className={`flex gap-2 text-xs rounded border p-2 ${LEVEL[i.level]}`}><Lightbulb className="w-4 h-4 shrink-0" />{i.text}</div>)}
            </div>
          )}
          <p className="text-xs text-white/80 leading-relaxed">{ex.route_statement}</p>

          <div className="grid md:grid-cols-2 gap-3">
            <Section n={1} icon={<Database className="w-3.5 h-3.5 text-cyan-300" />} title="Which data is influencing the route?">
              <ul className="space-y-2">
                {ex.data_used.map((l, i) => (
                  <li key={i} className="text-[11px]">
                    <div className="font-bold">{l.name} <span className="font-mono text-white/45 font-normal">· {l.kind}{l.synthetic ? ' · SYNTHETIC' : ''}</span></div>
                    <div className="font-mono text-white/45">{l.mission} / {l.instrument} · {l.resolution_m ? `${l.resolution_m} m/px` : 'no raster'}</div>
                    <div className="text-white/75">{l.effect}</div>
                  </li>
                ))}
              </ul>
            </Section>

            <Section n={2} icon={<Ban className="w-3.5 h-3.5 text-red-300" />} title="Where are the possible obstacles?">
              <p className="text-[11px] text-white/75">{ex.obstacles.blocked_steep_cells} cells ({ex.obstacles.blocked_pct_of_region}% of the region) are over the slope limit and {ex.obstacles.no_data_cells} cells have no elevation data: none of them can be routed through.</p>
              {ex.obstacles.near_route.length === 0 ? <p className="text-[11px] text-white/50">No marked hazard or user obstacle within 800 m of this route.</p> : (
                <ul className="space-y-1.5">{ex.obstacles.near_route.map((o, i) => (
                  <li key={i} className="text-[11px] rounded border border-red-500/20 bg-red-950/20 p-1.5"><b>{o.name}</b> <span className="text-white/50">({o.type}, r {o.radius_m} m)</span><div className="text-white/70">route clearance ≈ {o.route_clearance_m} m · {o.reason}</div></li>
                ))}</ul>
              )}
            </Section>

            <Section n={3} icon={<Target className="w-3.5 h-3.5 text-orange-300" />} title="Where is the science destination?">
              <div className="text-[11px] space-y-1">
                <div className="font-bold text-sm">{d.name}</div>
                <div className="font-mono text-white/55">{fmtLat(d.lat)} {fmtLon(d.lon)} · elev {d.elev_m == null ? 'MISSING' : `${Math.round(d.elev_m)} m`} · slope {d.slope_deg == null ? 'MISSING' : `${d.slope_deg.toFixed(1)}°`}</div>
                <div><span className="text-white/45">Why go: </span>{d.scientific_purpose || '—'}</div>
                {d.geology && <div><span className="text-white/45">Formation: </span>{d.geology}</div>}
                <div><span className="text-white/45">Chemical index: </span>{d.chemical_status === 'MISSING' ? <span className="text-red-300 font-mono">MISSING (no coverage here)</span> : d.chemical_index == null ? <span className="text-white/50">no chemical layer for this region</span> : d.chemical_index.toFixed(2)}</div>
                <div><span className="text-white/45">Rover photos taken here: </span>{d.rover_photos || <span className="text-red-300 font-mono">MISSING</span>}</div>
              </div>
            </Section>

            <Section n={4} icon={<GitCompare className="w-3.5 h-3.5 text-violet-300" />} title="Why is an alternative route considered?">
              {ex.why_alternatives.length === 0 ? <p className="text-[11px] text-white/50">All strategies produced the same path.</p> : (
                <ul className="space-y-2">{ex.why_alternatives.map((a, i) => (
                  <li key={i} className="text-[11px]">
                    <div className="font-bold">{ALT_LABEL[a.strategy] ?? a.strategy}{a.found && <span className="font-mono font-normal text-white/55"> · {a.delta_distance_m! >= 0 ? '+' : ''}{a.delta_distance_m} m · max slope {a.delta_max_slope_deg! >= 0 ? '+' : ''}{a.delta_max_slope_deg}° · {a.delta_mission_min! >= 0 ? '+' : ''}{a.delta_mission_min} min</span>}</div>
                    <div className="text-white/70">{a.why}</div>
                  </li>
                ))}</ul>
              )}
            </Section>
          </div>

          <Section n={5} icon={<ClipboardCheck className="w-3.5 h-3.5 text-emerald-300" />} title="Which evidence / data supports each decision?">
            <ul className="space-y-2">{ex.evidence.map((e, i) => (
              <li key={i} className="text-[11px]"><div className="font-bold">{e.decision}</div><ul className="pl-3 text-white/65">{e.evidence.map((x, k) => <li key={k}>– {x}</li>)}</ul></li>
            ))}</ul>
          </Section>

          {ex.missing_data.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-3 space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-red-200"><TriangleAlert className="w-4 h-4" />Missing or insufficient data (shown as missing, never filled in)</div>
              <ul className="text-[11px] text-red-100/85">{ex.missing_data.map((m, i) => <li key={i}>• {m}</li>)}</ul>
            </div>
          )}
          <p className="text-[10px] text-white/40">Thresholds and the oxygen model are team assumptions, not validated NASA limits. "Below the slope limit in the data used" does not mean "safe".</p>
        </div>
      </div>
    </div>
  );
};
