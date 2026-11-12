'use client';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info, Layers } from 'lucide-react';
import { HudMode, VisorTint } from '../types';
import { useMission } from '../lib/useMission';
import { buildNavRoute, buildObjects, pathState, positionAt, quantityAt, slopeAhead } from '../lib/sim';
import { offsetM } from '../lib/geo';
import { fmtLat, fmtLon } from '../lib/geo';
import { CompassTape } from './CompassTape';
import { EnvironmentTelemetryHud, type OxygenHud } from './EnvironmentTelemetryHud';
import { HudWarnings, type HudAlert } from './HudWarnings';
import { AstronautIntro } from './AstronautIntro';
import { TurnByTurnBanner } from './TurnByTurnBanner';
import { ArGroundPath } from './ArGroundPath';
import { ArDetectionOverlay } from './ArDetectionOverlay';
import { MiniMapRadar } from './MiniMapRadar';
import { BottomNavControls } from './BottomNavControls';
import { HelmetVisorOverlay } from './HelmetVisorOverlay';
import { Mars3dSurface, terrainHeight } from './Mars3dSurface';
import { LayeredMapModal } from './LayeredMapModal';
import { ToolsModal } from './ToolsModal';
import { InformationSidePanel } from './InformationSidePanel';
import { ProbeCard } from './ProbeCard';
import type { ProbeResult } from '../lib/missionTypes';
import { hudSound } from '../utils/soundEffects';
import { api } from '../lib/api';
import { useLiveProbe } from '../lib/useLiveProbe';
import { latLonToFrac } from '../lib/geo';
import { VisorDataPanel, LiveDataStrip, type VisorState } from './VisorDataPanel';
import { AstronautAssistant } from './AstronautAssistant';

/** HUD information priority (NASA brief: do not show everything at once).
 *  1 ESSENTIAL: current route, direction, urgent warnings.  2 STANDARD: + distance, destination, next turn, suit model, radar.
 *  3 DETAIL: + geological data, rover images and other science information (side panel). */
type HudLevel = 1 | 2 | 3;
const LEVEL_LABEL: Record<HudLevel, string> = { 1: 'ESSENTIAL', 2: 'STANDARD', 3: 'DETAIL' };

const SIM_SPEEDUP = 8; // the simulated walk runs 8x faster than real time so a demo fits in minutes

