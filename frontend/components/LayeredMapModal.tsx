'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Layers, Route as RouteIcon, MapPin, TriangleAlert, ExternalLink, Crosshair, Ban, Play, Database, Trash2, ShieldAlert, ClipboardList, Lightbulb } from 'lucide-react';
import type { Mission } from '../lib/useMission';
import type { LayerName, Nature, RouteResult } from '../lib/missionTypes';
import { api } from '../lib/api';
import { fmtLat, fmtLon, fracToLatLon, latLonToFrac } from '../lib/geo';
import { hudSound } from '../utils/soundEffects';
import { MarsOverviewMap } from './MarsOverviewMap';
import { RasterMap, type LayerState } from './RasterMap';
import { LayerToggleList, OriginBadge } from './LayerToggleList';
import { ProbeCard } from './ProbeCard';
import type { ProbeResult } from '../lib/missionTypes';
import { RouteAnalysisWindow } from './RouteAnalysisWindow';
import { SafetyContextPanel } from './SafetyContextPanel';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  mission: Mission;
  astronaut: { lat: number; lon: number } | null;
  onStartEva: () => void;
}

const NATURE: Record<Nature, { label: string; cls: string }> = {
  static: { label: 'STATIC', cls: 'bg-slate-500/20 text-slate-200 border-slate-400/30' },
  historical: { label: 'HISTORICAL', cls: 'bg-amber-500/20 text-amber-200 border-amber-400/30' },
  current: { label: 'CURRENT', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' },
  predicted: { label: 'PREDICTED', cls: 'bg-violet-500/20 text-violet-200 border-violet-400/30' },
};
const STRATEGY: Record<string, { label: string; color: string }> = {
  balanced: { label: 'Balanced', color: '#22d3ee' },
  safest: { label: 'Gentlest slopes', color: '#34d399' },
  shortest_feasible: { label: 'Shortest feasible', color: '#fbbf24' },
};
const LAYER_ROWS: { key: LayerName; label: string; kind: string }[] = [
  { key: 'imagery', label: 'Surface imagery', kind: 'optical' },
  { key: 'hillshade', label: 'Terrain shading', kind: 'topographic' },
  { key: 'slope', label: 'Slope classes', kind: 'topographic' },
  { key: 'hazard', label: 'Steep / no-go cells', kind: 'topographic' },
  { key: 'chemical', label: 'Chemical index', kind: 'chemical' },
];
const GEO_COLOR: Record<string, string> = { delta: '#38bdf8', crater_rim: '#f472b6', lakebed: '#a78bfa', boxwork: '#facc15', ejecta: '#fb923c' };
const LEVEL_CLS: Record<string, string> = {
  ok: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100', info: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100',
  warning: 'border-amber-400/40 bg-amber-500/10 text-amber-100', critical: 'border-red-400/50 bg-red-500/15 text-red-100',
};

type ClickMode = 'inspect' | 'start' | 'obstacle';
type Tab = 'route' | 'site' | 'safety' | 'data';

const Badge = ({ n }: { n: Nature }) => (
  <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono tracking-wider ${NATURE[n].cls}`}>{NATURE[n].label}</span>
);

export const LayeredMapModal: React.FC<Props> = ({ isOpen, onClose, mission: m, astronaut, onStartEva }) => {
  const [on, setOn] = useState<Record<string, boolean>>({ imagery: true, hillshade: true, slope: false, hazard: true, chemical: false, geology: true, rover: true, sites: true, route: true });
  const [mode, setMode] = useState<ClickMode>('inspect');
  const [tab, setTab] = useState<Tab>('route');
  const [siteId, setSiteId] = useState<string | null>(null);
  const [obsRadius, setObsRadius] = useState(150);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const [lay, setLay] = useState<LayerState>({});
  const [probe, setProbe] = useState<{ px: number; py: number; data: ProbeResult | null; loading: boolean } | null>(null);

  const meta = m.meta;
  const raster = meta?.raster;
  useEffect(() => { if (raster && Object.keys(lay).length) try { localStorage.setItem('rednav.layers', JSON.stringify(lay)); } catch { /* ignore */ } }, [lay]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!raster) return;
    let saved: LayerState | null = null;
    try { saved = JSON.parse(localStorage.getItem('rednav.layers') ?? 'null'); } catch { /* ignore */ }
    const anyOn = saved && Object.values(saved).some((v) => v.on);
    // the photo is always the map background at start; the other layers are the ones picked on the first page
    setLay(anyOn ? { ...Object.fromEntries(raster.layers.map((l) => [l.key, { on: false, opacity: l.default_opacity }])), ...saved, orthomosaic: { on: true, opacity: saved?.orthomosaic?.opacity ?? 1 } } : Object.fromEntries(raster.layers.map((l) => [l.key, { on: l.default_on, opacity: l.default_opacity }])));
    setProbe(null);
  }, [meta?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const site = m.sites.find((s) => s.id === siteId) ?? null;
  const prov = (kind: string) => meta?.layers.find((l) => l.kind === kind);

  const pos = useMemo(() => {
    if (!meta) return null;
    const p = (lat: number, lon: number) => {
      const { fx, fy } = latLonToFrac(meta, lat, lon);
      return { x: fx * 1000, y: fy * 1000 * (meta.grid.height / meta.grid.width) };
    };
    return p;
  }, [meta]);

  if (!isOpen) return null;

  if (!meta || !pos) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 text-slate-300 font-mono text-sm">
        {m.loadError ? (
          <div className="max-w-md text-center space-y-2">
            <TriangleAlert className="w-6 h-6 mx-auto text-red-400" />
            <div>Could not load region data</div>
            <div className="text-xs text-red-300/80">{m.loadError}</div>
            <button className="mt-3 px-4 py-2 rounded border border-white/20" onClick={onClose}>Close</button>
          </div>
        ) : (
          'LOADING REGION DATA…'
        )}
      </div>
    );
  }

  // plan, then open the Route Analysis window (NASA brief: after choosing, show what data drives the route)
  const runPlan = (o?: Parameters<typeof m.plan>[0]) => { void m.plan(o).then((ok) => ok && setAnalysisOpen(true)); };
  const widthKm = (meta.grid.width * meta.grid.cell_m) / 1000;
  const scaleKm = [0.5, 1, 2, 5, 10].reduce((best, k) => (Math.abs(k - widthKm * 0.2) < Math.abs(best - widthKm * 0.2) ? k : best), 1);
  const mPerUnit = (meta.grid.width * meta.grid.cell_m) / 1000;
  const vbH = 1000 * (meta.grid.height / meta.grid.width);
  const onMapClick = (e: React.MouseEvent) => {
    if (mode === 'inspect' || !mapRef.current) return;
    const r = mapRef.current.getBoundingClientRect();
    const { lat, lon } = fracToLatLon(meta, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    hudSound.playClick();
    if (mode === 'start') {
      m.setStart({ lat, lon });
      runPlan({ start: { lat, lon } });
    } else {
      const next = [...m.obstacles, { lat, lon, radius_m: obsRadius, name: 'user obstacle' }];
      m.setObstacles(next);
      runPlan({ obstacles: next });
    }
    setMode('inspect');
  };
  const onRasterPick = (pk: { lat: number; lon: number; px: number; py: number }) => {
    hudSound.playClick();
    if (mode === 'start') { m.setStart({ lat: pk.lat, lon: pk.lon }); runPlan({ start: { lat: pk.lat, lon: pk.lon } }); setMode('inspect'); return; }
    if (mode === 'obstacle') {
      const next = [...m.obstacles, { lat: pk.lat, lon: pk.lon, radius_m: obsRadius, name: 'user obstacle' }];
      m.setObstacles(next); runPlan({ obstacles: next }); setMode('inspect'); return;
    }
    setProbe({ px: pk.px, py: pk.py, data: null, loading: true });
    api.probe(pk.lat, pk.lon).then((d) => setProbe((p) => (p ? { ...p, data: d, loading: false } : p))).catch(() => setProbe(null));
  };
  const removeObstacle = (i: number) => {
    const next = m.obstacles.filter((_, k) => k !== i);
    m.setObstacles(next);
    runPlan({ obstacles: next });
  };
  const selectSite = (id: string) => {
    setSiteId(id);
    setTab('site');
  };
  const setOpt = (k: keyof NonNullable<typeof m.options>, v: number) => m.options && m.setOptions({ ...m.options, [k]: v });
  const poly = (r: RouteResult) => (r.points ?? []).map((p) => { const q = pos(p.lat, p.lon); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ');

  const Slider = ({ label, k, min, max, step, unit }: { label: string; k: keyof NonNullable<typeof m.options>; min: number; max: number; step: number; unit: string }) => (
    <label className="block">
      <div className="flex justify-between text-[10px] font-mono text-white/60"><span>{label}</span><span className="text-cyan-300">{m.options?.[k]} {unit}</span></div>
      <input type="range" min={min} max={max} step={step} value={m.options?.[k] ?? min} onChange={(e) => setOpt(k, Number(e.target.value))} className="w-full accent-cyan-400" />
    </label>
  );

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#060408]/95 backdrop-blur-xl text-slate-100 select-text cursor-default" role="dialog" aria-label="Layered map and route planner">
      {/* top bar */}
      <header className="flex items-center justify-between gap-4 px-5 py-3 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <Layers className="w-5 h-5 text-cyan-300 shrink-0" />
          <div className="min-w-0">
            <div className="font-mono text-sm font-bold tracking-wider truncate">{meta.name}</div>
            <div className="font-mono text-[10px] text-white/50 truncate">{fmtLat(meta.center.lat)} {fmtLon(meta.center.lon)} · {meta.grid.width * meta.grid.cell_m / 1000} km box · {meta.grid.cell_m} m grid{meta.science_goal ? ` · Goal: ${meta.science_goal}` : ''}</div>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-full border border-white/15 hover:border-cyan-400/50" aria-label="Close map (Esc)"><X className="w-4 h-4" /></button>
      </header>

      {meta.synthetic && <div className="px-5 py-1.5 bg-red-600/80 text-white font-mono text-xs tracking-widest text-center">SYNTHETIC DEMO DATA — NOT NASA DATA — FOR DEVELOPMENT ONLY</div>}
      {meta.coord_status === 'approx_needs_verify' && <div className="px-5 py-1 bg-amber-500/20 text-amber-200 font-mono text-[11px] text-center">Region centre is approximate — verify it in the USGS Gazetteer.</div>}

      <div className="flex flex-1 min-h-0">
        {/* LEFT: layers + settings */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-white/10 p-4 space-y-5">
          <section>
            <h3 className="font-mono text-[11px] tracking-widest text-white/50 mb-2">REGION</h3>
            <select value={m.regionId} onChange={(e) => { m.setRegionId(e.target.value); setSiteId(null); }} className="w-full bg-slate-900 border border-white/15 rounded px-2 py-1.5 text-xs font-mono">
              {m.allRegions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <div className="mt-2"><MarsOverviewMap regions={m.allRegions} activeId={m.regionId} compact onPick={(id) => { m.setRegionId(id); setSiteId(null); }} /></div>
          </section>

          <section>
            <h3 className="font-mono text-[11px] tracking-widest text-white/50 mb-2 flex items-center justify-between">DATA LAYERS {raster && <span className="text-emerald-300 text-[10px]">{raster.real_layers}/{raster.total_layers} NASA files</span>}</h3>
            {raster ? (
              <LayerToggleList layers={raster.layers} state={lay} onToggle={(k, v) => { hudSound.playClick(); setLay({ ...lay, [k]: { ...lay[k], on: v } }); }} onOpacity={(k, v) => setLay({ ...lay, [k]: { ...lay[k], opacity: v } })} />
            ) : null}
            <ul className="space-y-1.5">
              {!raster && LAYER_ROWS.map((l) => {
                const have = !!meta.layer_urls[l.key];
                const p = prov(l.kind);
                return (
                  <li key={l.key} className={`rounded border px-2.5 py-2 ${have ? 'border-white/10 bg-slate-900/50' : 'border-red-500/30 bg-red-950/20'}`}>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" disabled={!have} checked={have && on[l.key]} onChange={(e) => setOn({ ...on, [l.key]: e.target.checked })} className="accent-cyan-400" />
                      <span className="flex-1">{l.label}</span>
                      {have && p ? <Badge n={p.nature} /> : <span className="text-[9px] font-mono text-red-300">MISSING</span>}
                    </label>
                    {have && p && <div className="mt-1 text-[10px] font-mono text-white/45">{p.mission} · {p.resolution_m ? `${p.resolution_m} m/px` : 'res. n/a'}</div>}
                    {!have && <div className="mt-1 text-[10px] text-red-300/80">No data for this region — not faked.</div>}
                  </li>
                );
              })}
              {[['geology', 'Geological features'], ['rover', 'Rover observations'], ['sites', 'Science sites'], ['route', 'Routes']].map(([k, label]) => (
                <li key={k} className="rounded border border-white/10 bg-slate-900/50 px-2.5 py-2">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={on[k]} onChange={(e) => setOn({ ...on, [k]: e.target.checked })} className="accent-cyan-400" />
                    <span>{label}</span>
                  </label>
                </li>
              ))}
              {raster && meta.layer_urls.chemical && (
                <li className="rounded border border-white/10 bg-slate-900/50 px-2.5 py-2">
                  <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={on.chemical} onChange={(e) => setOn({ ...on, chemical: e.target.checked })} className="accent-cyan-400" /><span className="flex-1">Chemical index</span><OriginBadge o="demo" /></label>
                </li>
              )}
            </ul>
            {meta.layer_urls.chemical && on.chemical && (
              <div className="mt-2 text-[10px] font-mono text-white/60 space-y-1">
                <div className="h-2 rounded" style={{ background: 'linear-gradient(to right,#461e78,#ffdc1e)' }} />
                <div className="flex justify-between"><span>low</span><span>chemical index</span><span>high</span></div>
                <div><i className="inline-block w-2 h-2 rounded-sm bg-slate-500 mr-1" />grey = NO coverage (missing)</div>
              </div>
            )}
            <div className="mt-2 flex gap-3 text-[10px] font-mono text-white/50">
              <span><i className="inline-block w-2 h-2 rounded-sm bg-emerald-400 mr-1" />OK</span>
              <span><i className="inline-block w-2 h-2 rounded-sm bg-amber-400 mr-1" />caution</span>
              <span><i className="inline-block w-2 h-2 rounded-sm bg-red-500 mr-1" />no-go</span>
              <span><i className="inline-block w-2 h-2 rounded-sm bg-slate-500 mr-1" />no data</span>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-mono text-[11px] tracking-widest text-white/50 flex items-center justify-between">MISSION SETTINGS <span className="text-amber-300 text-[9px]">ASSUMPTIONS</span></h3>
            <Slider label="No-go slope above" k="max_slope_deg" min={5} max={45} step={1} unit="°" />
            <Slider label="Caution slope above" k="caution_slope_deg" min={2} max={40} step={1} unit="°" />
            <Slider label="Walking speed" k="walk_speed_ms" min={0.3} max={2} step={0.1} unit="m/s" />
            <Slider label="Cargo load factor" k="load_factor" min={1} max={2.5} step={0.1} unit="×" />
            <Slider label="Science stop" k="science_stop_min" min={0} max={60} step={5} unit="min" />
            <p className="text-[10px] text-white/40 leading-relaxed">These numbers are team assumptions, not validated NASA limits.</p>
          </section>

          <section className="space-y-2">
            <h3 className="font-mono text-[11px] tracking-widest text-white/50">PLAN</h3>
            <div className="text-[11px] font-mono text-white/60">Start: {m.start ? `${fmtLat(m.start.lat)} ${fmtLon(m.start.lon)}` : '—'}</div>
            <div className="flex gap-2">
              <button onClick={() => setMode(mode === 'start' ? 'inspect' : 'start')} className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border text-[11px] font-mono ${mode === 'start' ? 'border-cyan-400 bg-cyan-500/20' : 'border-white/15'}`}><Crosshair className="w-3.5 h-3.5" />Pick start</button>
              <button onClick={() => setMode(mode === 'obstacle' ? 'inspect' : 'obstacle')} className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border text-[11px] font-mono ${mode === 'obstacle' ? 'border-red-400 bg-red-500/20' : 'border-white/15'}`}><Ban className="w-3.5 h-3.5" />Add obstacle</button>
            </div>
            {mode === 'obstacle' && <label className="block"><div className="text-[10px] font-mono text-white/60">Obstacle radius: {obsRadius} m — now click the map</div><input type="range" min={30} max={800} step={10} value={obsRadius} onChange={(e) => setObsRadius(Number(e.target.value))} className="w-full accent-red-400" /></label>}
            {mode === 'start' && <div className="text-[10px] text-cyan-200">Click the map to place the start point.</div>}
            {m.obstacles.length > 0 && <ul className="space-y-1">{m.obstacles.map((o, i) => <li key={i} className="flex items-center justify-between text-[11px] font-mono bg-red-950/30 border border-red-500/20 rounded px-2 py-1"><span>Obstacle {i + 1} · {o.radius_m} m</span><button onClick={() => removeObstacle(i)} aria-label="Remove obstacle"><Trash2 className="w-3.5 h-3.5 text-red-300" /></button></li>)}</ul>}
            <label className="block text-[10px] font-mono text-white/60">Destination
              <select value={m.goalId ?? ''} onChange={(e) => { m.setGoalId(e.target.value); runPlan({ goalId: e.target.value }); }} className="mt-1 w-full bg-slate-900 border border-white/15 rounded px-2 py-1.5 text-xs">
                {m.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <button onClick={() => runPlan()} disabled={m.planning} className="w-full px-3 py-2 rounded bg-cyan-500/25 border border-cyan-400/60 text-xs font-mono font-bold tracking-wider hover:bg-cyan-500/40 disabled:opacity-50 flex items-center justify-center gap-2"><RouteIcon className="w-4 h-4" />{m.planning ? 'PLANNING…' : 'PLAN ROUTE'}</button>
          </section>
        </aside>

        {/* CENTER: map */}
        <main className="flex-1 min-w-0 flex items-center justify-center p-4 bg-black/40">
          {raster ? (
            <div className="relative h-full w-full rounded-lg border border-white/15 overflow-hidden">
              <RasterMap meta={meta} layerState={lay} cursor={mode !== 'inspect' ? 'crosshair' : 'grab'} onPick={onRasterPick}
                popup={probe ? { px: probe.px, py: probe.py, node: <ProbeCard data={probe.data} loading={probe.loading} onClose={() => setProbe(null)} /> } : null}
                overlay={(sc) => (
                  <>
                    {on.chemical && meta.layer_urls.chemical && <image href={api.assetUrl(meta.layer_urls.chemical)} x="0" y="0" width="1000" height={vbH} preserveAspectRatio="none" opacity="0.6" />}

              {on.geology && m.geology.map((g) => {
                const pts = g.polygon.map(([la, lo]) => { const q = pos(la, lo); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ');
                const c0 = g.polygon.reduce((a, [la, lo]) => { const q = pos(la, lo); return { x: a.x + q.x / g.polygon.length, y: a.y + q.y / g.polygon.length }; }, { x: 0, y: 0 });
                const col = GEO_COLOR[g.type] ?? '#e5e7eb';
                return <g key={g.id}><polygon points={pts} fill={col} fillOpacity={g.type === 'boxwork' ? 0.08 : 0.16} stroke={col} strokeWidth={2.5 * sc} strokeDasharray={g.type === 'boxwork' ? '3 5' : undefined} /><text x={c0.x} y={c0.y} textAnchor="middle" fill={col} fontSize={15 * sc} fontFamily="monospace" stroke="#000" strokeWidth={3 * sc} paintOrder="stroke">{g.name}</text></g>;
              })}
              {m.hazards.map((h) => { const q = pos(h.lat, h.lon); return <circle key={h.id} cx={q.x} cy={q.y} r={Math.max(6 * sc, h.radius_m / mPerUnit)} fill="rgba(239,68,68,.25)" stroke="#f87171" strokeWidth={2 * sc} strokeDasharray={`${6 * sc} ${4 * sc}`} />; })}
              {m.obstacles.map((o, i) => { const q = pos(o.lat, o.lon); return <circle key={i} cx={q.x} cy={q.y} r={Math.max(6 * sc, o.radius_m / mPerUnit)} fill="rgba(239,68,68,.35)" stroke="#fecaca" strokeWidth={2 * sc} />; })}
              {on.route && m.foundRoutes.map((r, i) => i !== m.routeIdx && <polyline key={r.strategy} points={poly(r)} fill="none" stroke={STRATEGY[r.strategy].color} strokeOpacity=".45" strokeWidth={3 * sc} strokeDasharray={`${8 * sc} ${6 * sc}`} />)}
              {on.route && m.route && <polyline points={poly(m.route)} fill="none" stroke={STRATEGY[m.route.strategy].color} strokeWidth={5 * sc} strokeLinejoin="round" strokeLinecap="round" />}
              {m.start && (() => { const q = pos(m.start.lat, m.start.lon); return <g><circle cx={q.x} cy={q.y} r={11 * sc} fill="#22d3ee" stroke="#fff" strokeWidth={3 * sc} /><text x={q.x + 16 * sc} y={q.y + 5 * sc} fill="#fff" fontSize={18 * sc} fontFamily="monospace" stroke="#000" strokeWidth={3 * sc} paintOrder="stroke">START</text></g>; })()}
              {on.sites && m.sites.map((s) => { const q = pos(s.lat, s.lon); const goal = s.id === m.goalId; return (
                <g key={s.id} onClick={(e) => { e.stopPropagation(); selectSite(s.id); }} className="cursor-pointer">
                  <circle cx={q.x} cy={q.y} r={14 * sc} fill={goal ? '#facc15' : '#f97316'} stroke="#fff" strokeWidth={3 * sc} />
                  <text x={q.x + 18 * sc} y={q.y + 6 * sc} fill="#fff" fontSize={19 * sc} fontFamily="monospace" stroke="#000" strokeWidth={4 * sc} paintOrder="stroke">{s.name}</text>
                </g>); })}
              {on.rover && m.sites.filter((s) => s.pov_images.length > 0).map((s) => { const q = pos(s.lat, s.lon); return (
                <g key={`rov-${s.id}`} onClick={(e) => { e.stopPropagation(); selectSite(s.id); }} className="cursor-pointer">
                  <rect x={q.x - 30 * sc} y={q.y - 34 * sc} width={22 * sc} height={16 * sc} rx={3 * sc} fill="#0e7490" stroke="#fff" strokeWidth={2 * sc} /><circle cx={q.x - 19 * sc} cy={q.y - 26 * sc} r={4.5 * sc} fill="#fff" />
                </g>); })}
              {astronaut && (() => { const q = pos(astronaut.lat, astronaut.lon); return <circle cx={q.x} cy={q.y} r={9 * sc} fill="#34d399" stroke="#fff" strokeWidth={3 * sc}></circle>; })()}
            
                    {probe && probe.data && pos && (() => { const q = pos(probe.data!.lat, probe.data!.lon); return <g><circle cx={q.x} cy={q.y} r={7 * sc} fill="none" stroke="#22d3ee" strokeWidth={2.5 * sc} /><circle cx={q.x} cy={q.y} r={1.8 * sc} fill="#22d3ee" /></g>; })()}
                  </>
                )} />
              {m.planning && <div className="absolute inset-0 bg-black/40 flex items-center justify-center font-mono text-xs tracking-widest pointer-events-none">PLANNING…</div>}
            </div>
          ) : (
          <div ref={mapRef} onClick={onMapClick} className={`relative aspect-square h-full max-w-full overflow-hidden rounded-lg border border-white/15 bg-slate-950 ${mode !== 'inspect' ? 'cursor-crosshair' : ''}`}>
            {meta.layer_urls.imagery && on.imagery && <img src={api.assetUrl(meta.layer_urls.imagery)} alt="Surface imagery" className="absolute inset-0 w-full h-full object-fill [image-rendering:auto]" draggable={false} />}
            {meta.layer_urls.hillshade && on.hillshade && <img src={api.assetUrl(meta.layer_urls.hillshade)} alt="Terrain shading" className="absolute inset-0 w-full h-full object-fill" style={{ mixBlendMode: meta.layer_urls.imagery && on.imagery ? 'multiply' : 'normal', opacity: meta.layer_urls.imagery && on.imagery ? 0.75 : 1 }} draggable={false} />}
            {meta.layer_urls.slope && on.slope && <img src={api.assetUrl(meta.layer_urls.slope)} alt="Slope classes" className="absolute inset-0 w-full h-full object-fill [image-rendering:pixelated]" draggable={false} />}
            {meta.layer_urls.chemical && on.chemical && <img src={api.assetUrl(meta.layer_urls.chemical)} alt="Chemical index" className="absolute inset-0 w-full h-full object-fill [image-rendering:pixelated]" draggable={false} />}
            {meta.layer_urls.hazard && on.hazard && !on.slope && <img src={api.assetUrl(meta.layer_urls.hazard)} alt="No-go cells" className="absolute inset-0 w-full h-full object-fill [image-rendering:pixelated]" draggable={false} />}

            <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
              {on.geology && m.geology.map((g) => {
                const pts = g.polygon.map(([la, lo]) => { const q = pos(la, lo); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ');
                const c0 = g.polygon.reduce((a, [la, lo]) => { const q = pos(la, lo); return { x: a.x + q.x / g.polygon.length, y: a.y + q.y / g.polygon.length }; }, { x: 0, y: 0 });
                const col = GEO_COLOR[g.type] ?? '#e5e7eb';
                return <g key={g.id}><polygon points={pts} fill={col} fillOpacity={g.type === 'boxwork' ? 0.08 : 0.16} stroke={col} strokeWidth="2.5" strokeDasharray={g.type === 'boxwork' ? '3 5' : undefined} /><text x={c0.x} y={c0.y} textAnchor="middle" fill={col} fontSize="15" fontFamily="monospace" stroke="#000" strokeWidth="3" paintOrder="stroke">{g.name}</text></g>;
              })}
              {m.hazards.map((h) => { const q = pos(h.lat, h.lon); return <circle key={h.id} cx={q.x} cy={q.y} r={Math.max(6, h.radius_m / mPerUnit)} fill="rgba(239,68,68,.25)" stroke="#f87171" strokeWidth="2" strokeDasharray="6 4" />; })}
              {m.obstacles.map((o, i) => { const q = pos(o.lat, o.lon); return <circle key={i} cx={q.x} cy={q.y} r={Math.max(6, o.radius_m / mPerUnit)} fill="rgba(239,68,68,.35)" stroke="#fecaca" strokeWidth="2" />; })}
              {on.route && m.foundRoutes.map((r, i) => i !== m.routeIdx && <polyline key={r.strategy} points={poly(r)} fill="none" stroke={STRATEGY[r.strategy].color} strokeOpacity=".45" strokeWidth="3" strokeDasharray="8 6" />)}
              {on.route && m.route && <polyline points={poly(m.route)} fill="none" stroke={STRATEGY[m.route.strategy].color} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />}
              {m.start && (() => { const q = pos(m.start.lat, m.start.lon); return <g><circle cx={q.x} cy={q.y} r="11" fill="#22d3ee" stroke="#fff" strokeWidth="3" /><text x={q.x + 16} y={q.y + 5} fill="#fff" fontSize="18" fontFamily="monospace" stroke="#000" strokeWidth="3" paintOrder="stroke">START</text></g>; })()}
              {on.sites && m.sites.map((s) => { const q = pos(s.lat, s.lon); const goal = s.id === m.goalId; return (
                <g key={s.id} onClick={(e) => { e.stopPropagation(); selectSite(s.id); }} className="cursor-pointer">
                  <circle cx={q.x} cy={q.y} r="14" fill={goal ? '#facc15' : '#f97316'} stroke="#fff" strokeWidth="3" />
                  <text x={q.x + 18} y={q.y + 6} fill="#fff" fontSize="19" fontFamily="monospace" stroke="#000" strokeWidth="4" paintOrder="stroke">{s.name}</text>
                </g>); })}
              {on.rover && m.sites.filter((s) => s.pov_images.length > 0).map((s) => { const q = pos(s.lat, s.lon); return (
                <g key={`rov-${s.id}`} onClick={(e) => { e.stopPropagation(); selectSite(s.id); }} className="cursor-pointer">
                  <rect x={q.x - 30} y={q.y - 34} width="22" height="16" rx="3" fill="#0e7490" stroke="#fff" strokeWidth="2" /><circle cx={q.x - 19} cy={q.y - 26} r="4.5" fill="#fff" /><rect x={q.x - 26} y={q.y - 37} width="8" height="4" fill="#fff" />
                </g>); })}
              {astronaut && (() => { const q = pos(astronaut.lat, astronaut.lon); return <circle cx={q.x} cy={q.y} r="9" fill="#34d399" stroke="#fff" strokeWidth="3"><animate attributeName="r" values="9;14;9" dur="1.6s" repeatCount="indefinite" /></circle>; })()}
            </svg>

            <div className="absolute left-2 bottom-2 flex items-center gap-2 text-[10px] font-mono text-white bg-black/70 rounded px-2 py-1">
              <span className="inline-block h-[3px] bg-white" style={{ width: `${(scaleKm * 1000) / (meta.grid.width * meta.grid.cell_m) * (mapRef.current?.clientWidth ?? 600)}px` }} />
              <span>{scaleKm} km · north ↑</span>
            </div>
            {m.planning && <div className="absolute inset-0 bg-black/40 flex items-center justify-center font-mono text-xs tracking-widest">PLANNING…</div>}
          </div>
          )}
        </main>

        {/* RIGHT: results */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-white/10 p-4 space-y-3">
          <div className="flex gap-1">
            {([['route', 'Route', RouteIcon], ['site', 'Site', MapPin], ['safety', 'Safety', ShieldAlert], ['data', 'Data', Database]] as const).map(([k, label, Icon]) => (
              <button key={k} onClick={() => setTab(k as Tab)} className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-mono border ${tab === k ? 'border-cyan-400/60 bg-cyan-500/20' : 'border-white/10'}`}><Icon className="w-3.5 h-3.5" />{label}</button>
            ))}
          </div>

          {tab === 'route' && (
            <div className="space-y-3">
              {m.planError && <div className="text-xs text-red-300 bg-red-950/30 border border-red-500/30 rounded p-2">{m.planError}</div>}
              {m.resp?.routes.map((r) => {
                const idx = m.foundRoutes.findIndex((x) => x.strategy === r.strategy);
                const sel = idx === m.routeIdx && r.found;
                const meta_ = STRATEGY[r.strategy];
                return (
                  <button key={r.strategy} disabled={!r.found} onClick={() => m.setRouteIdx(idx)} className={`w-full text-left rounded-lg border p-3 ${sel ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-white/10 bg-slate-900/40'} ${!r.found && 'opacity-50'}`}>
                    <div className="flex items-center gap-2 text-xs font-bold"><i className="inline-block w-3 h-1 rounded" style={{ background: meta_.color }} />{meta_.label}</div>
                    {r.found ? (
                      <dl className="mt-2 grid grid-cols-3 gap-2 text-[10px] font-mono">
                        <div><dt className="text-white/40">DISTANCE</dt><dd className="text-sm text-white">{r.distance_m} m</dd></div>
                        <div><dt className="text-white/40">WALK</dt><dd className="text-sm text-white">{r.walk_time_min} min</dd></div>
                        <div><dt className="text-white/40">MISSION</dt><dd className="text-sm text-white">{r.mission_time_min} min</dd></div>
                        <div><dt className="text-white/40">MAX SLOPE</dt><dd className="text-sm text-white">{r.max_slope_deg}°</dd></div>
                        <div><dt className="text-white/40">MEAN SLOPE</dt><dd className="text-sm text-white">{r.mean_slope_deg}°</dd></div>
                        <div><dt className="text-white/40">CLIMB</dt><dd className="text-sm text-white">{r.elev_gain_m} m</dd></div>
                      </dl>
                    ) : <div className="mt-1 text-[11px] text-red-300">No traversable route under current limits.</div>}
                  </button>
                );
              })}
              {!!m.resp?.insights?.length && (
                <div className="space-y-1.5">{m.resp.insights.map((i, k) => <div key={k} className={`flex gap-2 text-[11px] rounded border p-2 ${LEVEL_CLS[i.level]}`}><Lightbulb className="w-4 h-4 shrink-0" />{i.text}</div>)}</div>
              )}
              {m.route?.safety && (
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                  <div className="rounded border border-white/10 p-2"><div className="text-white/40">OXYGEN ON ARRIVAL</div><div className={`text-sm ${m.route.safety.oxygen.one_way_ok ? 'text-white' : 'text-red-300'}`}>{m.route.safety.oxygen.remaining_on_arrival_pct}%</div></div>
                  <div className="rounded border border-white/10 p-2"><div className="text-white/40">AFTER RETURN</div><div className={`text-sm ${m.route.safety.oxygen.round_trip_ok ? 'text-white' : 'text-red-300'}`}>{m.route.safety.oxygen.remaining_after_return_pct}%</div></div>
                </div>
              )}
              {m.route?.explanation && <button onClick={() => setAnalysisOpen(true)} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-violet-500/20 border border-violet-400/50 text-xs font-mono font-bold hover:bg-violet-500/35"><ClipboardList className="w-4 h-4" />ROUTE ANALYSIS (why this route?)</button>}
              {m.route?.reasons?.map((t, i) => <p key={i} className="text-[11px] text-white/70 leading-relaxed">• {t}</p>)}
              {m.resp?.warnings.map((w, i) => <div key={i} className="flex gap-2 text-[11px] text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded p-2"><TriangleAlert className="w-4 h-4 shrink-0" />{w}</div>)}
              {meta.warnings.map((w, i) => <div key={i} className="flex gap-2 text-[11px] text-amber-200/90 bg-amber-500/5 border border-amber-400/20 rounded p-2"><TriangleAlert className="w-4 h-4 shrink-0" />{w}</div>)}
              {!!m.resp?.nearby_science.length && (
                <div className="rounded border border-white/10 p-2 space-y-2">
                  <div className="text-[10px] font-mono text-white/50">ALSO INTERESTING NEAR THE ROUTE (routed detour, not a straight line)</div>
                  {m.resp.nearby_science.map((n) => (
                    <button key={n.id} onClick={() => selectSite(n.id)} className="block w-full text-left rounded border border-white/10 bg-slate-900/40 p-2 hover:border-cyan-400/40">
                      <div className="text-xs font-bold">{n.name}</div>
                      {n.reachable ? (
                        <>
                          <div className="text-[10px] font-mono text-cyan-300">+{n.extra_distance_m} m · +{n.extra_time_min} min (incl. stop)</div>
                          <div className="text-[11px] text-white/70 mt-0.5">Why interesting: {n.why_interesting}</div>
                          {n.chemical_index != null && <div className="text-[10px] font-mono text-white/45">chemical index {n.chemical_index}</div>}
                          {!!n.considerations?.length && <ul className="mt-1 text-[10px] text-amber-200/90">{n.considerations.map((c, k) => <li key={k}>⚠ {c}</li>)}</ul>}
                        </>
                      ) : <div className="text-[11px] text-red-300">{n.note}</div>}
                    </button>
                  ))}
                </div>
              )}
              {m.route && <button onClick={onStartEva} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded bg-emerald-500/25 border border-emerald-400/60 text-xs font-mono font-bold tracking-wider hover:bg-emerald-500/40"><Play className="w-4 h-4" />START HELMET HUD (SIMULATED WALK)</button>}
              {m.resp && <p className="text-[10px] text-white/40 leading-relaxed">{m.resp.disclaimer}</p>}
            </div>
          )}

          {tab === 'site' && (
            site ? (
              <div className="space-y-3">
                <div><div className="text-sm font-bold">{site.name}</div><div className="text-[11px] text-orange-300">{site.goal}</div></div>
                <p className="text-xs text-white/75 leading-relaxed">{site.description}</p>
                {site.science_purpose && <div className="text-[11px]"><span className="text-white/45">Scientific purpose: </span>{site.science_purpose}</div>}
                {site.geology && <div className="text-[11px]"><span className="text-white/45">Formation: </span>{site.geology}</div>}
                <div className="text-[11px]"><span className="text-white/45">Chemistry: </span>{site.chemistry ?? <span className="font-mono text-red-300">MISSING</span>}</div>
                <dl className="text-[11px] font-mono space-y-1">
                  <div className="flex justify-between gap-2"><dt className="text-white/40">POSITION</dt><dd>{fmtLat(site.lat)} {fmtLon(site.lon)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-white/40">MISSION</dt><dd className="text-right">{site.mission}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-white/40">OBSERVED</dt><dd>{site.observed}</dd></div>
                </dl>
                {site.source_url && <a href={site.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline"><ExternalLink className="w-3 h-3" />Source</a>}
                <div>
                  <div className="text-[10px] font-mono text-white/50 mb-1">ROVER POINT-OF-VIEW IMAGES</div>
                  {site.pov_images.length === 0 && <div className="text-[11px] text-white/45 border border-dashed border-white/15 rounded p-2">No verified rover photo taken at this site yet. We do not substitute images from other places.</div>}
                  {site.pov_images.map((p, i) => (
                    <figure key={i} className="mb-2">
                      <img src={api.assetUrl(p.url)} alt={`${site.name} rover view`} className="w-full rounded border border-white/10" />
                      <figcaption className="text-[10px] font-mono text-white/50 mt-1 space-y-0.5"><div>Site: {site.name} · {fmtLat(site.lat)} {fmtLon(site.lon)}</div><div>Taken: {p.earth_date} (Sol {p.sol})</div><div>Source: {p.rover} · {p.camera}</div><div>{p.credit}</div>{p.source_url && <a href={p.source_url} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">image source</a>}</figcaption>
                    </figure>
                  ))}
                </div>
                <button onClick={() => { m.setGoalId(site.id); runPlan({ goalId: site.id }); setTab('route'); }} className="w-full px-3 py-2 rounded bg-cyan-500/25 border border-cyan-400/60 text-xs font-mono font-bold">ROUTE TO THIS SITE</button>
              </div>
            ) : <div className="text-xs text-white/50">Click an orange marker on the map.</div>
          )}

          {tab === 'safety' && <SafetyContextPanel oxygen={m.route?.safety?.oxygen} radiation={m.route?.safety?.radiation} weather={m.spaceWeather} suit={meta.suit_assumptions} />}

          {tab === 'data' && (
            <div className="space-y-3">
              <p className="text-[11px] text-white/60 leading-relaxed">Every layer shows where it comes from, how sharp it is, and whether it is static or historical. Different layers may differ in resolution and date.</p>
              {meta.layers.map((l, i) => (
                <div key={i} className="rounded border border-white/10 p-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold">{l.name}</span><Badge n={l.nature} /></div>
                  <div className="text-[11px] font-mono text-white/60">{l.mission} · {l.instrument}</div>
                  <div className="text-[11px] font-mono text-white/60">{l.product} · {l.resolution_m ? `${l.resolution_m} m/px` : 'res. n/a'} · {l.acquired}</div>
                  <div className="text-[11px] text-amber-200/90">Limit: {l.limitation}</div>
                  {l.source_url && <a href={l.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline"><ExternalLink className="w-3 h-3" />Source</a>}
                </div>
              ))}
              {meta.crs && (
                <div className="rounded border border-cyan-400/20 bg-cyan-500/5 p-2.5 text-[11px] space-y-1">
                  <div className="font-bold text-cyan-200">Coordinate system &amp; alignment</div>
                  <div className="text-white/65">{meta.crs.coordinates}</div>
                  <div className="text-white/65">{meta.crs.grid}</div>
                  <div className="text-white/65">{meta.crs.alignment}</div>
                  <div className="font-mono text-white/50">Grid {meta.grid.width}×{meta.grid.height} · {meta.grid.cell_m} m/cell. Layers of different native resolution are shown at their own stated resolution; a layer with no coverage is drawn grey / MISSING.</div>
                </div>
              )}
              {!meta.layer_urls.chemical && <div className="rounded border border-red-500/30 bg-red-950/20 p-2.5 text-[11px] text-red-200">Chemical layer: MISSING for this region (not faked).</div>}
              <div className="rounded border border-white/10 p-2.5 text-[11px] font-mono text-white/60">
                Elevation {Math.round(meta.stats.elev_min_m)} … {Math.round(meta.stats.elev_max_m)} m · max slope {meta.stats.slope_max_deg.toFixed(0)}° · no-data {meta.stats.nodata_pct}%
              </div>
            </div>
          )}
        </aside>
      </div>
      {analysisOpen && m.route?.explanation && (
        <RouteAnalysisWindow route={m.route} strategyLabel={STRATEGY[m.route.strategy].label} insights={m.resp?.insights ?? []} onClose={() => setAnalysisOpen(false)} />
      )}
    </div>
  );
};
