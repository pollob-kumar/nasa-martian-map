'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Layers,
  Route as RouteIcon,
  MapPin,
  TriangleAlert,
  ExternalLink,
  Crosshair,
  Ban,
  Play,
  Database,
  Trash2,
  ShieldAlert,
  ClipboardList,
  Compass,
  Target,
  Activity,
  Sliders,
  ChevronDown,
} from 'lucide-react';
import type { Mission } from '../lib/useMission';
import type { LayerName, Nature, RouteResult } from '../lib/missionTypes';
import { api } from '../lib/api';
import { fmtLat, fmtLon, fracToLatLon, latLonToFrac } from '../lib/geo';
import { hudSound } from '../utils/soundEffects';
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

const GEO_COLOR: Record<string, string> = {
  delta: '#38bdf8',
  crater_rim: '#f472b6',
  lakebed: '#a78bfa',
  boxwork: '#facc15',
  ejecta: '#fb923c',
};

type ClickMode = 'inspect' | 'start' | 'obstacle';
type Tab = 'route' | 'site' | 'safety' | 'data';

const Badge = ({ n }: { n: Nature }) => (
  <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono tracking-wider ${NATURE[n].cls}`}>
    {NATURE[n].label}
  </span>
);

export const LayeredMapModal: React.FC<Props> = ({
  isOpen,
  onClose,
  mission: m,
  astronaut,
  onStartEva,
}) => {
  const [on, setOn] = useState<Record<string, boolean>>({
    imagery: true,
    hillshade: true,
    slope: false,
    hazard: true,
    chemical: false,
    geology: true,
    rover: true,
    sites: true,
    route: true,
  });
  const [mode, setMode] = useState<ClickMode>('inspect');
  const [tab, setTab] = useState<Tab>('route');
  const [siteId, setSiteId] = useState<string | null>(null);
  const [obsRadius, setObsRadius] = useState(150);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const [lay, setLay] = useState<LayerState>({});
  const [probe, setProbe] = useState<{
    px: number;
    py: number;
    data: ProbeResult | null;
    loading: boolean;
  } | null>(null);

  // Collapsible accordion states (default: closed as requested by user)
  const [layersOpen, setLayersOpen] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const meta = m.meta;
  const raster = meta?.raster;

  useEffect(() => {
    if (raster && Object.keys(lay).length) {
      try {
        localStorage.setItem('rednav.layers', JSON.stringify(lay));
      } catch {
        /* ignore */
      }
    }
  }, [lay, raster]);

  useEffect(() => {
    if (!raster) return;
    let saved: LayerState | null = null;
    try {
      saved = JSON.parse(localStorage.getItem('rednav.layers') ?? 'null');
    } catch {
      /* ignore */
    }
    const anyOn = saved && Object.values(saved).some((v) => v.on);
    setLay(
      anyOn
        ? {
            ...Object.fromEntries(raster.layers.map((l) => [l.key, { on: false, opacity: l.default_opacity }])),
            ...saved,
            orthomosaic: { on: true, opacity: saved?.orthomosaic?.opacity ?? 1 },
          }
        : Object.fromEntries(raster.layers.map((l) => [l.key, { on: l.default_on, opacity: l.default_opacity }]))
    );
    setProbe(null);
  }, [meta?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const site = m.sites.find((s) => s.id === siteId) ?? null;
  const prov = (kind: string) => meta?.layers.find((l) => l.kind === kind);

  const pos = useMemo(() => {
    if (!meta) return null;
    return (lat: number, lon: number) => {
      const { fx, fy } = latLonToFrac(meta, lat, lon);
      return { x: fx * 1000, y: fy * 1000 * (meta.grid.height / meta.grid.width) };
    };
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
            <button className="mt-3 px-4 py-2 rounded border border-white/20" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          'LOADING REGION DATA…'
        )}
      </div>
    );
  }

  const runPlan = (o?: Parameters<typeof m.plan>[0]) => {
    void m.plan(o);
  };

  const widthKm = (meta.grid.width * meta.grid.cell_m) / 1000;
  const scaleKm = [0.5, 1, 2, 5, 10].reduce(
    (best, k) => (Math.abs(k - widthKm * 0.2) < Math.abs(best - widthKm * 0.2) ? k : best),
    1
  );
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
    if (mode === 'start') {
      m.setStart({ lat: pk.lat, lon: pk.lon });
      runPlan({ start: { lat: pk.lat, lon: pk.lon } });
      setMode('inspect');
      return;
    }
    if (mode === 'obstacle') {
      const next = [...m.obstacles, { lat: pk.lat, lon: pk.lon, radius_m: obsRadius, name: 'user obstacle' }];
      m.setObstacles(next);
      runPlan({ obstacles: next });
      setMode('inspect');
      return;
    }
    setProbe({ px: pk.px, py: pk.py, data: null, loading: true });
    api
      .probe(pk.lat, pk.lon)
      .then((d) => setProbe((p) => (p ? { ...p, data: d, loading: false } : p)))
      .catch(() => setProbe(null));
  };

  const removeObstacle = (i: number) => {
    hudSound.playClick();
    const next = m.obstacles.filter((_, k) => k !== i);
    m.setObstacles(next);
    runPlan({ obstacles: next });
  };

  const selectSite = (id: string) => {
    hudSound.playClick();
    setSiteId(id);
    setTab('site');
    setDetailsOpen(true);
  };

  const setOpt = (k: keyof NonNullable<typeof m.options>, v: number) =>
    m.options && m.setOptions({ ...m.options, [k]: v });

  const poly = (r: RouteResult) =>
    (r.points ?? [])
      .map((p) => {
        const q = pos(p.lat, p.lon);
        return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
      })
      .join(' ');

  const Slider = ({
    label,
    k,
    min,
    max,
    step,
    unit,
  }: {
    label: string;
    k: keyof NonNullable<typeof m.options>;
    min: number;
    max: number;
    step: number;
    unit: string;
  }) => (
    <label className="block">
      <div className="flex justify-between text-[10px] font-mono text-white/60">
        <span>{label}</span>
        <span className="text-cyan-300 font-bold">
          {m.options?.[k]} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={m.options?.[k] ?? min}
        onChange={(e) => setOpt(k, Number(e.target.value))}
        className="w-full accent-cyan-400 h-1 cursor-pointer"
      />
    </label>
  );

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-[#050308]/95 backdrop-blur-xl text-slate-100 select-text cursor-default"
      role="dialog"
      aria-label="Layered map and route planner"
    >
      {/* Top Header */}
      <header className="flex items-center justify-between gap-4 px-5 py-2.5 border-b border-cyan-500/20 bg-slate-950/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(34,211,238,0.25)]">
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-sm font-bold tracking-wider text-white flex items-center gap-2">
              <span>{meta.name.toUpperCase()}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono tracking-widest uppercase">
                TACTICAL HUD
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Details Toggle Button */}
          <button
            onClick={() => {
              hudSound.playClick();
              setDetailsOpen(!detailsOpen);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-xs font-bold tracking-wider transition cursor-pointer ${
              detailsOpen
                ? 'border-cyan-400 bg-cyan-500/25 text-cyan-200 shadow-[0_0_15px_rgba(34,211,238,0.3)] ring-1 ring-cyan-400/40'
                : 'border-white/15 bg-slate-900/70 text-white/70 hover:border-cyan-400/50 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>DETAILS</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                detailsOpen ? 'rotate-180 text-cyan-400' : ''
              }`}
            />
          </button>

          <button
            onClick={() => {
              hudSound.playClick();
              onClose();
            }}
            className="p-1.5 rounded-lg border border-white/15 hover:border-cyan-400/60 hover:bg-cyan-500/15 text-white/70 hover:text-white transition cursor-pointer"
            aria-label="Close map (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {meta.synthetic && (
        <div className="px-5 py-1 bg-red-600/80 text-white font-mono text-[10px] tracking-widest text-center shrink-0">
          SYNTHETIC DEMO DATA — NOT NASA DATA — FOR DEVELOPMENT ONLY
        </div>
      )}
      {meta.coord_status === 'approx_needs_verify' && (
        <div className="px-5 py-1 bg-amber-500/20 text-amber-200 font-mono text-[10px] text-center shrink-0">
          Region centre is approximate — verify it in the USGS Gazetteer.
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* LEFT: layers + settings (Collapsible accordions, default closed) */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-white/10 p-3.5 space-y-3 bg-[#07050d]/80 backdrop-blur-sm">
          {/* DATA LAYERS ACCORDION (Default Collapsed) */}
          <section className="rounded-xl border border-white/10 bg-slate-900/30 overflow-hidden transition-all">
            <button
              onClick={() => {
                hudSound.playClick();
                setLayersOpen(!layersOpen);
              }}
              className="w-full flex items-center justify-between p-3 text-left font-mono hover:bg-white/5 transition cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-xs font-bold tracking-wider text-cyan-200">DATA LAYERS</span>
                {raster && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-mono">
                    {raster.real_layers}/{raster.total_layers} NASA
                  </span>
                )}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-white/50 transition-transform duration-200 shrink-0 ${
                  layersOpen ? 'rotate-180 text-cyan-400' : ''
                }`}
              />
            </button>

            {layersOpen && (
              <div className="p-3 pt-1 border-t border-white/5 space-y-3">
                {raster ? (
                  <LayerToggleList
                    layers={raster.layers}
                    state={lay}
                    onToggle={(k, v) => {
                      hudSound.playClick();
                      setLay({ ...lay, [k]: { ...lay[k], on: v } });
                    }}
                    onOpacity={(k, v) => setLay({ ...lay, [k]: { ...lay[k], opacity: v } })}
                  />
                ) : null}

                <ul className="space-y-1.5 mt-2">
                  {!raster &&
                    LAYER_ROWS.map((l) => {
                      const have = !!meta.layer_urls[l.key];
                      const p = prov(l.kind);
                      return (
                        <li
                          key={l.key}
                          className={`rounded-lg border px-2.5 py-2 ${
                            have ? 'border-white/10 bg-slate-900/50' : 'border-red-500/30 bg-red-950/20'
                          }`}
                        >
                          <label className="flex items-center gap-2 text-xs font-mono cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={!have}
                              checked={have && on[l.key]}
                              onChange={(e) => setOn({ ...on, [l.key]: e.target.checked })}
                              className="accent-cyan-400"
                            />
                            <span className="flex-1 text-white/90">{l.label}</span>
                            {have && p ? <Badge n={p.nature} /> : <span className="text-[9px] font-mono text-red-300">MISSING</span>}
                          </label>
                          {have && p && (
                            <div className="mt-1 text-[10px] font-mono text-white/45">
                              {p.mission} · {p.resolution_m ? `${p.resolution_m} m/px` : 'res. n/a'}
                            </div>
                          )}
                          {!have && <div className="mt-1 text-[10px] text-red-300/80">No data for this region — not faked.</div>}
                        </li>
                      );
                    })}
                  {[
                    ['geology', 'Geological features'],
                    ['rover', 'Rover observations'],
                    ['sites', 'Science sites'],
                    ['route', 'Routes'],
                  ].map(([k, label]) => (
                    <li key={k} className="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
                      <label className="flex items-center gap-2 text-xs font-mono cursor-pointer">
                        <input
                          type="checkbox"
                          checked={on[k]}
                          onChange={(e) => {
                            hudSound.playClick();
                            setOn({ ...on, [k]: e.target.checked });
                          }}
                          className="accent-cyan-400"
                        />
                        <span className="text-white/80">{label}</span>
                      </label>
                    </li>
                  ))}
                  {raster && meta.layer_urls.chemical && (
                    <li className="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
                      <label className="flex items-center gap-2 text-xs font-mono cursor-pointer">
                        <input
                          type="checkbox"
                          checked={on.chemical}
                          onChange={(e) => {
                            hudSound.playClick();
                            setOn({ ...on, chemical: e.target.checked });
                          }}
                          className="accent-cyan-400"
                        />
                        <span className="flex-1 text-white/80">Chemical index</span>
                        <OriginBadge o="demo" />
                      </label>
                    </li>
                  )}
                </ul>

                {meta.layer_urls.chemical && on.chemical && (
                  <div className="mt-2 text-[10px] font-mono text-white/60 space-y-1">
                    <div className="h-2 rounded" style={{ background: 'linear-gradient(to right,#461e78,#ffdc1e)' }} />
                    <div className="flex justify-between">
                      <span>low</span>
                      <span>chemical index</span>
                      <span>high</span>
                    </div>
                    <div>
                      <i className="inline-block w-2 h-2 rounded-sm bg-slate-500 mr-1" />
                      grey = NO coverage (missing)
                    </div>
                  </div>
                )}

                <div className="mt-3 flex gap-3 text-[10px] font-mono text-white/50 border-t border-white/5 pt-2">
                  <span>
                    <i className="inline-block w-2 h-2 rounded-sm bg-emerald-400 mr-1" />
                    OK
                  </span>
                  <span>
                    <i className="inline-block w-2 h-2 rounded-sm bg-amber-400 mr-1" />
                    caution
                  </span>
                  <span>
                    <i className="inline-block w-2 h-2 rounded-sm bg-red-500 mr-1" />
                    no-go
                  </span>
                  <span>
                    <i className="inline-block w-2 h-2 rounded-sm bg-slate-500 mr-1" />
                    no data
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* TERRAIN LIMITS ACCORDION (Default Collapsed) */}
          <section className="rounded-xl border border-white/10 bg-slate-900/30 overflow-hidden transition-all">
            <button
              onClick={() => {
                hudSound.playClick();
                setLimitsOpen(!limitsOpen);
              }}
              className="w-full flex items-center justify-between p-3 text-left font-mono hover:bg-white/5 transition cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Sliders className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-xs font-bold tracking-wider text-white/80">TERRAIN LIMITS</span>
                <span className="text-amber-300 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-400/20 font-mono">
                  ASSUMPTIONS
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-white/50 transition-transform duration-200 shrink-0 ${
                  limitsOpen ? 'rotate-180 text-cyan-400' : ''
                }`}
              />
            </button>

            {limitsOpen && (
              <div className="p-3 pt-1 border-t border-white/5 space-y-3 font-mono">
                <Slider label="No-go slope above" k="max_slope_deg" min={5} max={45} step={1} unit="°" />
                <Slider label="Caution slope above" k="caution_slope_deg" min={2} max={40} step={1} unit="°" />
                <Slider label="Walking speed" k="walk_speed_ms" min={0.3} max={2} step={0.1} unit="m/s" />
                <Slider label="Cargo load factor" k="load_factor" min={1} max={2.5} step={0.1} unit="×" />
                <Slider label="Science stop" k="science_stop_min" min={0} max={60} step={5} unit="min" />
                <p className="text-[9px] text-white/40 leading-relaxed">
                  * Team assumptions, not validated NASA limits.
                </p>
              </div>
            )}
          </section>
        </aside>

        {/* CENTER: map with floating Tactical Mission Control pod & START Button */}
        <main className="flex-1 min-w-0 flex items-center justify-center p-4 bg-black/40 relative">
          {/* Left Floating Mission Pod & START Button */}
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className="absolute top-6 left-6 z-30 w-72 space-y-2.5 font-mono pointer-events-auto"
          >
            {/* Mission Control Pod */}
            <div className="rounded-xl border border-cyan-500/40 bg-slate-950/90 backdrop-blur-md p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.85)] space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-cyan-300">
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  <span>MISSION CONTROL</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/30 text-cyan-300">
                  HUD v2
                </span>
              </div>

              {/* Region Dropdown */}
              <div>
                <div className="flex items-center justify-between text-[10px] text-white/50 mb-1">
                  <span>REGION</span>
                  <span className="text-cyan-400 text-[9px]">{m.allRegions.length} AVAILABLE</span>
                </div>
                <select
                  value={m.regionId}
                  onChange={(e) => {
                    hudSound.playClick();
                    m.setRegionId(e.target.value);
                    setSiteId(null);
                  }}
                  className="w-full bg-slate-900/90 border border-white/15 hover:border-cyan-400/60 focus:border-cyan-400 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none transition cursor-pointer"
                >
                  {m.allRegions.map((r) => (
                    <option key={r.id} value={r.id} className="bg-slate-950 text-white">
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Destination Dropdown */}
              <div>
                <div className="flex items-center justify-between text-[10px] text-white/50 mb-1">
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <Target className="w-3 h-3" /> DESTINATION
                  </span>
                  <span className="text-white/40 text-[9px]">SCIENCE TARGET</span>
                </div>
                <select
                  value={m.goalId ?? ''}
                  onChange={(e) => {
                    hudSound.playClick();
                    m.setGoalId(e.target.value);
                    runPlan({ goalId: e.target.value });
                  }}
                  className="w-full bg-slate-900/90 border border-white/15 hover:border-amber-400/60 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none transition cursor-pointer"
                >
                  {m.sites.map((s) => (
                    <option key={s.id} value={s.id} className="bg-slate-950 text-white">
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons: Pick Start & Add Obstacle */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  onClick={() => {
                    hudSound.playClick();
                    setMode(mode === 'start' ? 'inspect' : 'start');
                  }}
                  className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-bold transition shadow-sm cursor-pointer ${
                    mode === 'start'
                      ? 'border-cyan-400 bg-cyan-500/25 text-cyan-200 ring-2 ring-cyan-400/50 animate-pulse'
                      : 'border-white/15 bg-slate-900/70 text-white/90 hover:border-cyan-400/50 hover:bg-slate-800'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{mode === 'start' ? 'Click Map' : 'Pick Start'}</span>
                </button>

                <button
                  onClick={() => {
                    hudSound.playClick();
                    setMode(mode === 'obstacle' ? 'inspect' : 'obstacle');
                  }}
                  className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-bold transition shadow-sm cursor-pointer ${
                    mode === 'obstacle'
                      ? 'border-red-400 bg-red-500/25 text-red-200 ring-2 ring-red-400/50 animate-pulse'
                      : 'border-white/15 bg-slate-900/70 text-white/90 hover:border-red-400/50 hover:bg-slate-800'
                  }`}
                >
                  <Ban className="w-3.5 h-3.5 text-red-400" />
                  <span>{mode === 'obstacle' ? 'Click Map' : 'Add Obstacle'}</span>
                </button>
              </div>

              {/* Start coordinate readout */}
              {m.start && (
                <div className="text-[10px] text-cyan-300/80 bg-cyan-950/20 border border-cyan-500/20 rounded px-2 py-1 flex items-center justify-between">
                  <span className="text-white/40">START:</span>
                  <span>
                    {fmtLat(m.start.lat)} {fmtLon(m.start.lon)}
                  </span>
                </div>
              )}

              {/* Obstacle mode parameters */}
              {mode === 'obstacle' && (
                <div className="pt-1 text-[10px] text-red-300 space-y-1 bg-red-950/30 border border-red-500/30 rounded-lg p-2 font-mono">
                  <div className="flex justify-between">
                    <span className="text-white/70">Zone Radius:</span>
                    <span className="font-bold text-red-200">{obsRadius} m</span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={800}
                    step={10}
                    value={obsRadius}
                    onChange={(e) => setObsRadius(Number(e.target.value))}
                    className="w-full accent-red-400 h-1 cursor-pointer"
                  />
                  <div className="text-[9px] text-white/50 text-center">Click terrain to place no-go hazard</div>
                </div>
              )}

              {mode === 'start' && (
                <div className="text-[10px] text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 rounded px-2 py-1 text-center animate-pulse">
                  Click map to place EVA start point
                </div>
              )}

              {/* Obstacles list */}
              {m.obstacles.length > 0 && (
                <div className="space-y-1 max-h-24 overflow-y-auto pt-1 font-mono">
                  {m.obstacles.map((o, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-[10px] bg-red-950/40 border border-red-500/20 rounded px-2 py-1"
                    >
                      <span className="text-red-200">
                        No-Go #{i + 1} ({o.radius_m}m)
                      </span>
                      <button
                        onClick={() => removeObstacle(i)}
                        className="text-red-400 hover:text-red-200 p-0.5 cursor-pointer"
                        title="Remove obstacle"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Standalone Prominent START Button (Green box from user sketch) */}
            <button
              onClick={() => {
                hudSound.playTargetLock();
                onStartEva();
              }}
              disabled={!m.route || m.planning}
              className={`w-full py-3 px-4 rounded-xl font-mono font-black text-base tracking-widest flex items-center justify-center gap-2.5 transition-all shadow-xl active:scale-[0.98] ${
                m.route && !m.planning
                  ? 'border-2 border-emerald-400 bg-emerald-500/30 hover:bg-emerald-500/45 text-emerald-200 shadow-[0_0_30px_rgba(16,185,129,0.45)] cursor-pointer hover:border-emerald-300'
                  : 'border border-white/10 bg-slate-900/60 text-white/30 cursor-not-allowed'
              }`}
            >
              <Play className={`w-5 h-5 ${m.route ? 'fill-emerald-400 text-emerald-400 animate-pulse' : 'text-white/30'}`} />
              <span>{m.planning ? 'PLANNING…' : 'START'}</span>
            </button>
          </div>

          {/* Floating Details toggle on top-right of map if closed */}
          {!detailsOpen && (
            <button
              onClick={() => {
                hudSound.playClick();
                setDetailsOpen(true);
              }}
              className="absolute top-6 right-6 z-30 flex items-center gap-2 px-3 py-2 rounded-xl border border-cyan-500/40 bg-slate-950/85 backdrop-blur-md font-mono text-xs font-bold text-cyan-200 hover:border-cyan-400 shadow-[0_4px_20px_rgba(0,0,0,0.7)] hover:bg-cyan-950/40 transition cursor-pointer"
            >
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>DETAILS</span>
            </button>
          )}

          {raster ? (
            <div className="relative h-full w-full rounded-lg border border-white/15 overflow-hidden">
              <RasterMap
                meta={meta}
                layerState={lay}
                cursor={mode !== 'inspect' ? 'crosshair' : 'grab'}
                onPick={onRasterPick}
                popup={
                  probe
                    ? {
                        px: probe.px,
                        py: probe.py,
                        node: <ProbeCard data={probe.data} loading={probe.loading} onClose={() => setProbe(null)} />,
                      }
                    : null
                }
                overlay={(sc) => (
                  <>
                    {on.chemical && meta.layer_urls.chemical && (
                      <image
                        href={api.assetUrl(meta.layer_urls.chemical)}
                        x="0"
                        y="0"
                        width="1000"
                        height={vbH}
                        preserveAspectRatio="none"
                        opacity="0.6"
                      />
                    )}

                    {on.geology &&
                      m.geology.map((g) => {
                        const pts = g.polygon
                          .map(([la, lo]) => {
                            const q = pos(la, lo);
                            return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
                          })
                          .join(' ');
                        const c0 = g.polygon.reduce(
                          (a, [la, lo]) => {
                            const q = pos(la, lo);
                            return { x: a.x + q.x / g.polygon.length, y: a.y + q.y / g.polygon.length };
                          },
                          { x: 0, y: 0 }
                        );
                        const col = GEO_COLOR[g.type] ?? '#e5e7eb';
                        return (
                          <g key={g.id}>
                            <polygon
                              points={pts}
                              fill={col}
                              fillOpacity={g.type === 'boxwork' ? 0.08 : 0.16}
                              stroke={col}
                              strokeWidth={2.5 * sc}
                              strokeDasharray={g.type === 'boxwork' ? '3 5' : undefined}
                            />
                            <text
                              x={c0.x}
                              y={c0.y}
                              textAnchor="middle"
                              fill={col}
                              fontSize={15 * sc}
                              fontFamily="monospace"
                              stroke="#000"
                              strokeWidth={3 * sc}
                              paintOrder="stroke"
                            >
                              {g.name}
                            </text>
                          </g>
                        );
                      })}
                    {m.hazards.map((h) => {
                      const q = pos(h.lat, h.lon);
                      return (
                        <circle
                          key={h.id}
                          cx={q.x}
                          cy={q.y}
                          r={Math.max(6 * sc, h.radius_m / mPerUnit)}
                          fill="rgba(239,68,68,.25)"
                          stroke="#f87171"
                          strokeWidth={2 * sc}
                          strokeDasharray={`${6 * sc} ${4 * sc}`}
                        />
                      );
                    })}
                    {m.obstacles.map((o, i) => {
                      const q = pos(o.lat, o.lon);
                      return (
                        <circle
                          key={i}
                          cx={q.x}
                          cy={q.y}
                          r={Math.max(6 * sc, o.radius_m / mPerUnit)}
                          fill="rgba(239,68,68,.35)"
                          stroke="#fecaca"
                          strokeWidth={2 * sc}
                        />
                      );
                    })}
                    {on.route &&
                      m.foundRoutes.map(
                        (r, i) =>
                          i !== m.routeIdx && (
                            <polyline
                              key={r.strategy}
                              points={poly(r)}
                              fill="none"
                              stroke={STRATEGY[r.strategy].color}
                              strokeOpacity=".45"
                              strokeWidth={3 * sc}
                              strokeDasharray={`${8 * sc} ${6 * sc}`}
                            />
                          )
                      )}
                    {on.route && m.route && (
                      <polyline
                        points={poly(m.route)}
                        fill="none"
                        stroke={STRATEGY[m.route.strategy].color}
                        strokeWidth={5 * sc}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    )}
                    {m.start &&
                      (() => {
                        const q = pos(m.start.lat, m.start.lon);
                        return (
                          <g>
                            <circle cx={q.x} cy={q.y} r={11 * sc} fill="#22d3ee" stroke="#fff" strokeWidth={3 * sc} />
                            <text
                              x={q.x + 16 * sc}
                              y={q.y + 5 * sc}
                              fill="#fff"
                              fontSize={18 * sc}
                              fontFamily="monospace"
                              stroke="#000"
                              strokeWidth={3 * sc}
                              paintOrder="stroke"
                            >
                              START
                            </text>
                          </g>
                        );
                      })()}
                    {on.sites &&
                      m.sites.map((s) => {
                        const q = pos(s.lat, s.lon);
                        const goal = s.id === m.goalId;
                        return (
                          <g key={s.id} onClick={(e) => { e.stopPropagation(); selectSite(s.id); }} className="cursor-pointer">
                            <circle cx={q.x} cy={q.y} r={14 * sc} fill={goal ? '#facc15' : '#f97316'} stroke="#fff" strokeWidth={3 * sc} />
                            <text
                              x={q.x + 18 * sc}
                              y={q.y + 6 * sc}
                              fill="#fff"
                              fontSize={19 * sc}
                              fontFamily="monospace"
                              stroke="#000"
                              strokeWidth={4 * sc}
                              paintOrder="stroke"
                            >
                              {s.name}
                            </text>
                          </g>
                        );
                      })}
                    {on.rover &&
                      m.sites
                        .filter((s) => s.pov_images.length > 0)
                        .map((s) => {
                          const q = pos(s.lat, s.lon);
                          return (
                            <g key={`rov-${s.id}`} onClick={(e) => { e.stopPropagation(); selectSite(s.id); }} className="cursor-pointer">
                              <rect
                                x={q.x - 30 * sc}
                                y={q.y - 34 * sc}
                                width={22 * sc}
                                height={16 * sc}
                                rx={3 * sc}
                                fill="#0e7490"
                                stroke="#fff"
                                strokeWidth={2 * sc}
                              />
                              <circle cx={q.x - 19 * sc} cy={q.y - 26 * sc} r={4.5 * sc} fill="#fff" />
                            </g>
                          );
                        })}
                    {astronaut &&
                      (() => {
                        const q = pos(astronaut.lat, astronaut.lon);
                        return <circle cx={q.x} cy={q.y} r={9 * sc} fill="#34d399" stroke="#fff" strokeWidth={3 * sc} />;
                      })()}
                    {probe &&
                      probe.data &&
                      pos &&
                      (() => {
                        const q = pos(probe.data!.lat, probe.data!.lon);
                        return (
                          <g>
                            <circle cx={q.x} cy={q.y} r={7 * sc} fill="none" stroke="#22d3ee" strokeWidth={2.5 * sc} />
                            <circle cx={q.x} cy={q.y} r={1.8 * sc} fill="#22d3ee" />
                          </g>
                        );
                      })()}
                  </>
                )}
              />
              {m.planning && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center font-mono text-xs tracking-widest text-cyan-300 pointer-events-none">
                  PLANNING MISSION ROUTE…
                </div>
              )}
            </div>
          ) : (
            <div
              ref={mapRef}
              onClick={onMapClick}
              className={`relative aspect-square h-full max-w-full overflow-hidden rounded-lg border border-white/15 bg-slate-950 ${
                mode !== 'inspect' ? 'cursor-crosshair' : ''
              }`}
            >
              {meta.layer_urls.imagery && on.imagery && (
                <img
                  src={api.assetUrl(meta.layer_urls.imagery)}
                  alt="Surface imagery"
                  className="absolute inset-0 w-full h-full object-fill [image-rendering:auto]"
                  draggable={false}
                />
              )}
              {meta.layer_urls.hillshade && on.hillshade && (
                <img
                  src={api.assetUrl(meta.layer_urls.hillshade)}
                  alt="Terrain shading"
                  className="absolute inset-0 w-full h-full object-fill"
                  style={{
                    mixBlendMode: meta.layer_urls.imagery && on.imagery ? 'multiply' : 'normal',
                    opacity: meta.layer_urls.imagery && on.imagery ? 0.75 : 1,
                  }}
                  draggable={false}
                />
              )}
              {meta.layer_urls.slope && on.slope && (
                <img
                  src={api.assetUrl(meta.layer_urls.slope)}
                  alt="Slope classes"
                  className="absolute inset-0 w-full h-full object-fill [image-rendering:pixelated]"
                  draggable={false}
                />
              )}
              {meta.layer_urls.chemical && on.chemical && (
                <img
                  src={api.assetUrl(meta.layer_urls.chemical)}
                  alt="Chemical index"
                  className="absolute inset-0 w-full h-full object-fill [image-rendering:pixelated]"
                  draggable={false}
                />
              )}
              {meta.layer_urls.hazard && on.hazard && !on.slope && (
                <img
                  src={api.assetUrl(meta.layer_urls.hazard)}
                  alt="No-go cells"
                  className="absolute inset-0 w-full h-full object-fill [image-rendering:pixelated]"
                  draggable={false}
                />
              )}

              <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                {on.geology &&
                  m.geology.map((g) => {
                    const pts = g.polygon
                      .map(([la, lo]) => {
                        const q = pos(la, lo);
                        return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
                      })
                      .join(' ');
                    const c0 = g.polygon.reduce(
                      (a, [la, lo]) => {
                        const q = pos(la, lo);
                        return { x: a.x + q.x / g.polygon.length, y: a.y + q.y / g.polygon.length };
                      },
                      { x: 0, y: 0 }
                    );
                    const col = GEO_COLOR[g.type] ?? '#e5e7eb';
                    return (
                      <g key={g.id}>
                        <polygon
                          points={pts}
                          fill={col}
                          fillOpacity={g.type === 'boxwork' ? 0.08 : 0.16}
                          stroke={col}
                          strokeWidth="2.5"
                          strokeDasharray={g.type === 'boxwork' ? '3 5' : undefined}
                        />
                        <text
                          x={c0.x}
                          y={c0.y}
                          textAnchor="middle"
                          fill={col}
                          fontSize={15}
                          fontFamily="monospace"
                          stroke="#000"
                          strokeWidth="3"
                          paintOrder="stroke"
                        >
                          {g.name}
                        </text>
                      </g>
                    );
                  })}
                {m.hazards.map((h) => {
                  const q = pos(h.lat, h.lon);
                  return (
                    <circle
                      key={h.id}
                      cx={q.x}
                      cy={q.y}
                      r={Math.max(6, h.radius_m / mPerUnit)}
                      fill="rgba(239,68,68,.25)"
                      stroke="#f87171"
                      strokeWidth="2"
                      strokeDasharray="6 4"
                    />
                  );
                })}
                {m.obstacles.map((o, i) => {
                  const q = pos(o.lat, o.lon);
                  return (
                    <circle
                      key={i}
                      cx={q.x}
                      cy={q.y}
                      r={Math.max(6, o.radius_m / mPerUnit)}
                      fill="rgba(239,68,68,.35)"
                      stroke="#fecaca"
                      strokeWidth="2"
                    />
                  );
                })}
                {on.route &&
                  m.foundRoutes.map(
                    (r, i) =>
                      i !== m.routeIdx && (
                        <polyline
                          key={r.strategy}
                          points={poly(r)}
                          fill="none"
                          stroke={STRATEGY[r.strategy].color}
                          strokeOpacity=".45"
                          strokeWidth="3"
                          strokeDasharray="8 6"
                        />
                      )
                  )}
                {on.route && m.route && (
                  <polyline
                    points={poly(m.route)}
                    fill="none"
                    stroke={STRATEGY[m.route.strategy].color}
                    strokeWidth="5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                {m.start &&
                  (() => {
                    const q = pos(m.start.lat, m.start.lon);
                    return (
                      <g>
                        <circle cx={q.x} cy={q.y} r="11" fill="#22d3ee" stroke="#fff" strokeWidth="3" />
                        <text
                          x={q.x + 16}
                          y={q.y + 5}
                          fill="#fff"
                          fontSize="18"
                          fontFamily="monospace"
                          stroke="#000"
                          strokeWidth="3"
                          paintOrder="stroke"
                        >
                          START
                        </text>
                      </g>
                    );
                  })()}
                {on.sites &&
                  m.sites.map((s) => {
                    const q = pos(s.lat, s.lon);
                    const goal = s.id === m.goalId;
                    return (
                      <g key={s.id} onClick={(e) => { e.stopPropagation(); selectSite(s.id); }} className="cursor-pointer">
                        <circle cx={q.x} cy={q.y} r="14" fill={goal ? '#facc15' : '#f97316'} stroke="#fff" strokeWidth="3" />
                        <text
                          x={q.x + 18}
                          y={q.y + 6}
                          fill="#fff"
                          fontSize="19"
                          fontFamily="monospace"
                          stroke="#000"
                          strokeWidth="4"
                          paintOrder="stroke"
                        >
                          {s.name}
                        </text>
                      </g>
                    );
                  })}
                {on.rover &&
                  m.sites
                    .filter((s) => s.pov_images.length > 0)
                    .map((s) => {
                      const q = pos(s.lat, s.lon);
                      return (
                        <g key={`rov-${s.id}`} onClick={(e) => { e.stopPropagation(); selectSite(s.id); }} className="cursor-pointer">
                          <rect x={q.x - 30} y={q.y - 34} width="22" height="16" rx="3" fill="#0e7490" stroke="#fff" strokeWidth="2" />
                          <circle cx={q.x - 19} cy={q.y - 26} r="4.5" fill="#fff" />
                          <rect x={q.x - 26} y={q.y - 37} width="8" height="4" fill="#fff" />
                        </g>
                      );
                    })}
                {astronaut &&
                  (() => {
                    const q = pos(astronaut.lat, astronaut.lon);
                    return (
                      <circle cx={q.x} cy={q.y} r="9" fill="#34d399" stroke="#fff" strokeWidth="3">
                        <animate attributeName="r" values="9;14;9" dur="1.6s" repeatCount="indefinite" />
                      </circle>
                    );
                  })()}
              </svg>

              <div className="absolute left-2 bottom-2 flex items-center gap-2 text-[10px] font-mono text-white bg-black/70 rounded px-2 py-1">
                <span
                  className="inline-block h-[3px] bg-white"
                  style={{
                    width: `${((scaleKm * 1000) / (meta.grid.width * meta.grid.cell_m)) * (mapRef.current?.clientWidth ?? 600)}px`,
                  }}
                />
                <span>{scaleKm} km · north ↑</span>
              </div>
              {m.planning && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center font-mono text-xs tracking-widest text-cyan-300">
                  PLANNING MISSION ROUTE…
                </div>
              )}
            </div>
          )}
        </main>

        {/* RIGHT: results & game-vibe route HUD (Only when detailsOpen is true) */}
        {detailsOpen && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-white/10 p-3.5 space-y-3 bg-[#08060f]/80 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 font-mono">
              <span className="text-xs font-bold tracking-wider text-cyan-300 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>MISSION DETAILS</span>
              </span>
              <button
                onClick={() => {
                  hudSound.playClick();
                  setDetailsOpen(false);
                }}
                className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white cursor-pointer"
                title="Hide Details"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Futuristic HUD Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950/80 rounded-xl border border-white/10">
              {([
                ['route', 'ROUTE', RouteIcon],
                ['site', 'TARGET', MapPin],
                ['safety', 'SAFETY', ShieldAlert],
                ['data', 'DATA', Database],
              ] as const).map(([k, label, Icon]) => (
                <button
                  key={k}
                  onClick={() => {
                    hudSound.playClick();
                    setTab(k as Tab);
                  }}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-[9px] font-mono tracking-wider transition cursor-pointer ${
                    tab === k
                      ? 'bg-cyan-500/20 border border-cyan-400/60 text-cyan-200 font-bold shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 mb-0.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {tab === 'route' && (
              <div className="space-y-3">
                {m.planError && (
                  <div className="text-xs text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg p-2.5 font-mono">
                    {m.planError}
                  </div>
                )}

                {/* Minimal Tactical Route Strategy Cards */}
                <div className="space-y-2">
                  {m.resp?.routes.map((r) => {
                    const idx = m.foundRoutes.findIndex((x) => x.strategy === r.strategy);
                    const sel = idx === m.routeIdx && r.found;
                    const meta_ = STRATEGY[r.strategy];
                    return (
                      <button
                        key={r.strategy}
                        disabled={!r.found}
                        onClick={() => {
                          hudSound.playClick();
                          m.setRouteIdx(idx);
                        }}
                        className={`group w-full text-left rounded-xl border p-2.5 transition-all relative overflow-hidden cursor-pointer ${
                          sel
                            ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_15px_rgba(34,211,238,0.15)] ring-1 ring-cyan-400/40'
                            : 'border-white/10 bg-slate-900/40 hover:border-white/25 hover:bg-slate-900/60'
                        } ${!r.found ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {sel && (
                          <div className="absolute top-0 right-0 px-2 py-0.5 bg-cyan-500 text-slate-950 font-mono text-[8px] font-black uppercase tracking-wider rounded-bl">
                            ACTIVE
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ background: meta_.color, boxShadow: sel ? `0 0 8px ${meta_.color}` : 'none' }}
                          />
                          <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                            {meta_.label}
                          </span>
                        </div>

                        {r.found && r.distance_m != null ? (
                          <div className="mt-2 grid grid-cols-4 gap-1.5 font-mono text-center">
                            <div className="bg-slate-950/70 border border-white/5 rounded p-1">
                              <div className="text-[8px] text-white/40 uppercase">DIST</div>
                              <div className="text-xs font-bold text-cyan-200">
                                {r.distance_m >= 1000 ? `${(r.distance_m / 1000).toFixed(1)}k` : `${r.distance_m}`}m
                              </div>
                            </div>
                            <div className="bg-slate-950/70 border border-white/5 rounded p-1">
                              <div className="text-[8px] text-white/40 uppercase">ETA</div>
                              <div className="text-xs font-bold text-emerald-200">{Math.round(r.mission_time_min ?? 0)}m</div>
                            </div>
                            <div className="bg-slate-950/70 border border-white/5 rounded p-1">
                              <div className="text-[8px] text-white/40 uppercase">SLOPE</div>
                              <div className="text-xs font-bold text-amber-200">{r.max_slope_deg ?? 0}°</div>
                            </div>
                            <div className="bg-slate-950/70 border border-white/5 rounded p-1">
                              <div className="text-[8px] text-white/40 uppercase">CLIMB</div>
                              <div className="text-xs font-bold text-purple-200">+{Math.round(r.elev_gain_m ?? 0)}m</div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1 text-[10px] font-mono text-red-400">Route exceeds current slope limit</div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Life Support (O2) Progress Bars Gauge */}
                {m.route?.safety?.oxygen && (
                  <div className="rounded-xl border border-white/10 bg-slate-950/70 p-2.5 font-mono space-y-2">
                    <div className="flex items-center justify-between text-[10px] tracking-wider text-white/50">
                      <span className="flex items-center gap-1.5">
                        <Activity className="w-3 h-3 text-cyan-400" /> LIFE SUPPORT (O₂)
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded border font-bold ${
                          m.route.safety.oxygen.round_trip_ok
                            ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                            : 'border-red-500/40 text-red-400 bg-red-500/10'
                        }`}
                      >
                        {m.route.safety.oxygen.round_trip_ok ? 'NOMINAL' : 'RESERVE BREACH'}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-white/60">Arrival Reserve</span>
                          <span className={`font-bold ${m.route.safety.oxygen.one_way_ok ? 'text-cyan-300' : 'text-red-400'}`}>
                            {m.route.safety.oxygen.remaining_on_arrival_pct}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                          <div
                            className={`h-full transition-all ${
                              m.route.safety.oxygen.one_way_ok ? 'bg-cyan-400' : 'bg-red-500'
                            }`}
                            style={{
                              width: `${Math.max(0, Math.min(100, m.route.safety.oxygen.remaining_on_arrival_pct))}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-white/60">Return Reserve</span>
                          <span
                            className={`font-bold ${
                              m.route.safety.oxygen.round_trip_ok ? 'text-emerald-300' : 'text-red-400'
                            }`}
                          >
                            {m.route.safety.oxygen.remaining_after_return_pct}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                          <div
                            className={`h-full transition-all ${
                              m.route.safety.oxygen.round_trip_ok ? 'bg-emerald-400' : 'bg-red-500'
                            }`}
                            style={{
                              width: `${Math.max(0, Math.min(100, m.route.safety.oxygen.remaining_after_return_pct))}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Primary Action Button: START MISSION */}
                {m.route && (
                  <button
                    onClick={() => {
                      hudSound.playTargetLock();
                      onStartEva();
                    }}
                    className="group relative w-full overflow-hidden rounded-xl border border-emerald-400/60 bg-emerald-500/20 hover:bg-emerald-500/30 p-3 text-xs font-mono font-black tracking-widest text-emerald-200 transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.35)] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-emerald-400 text-emerald-400" />
                    <span>START MISSION</span>
                  </button>
                )}

                {m.route?.explanation && (
                  <button
                    onClick={() => {
                      hudSound.playClick();
                      setAnalysisOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-900/60 border border-white/15 hover:border-cyan-400/60 hover:bg-cyan-950/30 text-xs font-mono text-cyan-200 transition cursor-pointer"
                  >
                    <ClipboardList className="w-3.5 h-3.5 text-cyan-400" />
                    <span>ROUTE TELEMETRY &amp; ANALYSIS</span>
                  </button>
                )}

                {/* Minimal 1-line Slope / Caution indicator */}
                {m.route?.reasons && m.route.reasons.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-amber-300/80 bg-amber-950/20 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                    <TriangleAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{m.route.reasons[0]}</span>
                  </div>
                )}

                {/* Compact nearby science detours */}
                {!!m.resp?.nearby_science.length && (
                  <div className="rounded-xl border border-white/10 bg-slate-950/60 p-2.5 space-y-1.5">
                    <div className="text-[9px] font-mono text-white/50 uppercase tracking-wider">
                      Detours Near Route
                    </div>
                    <div className="space-y-1">
                      {m.resp.nearby_science.slice(0, 3).map((n) => (
                        <button
                          key={n.id}
                          onClick={() => {
                            hudSound.playClick();
                            selectSite(n.id);
                          }}
                          className="w-full flex items-center justify-between text-left rounded-lg border border-white/5 bg-slate-900/40 px-2 py-1.5 hover:border-cyan-400/40 transition cursor-pointer"
                        >
                          <span className="text-xs font-mono font-bold text-white/90 truncate">{n.name}</span>
                          {n.reachable ? (
                            <span className="text-[10px] font-mono text-cyan-300 shrink-0">
                              +{n.extra_distance_m}m
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono text-red-400 shrink-0">Blocked</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Compact Footnote */}
                <p className="text-[9px] font-mono text-white/30 text-center tracking-wide pt-1">
                  * Model assumptions: walk speed, slope limits and O₂ use.
                </p>
              </div>
            )}

            {tab === 'site' &&
              (site ? (
                <div className="space-y-3 font-mono">
                  <div className="border-b border-white/10 pb-2">
                    <div className="text-sm font-bold text-white">{site.name}</div>
                    <div className="text-[11px] text-amber-300">{site.goal}</div>
                  </div>
                  <p className="text-xs text-white/75 leading-relaxed font-sans">{site.description}</p>
                  {site.science_purpose && (
                    <div className="text-[11px]">
                      <span className="text-white/45">Scientific purpose: </span>
                      <span className="text-white/80">{site.science_purpose}</span>
                    </div>
                  )}
                  {site.geology && (
                    <div className="text-[11px]">
                      <span className="text-white/45">Formation: </span>
                      <span className="text-white/80">{site.geology}</span>
                    </div>
                  )}
                  <div className="text-[11px]">
                    <span className="text-white/45">Chemistry: </span>
                    {site.chemistry ?? <span className="font-mono text-red-300">MISSING</span>}
                  </div>
                  <dl className="text-[11px] space-y-1 bg-slate-900/50 p-2 rounded-lg border border-white/5">
                    <div className="flex justify-between gap-2">
                      <dt className="text-white/40">POSITION</dt>
                      <dd className="text-cyan-200">
                        {fmtLat(site.lat)} {fmtLon(site.lon)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-white/40">MISSION</dt>
                      <dd className="text-right text-white/80">{site.mission}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-white/40">OBSERVED</dt>
                      <dd className="text-white/80">{site.observed}</dd>
                    </div>
                  </dl>
                  {site.source_url && (
                    <a
                      href={site.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Source Provenance
                    </a>
                  )}
                  <div>
                    <div className="text-[10px] text-white/50 mb-1">ROVER POINT-OF-VIEW IMAGES</div>
                    {site.pov_images.length === 0 && (
                      <div className="text-[11px] text-white/45 border border-dashed border-white/15 rounded-lg p-2 text-center">
                        No verified rover photo taken at this site yet.
                      </div>
                    )}
                    {site.pov_images.map((p, i) => (
                      <figure key={i} className="mb-2">
                        <img
                          src={api.assetUrl(p.url)}
                          alt={`${site.name} rover view`}
                          className="w-full rounded-lg border border-white/10"
                        />
                        <figcaption className="text-[10px] text-white/50 mt-1 space-y-0.5">
                          <div>Taken: {p.earth_date} (Sol {p.sol})</div>
                          <div>Source: {p.rover} · {p.camera}</div>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      hudSound.playTargetLock();
                      m.setGoalId(site.id);
                      runPlan({ goalId: site.id });
                      setTab('route');
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-cyan-500/25 border border-cyan-400/60 text-xs font-mono font-bold text-cyan-200 hover:bg-cyan-500/40 transition shadow-[0_0_12px_rgba(34,211,238,0.2)] cursor-pointer"
                  >
                    SET AS ROUTE DESTINATION
                  </button>
                </div>
              ) : (
                <div className="text-xs text-white/50 font-mono text-center py-8">
                  Click a target marker on the map to inspect details.
                </div>
              ))}

            {tab === 'safety' && (
              <SafetyContextPanel
                oxygen={m.route?.safety?.oxygen}
                radiation={m.route?.safety?.radiation}
                weather={m.spaceWeather}
                suit={meta.suit_assumptions}
              />
            )}

            {tab === 'data' && (
              <div className="space-y-3 font-mono">
                <p className="text-[11px] text-white/60 leading-relaxed font-sans">
                  Every layer shows where it comes from, how sharp it is, and whether it is static or historical.
                </p>
                {meta.layers.map((l, i) => (
                  <div key={i} className="rounded-lg border border-white/10 p-2.5 space-y-1 bg-slate-900/40">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">{l.name}</span>
                      <Badge n={l.nature} />
                    </div>
                    <div className="text-[11px] text-white/60">
                      {l.mission} · {l.instrument}
                    </div>
                    <div className="text-[11px] text-white/60">
                      {l.product} · {l.resolution_m ? `${l.resolution_m} m/px` : 'res. n/a'} · {l.acquired}
                    </div>
                    <div className="text-[10px] text-amber-200/90">Limit: {l.limitation}</div>
                    {l.source_url && (
                      <a
                        href={l.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-cyan-300 hover:underline pt-0.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                        NASA Source
                      </a>
                    )}
                  </div>
                ))}
                {meta.crs && (
                  <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-2.5 text-[11px] space-y-1">
                    <div className="font-bold text-cyan-200">Coordinate system &amp; alignment</div>
                    <div className="text-white/65">{meta.crs.coordinates}</div>
                    <div className="text-white/65">{meta.crs.grid}</div>
                    <div className="text-white/65">{meta.crs.alignment}</div>
                    <div className="text-[10px] text-white/50">
                      Grid {meta.grid.width}×{meta.grid.height} · {meta.grid.cell_m} m/cell.
                    </div>
                  </div>
                )}
                {!meta.layer_urls.chemical && (
                  <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-2.5 text-[11px] text-red-200">
                    Chemical layer: MISSING for this region (not faked).
                  </div>
                )}
                <div className="rounded-lg border border-white/10 p-2.5 text-[11px] text-white/60 bg-slate-900/30">
                  Elevation {Math.round(meta.stats.elev_min_m)} … {Math.round(meta.stats.elev_max_m)} m · max slope{' '}
                  {meta.stats.slope_max_deg.toFixed(0)}° · no-data {meta.stats.nodata_pct}%
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {analysisOpen && m.route?.explanation && (
        <RouteAnalysisWindow
          route={m.route}
          strategyLabel={STRATEGY[m.route.strategy].label}
          insights={m.resp?.insights ?? []}
          onClose={() => setAnalysisOpen(false)}
        />
      )}
    </div>
  );
};