export default function App({ regionId = 'demo_synthetic' }: { regionId?: string }) {
  const mission = useMission(regionId);
  const { meta, sites, hazards, route, goal, options } = mission;

  const [activeMode, setActiveMode] = useState<HudMode>('MAP');
  const [visorTint, setVisorTint] = useState<VisorTint>('clear');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [viewMode, setViewMode] = useState<'eva' | 'astronaut'>('eva');
  const [nasaHudOn, setNasaHudOn] = useState(true);
  const [panOffset, setPanOffset] = useState(0);
  const [pitchOffset, setPitchOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef({ x: 0, y: 0, pan: 0, pitch: 0 });

  const [isWalking, setIsWalking] = useState(false);
  const [walked, setWalked] = useState(0);
  const [stepPhase, setStepPhase] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [isInformationOpen, setIsInformationOpen] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [hudLevel, setHudLevel] = useState<HudLevel>(2);
  const [probeSpot, setProbeSpot] = useState<{
    px: number;
    py: number;
    data: ProbeResult | null;
    loading: boolean;
  } | null>(null);
  const [probeTarget3d, setProbeTarget3d] = useState<{ worldX: number; worldZ: number } | null>(null);

  // ---- NASA data on the visor (each layer can be switched on/off) ----
  const raster = meta?.raster;
  const [visor, setVisor] = useState<VisorState>({ orthomosaic: true, hillshade: true, elevation: true, hirise_slope: true, secondary_slope: true, confidence: true, hazard: true, route: true, markers: true });
  useEffect(() => {
    void hudSound.loadAll();
    hudSound.enabled = true;
    hudSound.startMartianWind();
    const unlock = () => {
      hudSound.enabled = true;
      hudSound.startMartianWind();
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const ps = useMemo(() => pathState(route), [route]);
  const pos = useMemo(() => positionAt(route, ps, walked), [route, ps, walked]);
  const startPos = mission.start ?? null;
  const here = pos ?? (startPos ? { ...startPos, elev: NaN, slope: NaN, heading: 0 } : null);
  const navRoute = useMemo(() => buildNavRoute(route, ps, goal, walked), [route, ps, goal, walked]);
  const objects = useMemo(() => buildObjects(meta, sites, hazards, here), [meta, sites, hazards, here?.lat, here?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // new route => walk restarts at the start point
  useEffect(() => {
    setWalked(0);
    setIsWalking(false);
  }, [route]);

  const live = useLiveProbe(here ? { lat: here.lat, lon: here.lon } : null, !!raster);
  const shownObjects = useMemo(() => objects.filter((o) => visor.markers && (o.category !== 'HAZARD' || !raster || visor.hazard)), [objects, visor.markers, visor.hazard, raster]);
  const radarLayers = useMemo(() => !raster ? [] : [
    visor.orthomosaic && { url: api.previewUrl('orthomosaic', 1400), opacity: 0.9 },
    visor.hillshade && { url: api.previewUrl('hillshade', 1400), opacity: 0.5, blend: 'multiply' },
    visor.hazard && { url: api.previewUrl('hazard', 1400), opacity: 0.6 },
  ].filter(Boolean) as { url: string; opacity: number; blend?: string }[], [raster, visor.orthomosaic, visor.hillshade, visor.hazard]);
  const radarView = useMemo(() => {
    if (!raster || !meta || !here) return undefined;
    const f = latLonToFrac(meta, here.lat, here.lon);
    return { fx: f.fx, fy: f.fy, widthM: raster.frame.width_m, heightM: raster.frame.height_m };
  }, [raster, meta, here?.lat, here?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const baseHeading = here?.heading ?? 0;
  const heading = (baseHeading + panOffset + 360) % 360;
  const speed = (options?.walk_speed_ms ?? 0.8) / (options?.load_factor ?? 1);
  const distanceRemaining = Math.max(0, ps.total - walked);
  const etaMin = Math.round(distanceRemaining / Math.max(speed, 0.1) / 60);

  // ---- suit model values come from the planner (route.safety), not from invented telemetry ----
  const o2 = route?.safety?.oxygen ?? null;
  const o2UsedHere = quantityAt(route, ps, walked, 'o2_used_pct');
  const arrived = ps.total > 0 && walked >= ps.total - 0.5;
  const o2Remaining = o2 && o2UsedHere != null ? 100 - o2UsedHere - (arrived ? o2.stop_used_pct : 0) : null;
  const oxygenHud: OxygenHud | null = o2 && o2Remaining != null
    ? { remainingPct: o2Remaining, reservePct: o2.reserve_pct, canReturn: o2Remaining - (o2UsedHere ?? 0) >= o2.reserve_pct }
    : null;
  const elapsedMin = quantityAt(route, ps, walked, 't_min') ?? 0;

  const alerts: HudAlert[] = useMemo(() => {
    const out: HudAlert[] = [];
    if (!route) return out;
    if (oxygenHud) {
      if (oxygenHud.remainingPct < oxygenHud.reservePct) out.push({ id: 'o2-low', level: 'critical', text: `CRITICAL O₂: ${Math.round(oxygenHud.remainingPct)}% — Below ${oxygenHud.reservePct}% reserve. Return to base.` });
      else if (!oxygenHud.canReturn && !arrived) out.push({ id: 'o2-return', level: 'warning', text: `POINT OF NO RETURN: ${Math.round(oxygenHud.remainingPct)}% O₂ remaining. Cannot guarantee return.` });
    }
    if (raster && visor.hazard && live?.hazard === 'danger') out.push({ id: 'zone-danger', level: 'critical', text: 'DANGER ZONE: High hazard ground detected. Evacuate area.' });
    else if (raster && visor.hazard && live?.hazard === 'medium risk') out.push({ id: 'zone-medium', level: 'warning', text: 'CAUTION: Medium hazard ground. Reduce walking speed.' });
    const sa = raster && !visor.hirise_slope ? null : slopeAhead(route, ps, walked, 80);
    const caution = options?.caution_slope_deg ?? 12;
    if (sa && sa.slope > caution) out.push({ id: 'slope', level: 'warning', text: `STEEP SLOPE: ${sa.slope.toFixed(1)}° in ${Math.round(sa.atM)} m (below the slope limit in the data used).` });
    const hz = shownObjects.filter((o) => o.category === 'HAZARD' && o.distanceMeters <= 250).sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
    if (hz) out.push({ id: `hz-${hz.id}`, level: 'warning', text: `HAZARD MARKER: ${hz.title} (${hz.distanceMeters} m, bearing ${Math.round(hz.azimuthDeg)}°).` });
    if (here) {
      const near = (mission.resp?.nearby_science ?? []).filter((n) => n.reachable && n.lat != null && n.lon != null)
        .map((n) => ({ n, d: Math.hypot(...Object.values(offsetM(here.lat, here.lon, n.lat!, n.lon!))) })).filter((x) => x.d <= 500).sort((a, b) => a.d - b.d)[0];
      if (near && !arrived) out.push({ id: `sci-${near.n.id}`, level: 'info', text: `SCIENCE DETOUR: ${near.n.name} (${Math.round(near.d)} m away, +${near.n.extra_time_min} min).` });
    }
    if (arrived) out.push({ id: 'arrived', level: 'info', text: `DESTINATION REACHED: ${goal?.name ?? 'Science Site'}. Open SITES for rover data.` });
    return out;
  }, [route, ps, walked, oxygenHud?.remainingPct, oxygenHud?.canReturn, shownObjects, live?.hazard, visor.hazard, visor.hirise_slope, options?.caution_slope_deg, options?.max_slope_deg, arrived, mission.resp, goal, here?.lat, here?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // level 3 = science detail panel open, level 1 = nothing but essentials
  useEffect(() => {
    if (hudLevel === 3) setIsInformationOpen(true);
    if (hudLevel === 1) setIsInformationOpen(false);
  }, [hudLevel]);

  // walk loop with authentic NASA regolith footstep sounds
  useEffect(() => {
    if (!isWalking) return;
    let id: number;
    let last = performance.now();
    let phase = stepPhase;
    let lastSign = Math.sin(phase) > 0;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      phase = (phase + (2 * Math.PI / 1.25) * dt) % (2 * Math.PI);
      const sign = Math.sin(phase) > 0;
      if (sign !== lastSign) {
        lastSign = sign;
        hudSound.playFootstep(sign ? 'left' : 'right');
        if (Math.random() < 0.3) hudSound.playSuitMovement();
      }
      setStepPhase(phase);
      setElapsed((e) => e + dt * SIM_SPEEDUP);
      setWalked((w) => {
        const nw = Math.min(ps.total, w + speed * SIM_SPEEDUP * dt);
        if (nw >= ps.total) setIsWalking(false);
        return nw;
      });
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [isWalking, speed, ps.total]); // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (activeMode !== 'NAVIGATION') {
        if (e.key === 'Escape') setActiveMode('NAVIGATION');
        return;
      }
      const k = e.key.toLowerCase();
      if (k === '1' || k === '2' || k === '3') setHudLevel(Number(k) as HudLevel);
      else if (k === 'arrowleft' || k === 'a') setPanOffset((p) => Math.max(-50, p - 3));
      else if (k === 'arrowright' || k === 'd') setPanOffset((p) => Math.min(50, p + 3));
      else if (k === 'arrowup' || k === 'w') setPitchOffset((p) => Math.min(16, p + 2));
      else if (k === 'arrowdown' || k === 's') setPitchOffset((p) => Math.max(-16, p - 2));
      else if (k === ' ') { e.preventDefault(); if (route) setIsWalking((w) => !w); }
      else if (k === 'm') setActiveMode('MAP');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeMode, route]);

  useEffect(() => {
    hudSound.enabled = soundEnabled;
    if (soundEnabled) hudSound.startMartianWind(); else hudSound.stopMartianWind();
    return () => hudSound.stopMartianWind();
  }, [soundEnabled]);

  const onDown = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('button') || t.closest('a') || t.closest('input') || t.closest('select')) return;
    setIsDragging(true);
    drag.current = { x: e.clientX, y: e.clientY, pan: panOffset, pitch: pitchOffset };
  };
  const onMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset(Math.max(-50, Math.min(50, drag.current.pan + (e.clientX - drag.current.x) * 0.12)));
    setPitchOffset(Math.max(-16, Math.min(16, drag.current.pitch - (e.clientY - drag.current.y) * 0.1)));
  };

  const setTarget = (obj: { id: string }) => {
    setSelectedObjectId(obj.id);
    mission.setGoalId(obj.id);
    if (here) mission.setStart({ lat: here.lat, lon: here.lon });
    void mission.plan({ goalId: obj.id, start: here ? { lat: here.lat, lon: here.lon } : undefined });
    setActiveMode('NAVIGATION');
    hudSound.playTargetLock();
  };

  const handlePickTerrain = useCallback(async (hit: { worldX: number; worldZ: number; px: number; py: number }) => {
    setProbeTarget3d({ worldX: hit.worldX, worldZ: hit.worldZ });
    setProbeSpot({ px: hit.px, py: hit.py, data: null, loading: true });
    hudSound.playTargetLock();

    const astX = -(walked * 0.14);
    const astZ = -walked;
    const deltaX = hit.worldX - astX;
    const deltaZ = hit.worldZ - astZ;

    const theta = ((here?.heading ?? 0) * Math.PI) / 180;
    const dForward = -deltaZ;
    const dRight = deltaX;
    const dEast = dRight * Math.cos(theta) + dForward * Math.sin(theta);
    const dNorth = -dRight * Math.sin(theta) + dForward * Math.cos(theta);

    const R_mars = 3396190;
    const baseLat = here?.lat ?? meta?.center?.lat ?? 18.4447;
    const baseLon = here?.lon ?? meta?.center?.lon ?? 77.4508;

    const targetLat = baseLat + (dNorth / R_mars) * (180 / Math.PI);
    const targetLon = baseLon + (dEast / (R_mars * Math.cos((baseLat * Math.PI) / 180))) * (180 / Math.PI);

    try {
      const res = await api.probe(targetLat, targetLon);
      setProbeSpot({ px: hit.px, py: hit.py, data: res, loading: false });
    } catch {
      setProbeSpot({
        px: hit.px,
        py: hit.py,
        loading: false,
        data: {
          lat: targetLat,
          lon: targetLon,
          inside: true,
          summary: 'Mars Surface Target Probed',
          hazard: 'nominal',
          trust: 'nominal',
          elevation_m: Math.round(terrainHeight(hit.worldX, hit.worldZ) - 2500),
          slope_main_deg: 4.2,
          slope_check_deg: 4.0,
          layers: [],
        },
      });
    }
  }, [walked, here, meta]);

  const coords = here ? { lat: fmtLat(here.lat), lng: fmtLon(here.lon), elevation: Number.isFinite(here.elev) ? `${Math.round(here.elev)} m` : '—' } : { lat: '—', lng: '—', elevation: '—' };
  const nextWp = navRoute.waypoints[navRoute.currentStepIndex];

  return (
    <div id="mars-eva-hud-container" className="relative w-screen h-screen overflow-hidden bg-black select-none cursor-grab active:cursor-grabbing font-sans"
      onMouseDown={onDown} onMouseMove={onMove} onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)}>
      <Mars3dSurface isWalking={isWalking} walkDistance={walked} stepPhase={stepPhase} pitchOffset={pitchOffset} panOffset={panOffset}
        headingDeg={heading} visorTint={visorTint} viewMode={viewMode} timeOfSol="noon" showTopoGrid={nasaHudOn && (!!visor.elevation || !!visor.secondary_slope)} isTourPlaying={false}
        dustDevilsActive onAltitudeChange={() => {}} zoomLevel={1}
        nasaDataMode={nasaHudOn}
        onPickTerrain={handlePickTerrain}
        probeTarget={probeTarget3d}
      />

      {route && visor.route && activeMode === 'NAVIGATION' && (
        <ArGroundPath route={navRoute} speedMs={speed} distanceRemaining={distanceRemaining} panOffset={panOffset} pitchOffset={pitchOffset} isWalking={isWalking} walkDistance={walked} />
      )}
      <ArDetectionOverlay objects={shownObjects} headingDeg={heading} pitchDeg={pitchOffset} selectedObjectId={selectedObjectId}
        onSelectObject={(o) => setSelectedObjectId(o.id)} onSetNavigationTarget={setTarget}
        onOpenInformation={(o) => { setSelectedObjectId(o.id); setIsInformationOpen(true); }} />

      <div className="absolute top-0 inset-x-0 z-30 pointer-events-none">
        <CompassTape headingDeg={heading} targetBearingDeg={nextWp?.bearing ?? heading} destinationName={navRoute.destinationName} coordinates={coords} />
      </div>

      {nasaHudOn && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-2 px-3 py-0.5 rounded-full bg-slate-950/70 border border-cyan-400/40 backdrop-blur-md">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-mono text-[9px] font-bold tracking-wider text-cyan-200">
            JEZERO CRATER · NASA HiRISE
          </span>
        </div>
      )}

      {probeSpot && (
        <div
          data-interactive="true"
          className="absolute z-50 pointer-events-auto"
          style={{
            left: `${Math.min(typeof window !== 'undefined' ? window.innerWidth - 320 : 600, Math.max(20, probeSpot.px - 140))}px`,
            top: `${Math.min(typeof window !== 'undefined' ? window.innerHeight - 380 : 500, Math.max(70, probeSpot.py - 140))}px`,
          }}
        >
          <ProbeCard
            data={probeSpot.data}
            loading={probeSpot.loading}
            onClose={() => {
              setProbeSpot(null);
              setProbeTarget3d(null);
            }}
          />
        </div>
      )}

      {route && activeMode === 'NAVIGATION' && <TurnByTurnBanner route={navRoute} distanceRemaining={distanceRemaining} speedMs={speed} onOpenMap={() => setActiveMode('MAP')} />}

      <HudWarnings alerts={alerts} />
      {raster && nasaHudOn && hudLevel >= 2 && <LiveDataStrip live={live} state={visor} layers={raster.layers} />}

      {hudLevel >= 2 && (
        <EnvironmentTelemetryHud
          elevationM={raster ? (visor.elevation ? (live?.elevation_m ?? (here && Number.isFinite(here.elev) ? here.elev : null)) : null) : here && Number.isFinite(here.elev) ? here.elev : null}
          slopeDeg={raster ? (visor.hirise_slope ? (live?.slope_main_deg ?? (here && Number.isFinite(here.slope) ? here.slope : null)) : visor.secondary_slope ? (live?.slope_check_deg ?? null) : null) : here && Number.isFinite(here.slope) ? here.slope : null}
          cautionSlope={options?.caution_slope_deg ?? 12} maxSlope={options?.max_slope_deg ?? 20}
          distanceRemaining={distanceRemaining} etaMin={etaMin} elapsedMin={elapsedMin} oxygen={oxygenHud} />
      )}
      {hudLevel === 1 && oxygenHud && (
        <div className="absolute top-20 right-8 z-30 px-3 py-1.5 rounded-full bg-slate-950/70 border border-white/15 text-[11px] font-mono pointer-events-none">
          O₂ <span className={oxygenHud.remainingPct < oxygenHud.reservePct ? 'text-red-400 font-bold' : 'text-cyan-300'}>{Math.round(oxygenHud.remainingPct)}%</span> · {Math.round(distanceRemaining)} m
        </div>
      )}

      {hudLevel >= 2 && <MiniMapRadar headingDeg={heading} route={navRoute} objects={shownObjects} bgLayers={radarLayers} bgView={radarView} distanceRemaining={distanceRemaining} walkDistance={walked}
        isWalking={isWalking} onExpandMap={() => setActiveMode('MAP')} onSelectObject={(o) => setSelectedObjectId(o.id)} />}

      <div className="absolute bottom-20 left-8 z-30 pointer-events-none">
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-950/70 backdrop-blur-md border border-cyan-500/20 text-[11px] font-mono text-white/80">
          <span className={`w-2 h-2 rounded-full ${isWalking ? 'bg-emerald-400 animate-ping' : 'bg-cyan-400 animate-pulse'}`} />
          <span>{!route ? 'NO ROUTE' : isWalking ? `TRAVERSE · ${Math.round(walked)}/${Math.round(ps.total)} m` : 'SPACE: WALK · DRAG: LOOK'}</span>
        </div>
      </div>
      <div className="absolute bottom-20 right-8 z-30 flex items-center gap-1 rounded-full bg-slate-950/70 backdrop-blur-md border border-white/15 p-1 pointer-events-auto" role="group" aria-label="HUD information level">
        <span className="pl-2 pr-1 text-[9px] font-mono tracking-widest text-white/45">HUD</span>
        {([1, 2, 3] as HudLevel[]).map((l) => (
          <button key={l} onClick={() => { hudSound.playClick(); setHudLevel(l); }} aria-pressed={hudLevel === l} title={`Key ${l}`}
            className={`px-2.5 py-1 rounded-full text-[10px] font-mono tracking-wider ${hudLevel === l ? 'bg-cyan-500/30 text-cyan-100 border border-cyan-400/60' : 'text-white/55 hover:text-white'}`}>{l} {LEVEL_LABEL[l]}</button>
        ))}
      </div>
      {meta?.synthetic && <div className="absolute bottom-[88px] left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded bg-red-600/85 text-[11px] font-mono tracking-widest pointer-events-none">SYNTHETIC DEMO DATA — NOT NASA DATA</div>}

      <HelmetVisorOverlay tint={visorTint} panOffset={panOffset} pitchOffset={pitchOffset} isWalking={isWalking} viewMode={viewMode} />

      <BottomNavControls activeMode={activeMode} onModeChange={setActiveMode} isWalking={isWalking}
        onToggleWalking={() => route && setIsWalking(!isWalking)} onResetView={() => { setPanOffset(0); setPitchOffset(0); }}
        isInformationOpen={isInformationOpen} onToggleInformation={() => setIsInformationOpen(!isInformationOpen)} informationCount={objects.length}
        viewMode={viewMode} onToggleViewMode={() => setViewMode((v) => (v === 'eva' ? 'astronaut' : 'eva'))}
        nasaHudOn={nasaHudOn} onToggleNasaHud={() => setNasaHudOn((on) => !on)} />

      {hudLevel >= 2 && !isInformationOpen && (
        <div className="absolute left-5 bottom-32 z-30 pointer-events-auto">
          <button onClick={() => { hudSound.playClick(); setIsInformationOpen(true); }}
            className="flex items-center space-x-2 px-3 py-2 rounded-full bg-slate-950/75 hover:bg-slate-900 backdrop-blur-xl border border-cyan-500/35 hover:border-cyan-400/70 text-white transition-all active:scale-95" title="Sites and hazards seen from your position">
            <Info className="w-3.5 h-3.5 text-cyan-300" />
            <span className="font-mono text-[11px] font-bold text-cyan-200 tracking-wider">SITES & HAZARDS</span>
            <span className="px-1.5 rounded-full text-[9px] font-mono font-bold bg-cyan-400/20 text-cyan-300 border border-cyan-400/30">{objects.length}</span>
          </button>
        </div>
      )}

      {raster && (
        <VisorDataPanel
          layers={raster.layers}
          state={visor}
          onChange={setVisor}
          onClick={() => hudSound.playClick()}
          active={nasaHudOn}
          onToggleActive={() => setNasaHudOn(!nasaHudOn)}
        />
      )}
      <AstronautAssistant onClick={() => hudSound.playClick()} context={{
        lat: here?.lat, lon: here?.lon, heading: Math.round(heading),
        oxygen_pct: oxygenHud ? Math.round(oxygenHud.remainingPct) : undefined, oxygen_reserve_pct: oxygenHud?.reservePct,
        distance_remaining_m: route ? Math.round(distanceRemaining) : undefined, eta_min: route ? etaMin : undefined,
        goal: route ? goal?.name : undefined, goal_why: goal?.science_purpose ?? goal?.goal,
        next_hazard: shownObjects.filter((o) => o.category === 'HAZARD').sort((a, b) => a.distanceMeters - b.distanceMeters).map((o) => `${o.title} ${o.distanceMeters} m`)[0],
        visible_layers: raster ? Object.keys(visor).filter((k) => visor[k]) : undefined,
      }} />
      <InformationSidePanel isOpen={isInformationOpen} onClose={() => setIsInformationOpen(false)} objects={objects} selectedObjectId={selectedObjectId}
        onSelectObject={(o) => setSelectedObjectId(o.id)} onSetNavigationTarget={(o) => { setTarget(o); setIsInformationOpen(false); }} />

      <LayeredMapModal isOpen={activeMode === 'MAP'} onClose={() => setActiveMode('NAVIGATION')} mission={mission}
        astronaut={isWalking || walked > 0 ? (here ? { lat: here.lat, lon: here.lon } : null) : null}
        onStartEva={() => { setActiveMode('NAVIGATION'); setWalked(0); }} />
      {!introDone && <AstronautIntro onDone={() => setIntroDone(true)} regionName={meta?.name} />}
      <ToolsModal isOpen={activeMode === 'TOOLS'} onClose={() => setActiveMode('NAVIGATION')} visorTint={visorTint} onChangeVisorTint={setVisorTint}
        soundEnabled={soundEnabled} onToggleSound={() => setSoundEnabled(!soundEnabled)} />
    </div>
  );
}
