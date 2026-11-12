"use client";

import { useEffect, useMemo, useState } from "react";
import { Rocket, Layers, Play, Volume2, ShieldCheck, Activity, Eye } from "lucide-react";
import MarsHudLoader from "../components/MarsHudLoader";
import { api } from "../lib/api";
import type { RasterLayer, RegionSummary } from "../lib/missionTypes";
import { OriginBadge } from "../components/LayerToggleList";
import type { LayerState } from "../components/RasterMap";
import { hudSound } from "../utils/soundEffects";

const LAYER_STORE = "rednav.layers";

export default function Home() {
  const [regions, setRegions] = useState<RegionSummary[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [layers, setLayers] = useState<RasterLayer[] | null>(null);
  const [lay, setLay] = useState<LayerState>({});
  const [soundActive, setSoundActive] = useState(true);

  useEffect(() => {
    // Preload sounds
    void hudSound.loadAll();
    
    api.regions().then((r0) => {
      // Pick primary / Jezero raster region directly
      const primary = r0.find((x) => x.is_raster || x.id.includes("hirise") || x.role === "primary") ?? r0[0];
      setRegions(r0);
      setPicked(primary?.id ?? "jezero_hirise");
    }).catch(() => undefined);

    api.layers().then((l) => {
      setLayers(l.layers);
      let saved: LayerState | null = null;
      try { saved = JSON.parse(localStorage.getItem(LAYER_STORE) ?? "null"); } catch { /* ignore */ }
      // Default with orthomosaic + hazard + elevation active for great visual look
      const defaults: LayerState = Object.fromEntries(
        l.layers.map((x) => [x.key, { on: x.key === "orthomosaic" || x.key === "hazard" || x.key === "elevation", opacity: x.default_opacity }])
      );
      setLay(saved ?? defaults);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (Object.keys(lay).length) {
      try { localStorage.setItem(LAYER_STORE, JSON.stringify(lay)); } catch { /* ignore */ }
    }
  }, [lay]);

  const toggleLayer = (key: string) => {
    hudSound.playClick();
    setLay((prev) => ({
      ...prev,
      [key]: { ...prev[key], on: !prev[key]?.on }
    }));
  };

  const handleLaunch = () => {
    hudSound.playTargetLock();
    if (soundActive) {
      hudSound.enabled = true;
      hudSound.startMartianWind();
    }
    setStarted(true);
  };

  const activeLayers = useMemo(() => (layers ?? []).filter((l) => lay[l.key]?.on).sort((a, b) => a.z - b.z), [layers, lay]);
  const realCount = layers?.filter((l) => l.origin === "nasa").length ?? 0;

  if (started && picked) return <MarsHudLoader regionId={picked} />;

  return (
    <main className="relative min-h-screen w-full bg-[#050308] text-white flex flex-col justify-between overflow-x-hidden select-none">
      {/* Sci-Fi Grid Background & Ambient Red/Cyan Nebula */}
      <div className="pointer-events-none fixed inset-0 opacity-20"
        style={{ backgroundImage: "linear-gradient(to right, #ffffff12 1px, transparent 1px), linear-gradient(to bottom, #ffffff12 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      <div className="pointer-events-none fixed left-1/4 top-1/4 h-[450px] w-[600px] -translate-x-1/2 rounded-full bg-red-600/15 blur-[140px]" />
      <div className="pointer-events-none fixed right-1/4 bottom-1/4 h-[400px] w-[500px] rounded-full bg-cyan-600/10 blur-[130px]" />

      {/* Top Header Bar */}
      <header className="relative z-20 flex items-center justify-between border-b border-white/10 bg-black/60 px-6 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </div>
          <span className="font-mono text-xs font-black tracking-[0.35em] text-red-400">REDNAV-N399</span>
          <span className="rounded border border-red-500/30 bg-red-950/40 px-2 py-0.5 font-mono text-[9px] tracking-widest text-red-300">
            JEZERO MISSION
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>NASA SENSORS: {realCount}/{layers?.length ?? 7} ACTIVE</span>
          </div>
          <button
            onClick={() => {
              setSoundActive(!soundActive);
              hudSound.enabled = !soundActive;
              hudSound.playClick();
            }}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] transition ${
              soundActive ? "border-cyan-400/50 bg-cyan-950/40 text-cyan-300" : "border-white/15 bg-white/5 text-white/40"
            }`}
            title="NASA Audio telemetry"
          >
            <Volume2 className="h-3 w-3" />
            <span>SOUND: {soundActive ? "ON" : "MUTED"}</span>
          </button>
        </div>
      </header>

      {/* Main Interactive Stage */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 py-4 lg:px-8">
        <div className="grid items-center gap-6 lg:grid-cols-[1.25fr_1fr]">
          
          {/* Tactical Map Display (Featuring User's Jezero DTM Picture) */}
          <section className="relative overflow-hidden rounded-2xl border-2 border-red-500/30 bg-black shadow-[0_0_50px_rgba(239,68,68,0.18)]" aria-label="Jezero Tactical Map">
            {/* Corner HUD Brackets */}
            <div className="pointer-events-none absolute left-2 top-2 z-20 h-5 w-5 border-l-2 border-t-2 border-cyan-400" />
            <div className="pointer-events-none absolute right-2 top-2 z-20 h-5 w-5 border-r-2 border-t-2 border-cyan-400" />
            <div className="pointer-events-none absolute bottom-2 left-2 z-20 h-5 w-5 border-b-2 border-l-2 border-cyan-400" />
            <div className="pointer-events-none absolute bottom-2 right-2 z-20 h-5 w-5 border-b-2 border-r-2 border-cyan-400" />

            {/* Tactical Screen Box */}
            <div className="relative w-full overflow-hidden bg-slate-950" style={{ aspectRatio: "934 / 1024", maxHeight: "68vh" }}>
              {/* User Jezero DTM / DEM Heightmap Image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/jezero_user_map.jpg"
                alt="Jezero Crater NASA DTM Terrain Map"
                className="absolute inset-0 h-full w-full object-contain filter contrast-125"
              />

              {/* Active Sensor Layers Overlaid in Real-Time */}
              {activeLayers.map((l) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={l.key}
                  src={api.previewUrl(l.key, 1024)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-contain transition-opacity duration-300"
                  style={{
                    opacity: lay[l.key]?.opacity ?? l.default_opacity,
                    mixBlendMode: l.blend === "multiply" ? "multiply" : "screen"
                  }}
                />
              ))}

              {/* Sci-Fi Laser Scanline */}
              <div className="pointer-events-none absolute inset-x-0 h-[2px] bg-cyan-400 shadow-[0_0_15px_#22d3ee] animate-[scan_4s_linear_infinite]" />

              {/* Tactical Top Badges */}
              <div className="absolute left-4 top-4 flex items-center gap-2">
                <span className="rounded bg-black/80 px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-cyan-300 border border-cyan-500/30">
                  JEZERO CRATER · HiRISE
                </span>
                <span className="rounded bg-black/80 px-2 py-1 font-mono text-[9px] text-white/70 border border-white/20">
                  18.4447° N · 77.4508° E
                </span>
              </div>

              {/* Active Layer Pill Badges */}
              <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center gap-1.5">
                {activeLayers.length === 0 ? (
                  <span className="rounded bg-black/80 px-2.5 py-1 font-mono text-[10px] text-amber-300 border border-amber-500/30">
                    SELECT SENSORS ON THE RIGHT →
                  </span>
                ) : (
                  activeLayers.map((l) => (
                    <span
                      key={l.key}
                      className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/85 px-2.5 py-1 font-mono text-[10px] shadow-lg"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                      <span className="font-bold">{l.label}</span>
                      <OriginBadge o={l.origin} />
                    </span>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Right Game Control Dashboard */}
          <aside className="flex flex-col gap-4">
            
            {/* Step 1: Sensor Deck */}
            <div className="rounded-xl border border-white/15 bg-slate-950/70 p-4 backdrop-blur-md shadow-xl">
              <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-widest text-cyan-300">
                  <Layers className="h-4 w-4" />
                  <span>1. NASA SENSOR SUITE</span>
                </div>
                <span className="font-mono text-[10px] text-white/50">TOGGLE VISOR LAYERS</span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(layers ?? []).map((l) => {
                  const on = !!lay[l.key]?.on;
                  return (
                    <button
                      key={l.key}
                      onClick={() => toggleLayer(l.key)}
                      className={`flex items-center justify-between rounded-lg border p-2.5 text-left transition active:scale-[0.98] ${
                        on
                          ? "border-cyan-400/60 bg-cyan-950/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                          : "border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10 opacity-70"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${on ? "animate-pulse" : ""}`}
                          style={{ background: l.color }}
                        />
                        <div className="truncate">
                          <div className={`font-mono text-[11px] font-bold ${on ? "text-white" : "text-white/60"}`}>
                            {l.label}
                          </div>
                          <div className="font-mono text-[9px] text-white/40">{l.origin === "nasa" ? "NASA RAW" : "DERIVED"}</div>
                        </div>
                      </div>
                      <span
                        className={`ml-2 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                          on ? "bg-emerald-500/30 text-emerald-300 border border-emerald-400/40" : "bg-white/10 text-white/40"
                        }`}
                      >
                        {on ? "ON" : "OFF"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Target Sector Summary */}
            <div className="rounded-xl border border-white/15 bg-slate-950/70 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between font-mono text-xs font-bold tracking-widest text-white/80">
                <span className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-red-400" />
                  2. MISSION SECTOR
                </span>
                <span className="text-red-400">STATUS: READY</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-center">
                <div className="rounded border border-white/10 bg-black/40 p-2">
                  <div className="text-[9px] text-white/40">ZONE</div>
                  <div className="text-xs font-bold text-white">JEZERO</div>
                </div>
                <div className="rounded border border-white/10 bg-black/40 p-2">
                  <div className="text-[9px] text-white/40">RESOLUTION</div>
                  <div className="text-xs font-bold text-cyan-300">1.0 m/px</div>
                </div>
                <div className="rounded border border-white/10 bg-black/40 p-2">
                  <div className="text-[9px] text-white/40">AUDIO</div>
                  <div className="text-xs font-bold text-emerald-300">LIVE WIND</div>
                </div>
              </div>
            </div>

            {/* Step 3: Big Launch Game Button */}
            <button
              onClick={handleLaunch}
              className="group relative flex items-center justify-center gap-3 overflow-hidden rounded-xl border-2 border-red-400/80 bg-gradient-to-r from-red-600 to-red-500 py-4 font-mono text-base font-black tracking-[0.25em] text-white shadow-[0_0_35px_rgba(239,68,68,0.45)] transition hover:brightness-110 active:scale-95"
            >
              <span className="absolute inset-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100" />
              <Rocket className="h-5 w-5 animate-pulse text-white" />
              <span>3. INITIATE MARSWALK</span>
              <Play className="h-4 w-4 fill-current text-white/70" />
            </button>
            <div className="flex items-center justify-center gap-2 text-center font-mono text-[10px] text-white/40">
              <Eye className="h-3 w-3 text-cyan-400" />
              <span>ALL SELECTED LAYERS & LIVE NASA DATA STREAM DIRECTLY TO YOUR HELMET HUD</span>
            </div>
          </aside>
        </div>
      </div>

      {/* Footer Status */}
      <footer className="relative z-10 border-t border-white/10 bg-black/80 px-6 py-2.5 text-center font-mono text-[10px] text-white/35">
        NASA HiRISE · Mars Reconnaissance Orbiter (MRO) · Planetary Surface Navigation Engine
      </footer>

      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0.8; }
          50% { opacity: 1; }
          100% { top: 100%; opacity: 0.8; }
        }
      `}</style>
    </main>
  );
}
