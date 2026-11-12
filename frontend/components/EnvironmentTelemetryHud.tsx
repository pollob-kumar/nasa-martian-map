import React from 'react';
import { Mountain, TrendingUp, Timer, Wind, Footprints, Activity } from 'lucide-react';

export interface OxygenHud {
  remainingPct: number;   // from the route's oxygen model (assumption), not real suit telemetry
  reservePct: number;
  canReturn: boolean;     // could the crew still walk back to the start and keep the reserve?
}

interface Props {
  elevationM: number | null;
  slopeDeg: number | null;
  cautionSlope: number;
  maxSlope: number;
  distanceRemaining: number;
  etaMin: number;
  elapsedMin: number;
  oxygen: OxygenHud | null;
  nature?: string;
}

/** Top-right HUD (priority level 2 = "as needed"). Two groups, clearly separated:
 *  1) values from the elevation data along the route (elevation, slope)
 *  2) the suit MODEL: travel time and oxygen computed by the planner from stated assumptions (not live suit telemetry). */
export const EnvironmentTelemetryHud: React.FC<Props> = ({ elevationM, slopeDeg, cautionSlope, maxSlope, distanceRemaining, etaMin, elapsedMin, oxygen, nature = 'STATIC DEM' }) => {
  const slopeColor = slopeDeg == null ? 'text-white/60' : slopeDeg > maxSlope ? 'text-red-400' : slopeDeg > cautionSlope ? 'text-amber-300' : 'text-emerald-300';
  const o2Color = !oxygen ? 'text-white/60' : oxygen.remainingPct < oxygen.reservePct ? 'text-red-400' : !oxygen.canReturn ? 'text-amber-300' : 'text-cyan-300';
  return (
    <div id="hud-environment-telemetry" className="absolute top-20 right-8 z-30 w-60 flex flex-col space-y-2 pointer-events-auto select-none">
      <div className="rounded-xl bg-slate-950/50 backdrop-blur-lg border border-white/10 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono tracking-widest text-white/60">
          <span className="flex items-center gap-1.5"><Activity className="w-3 h-3 text-cyan-400" />TERRAIN HERE</span>
          <span className="px-1.5 rounded border border-white/15 text-[9px]">{nature}</span>
        </div>
        <Row icon={<Mountain className="w-4 h-4 text-cyan-300" />} label="ELEVATION" value={elevationM == null ? '—' : `${Math.round(elevationM)} m`} />
        <Row icon={<TrendingUp className="w-4 h-4 text-amber-300" />} label="SLOPE" value={slopeDeg == null ? '—' : `${slopeDeg.toFixed(1)}°`} valueClass={slopeColor} />
        <Row icon={<Timer className="w-4 h-4 text-emerald-300" />} label="TO GO" value={`${Math.round(distanceRemaining)} m · ${etaMin} min`} />
      </div>
      <div className="rounded-xl bg-slate-950/40 backdrop-blur-lg border border-dashed border-white/15 p-2.5 space-y-1.5">
        <div className="text-[10px] font-mono tracking-widest text-white/45">SUIT MODEL · ASSUMPTIONS</div>
        <Row icon={<Footprints className="w-4 h-4 text-emerald-300/80" />} label="TRAVEL TIME" value={`${Math.round(elapsedMin)} / ${Math.round(elapsedMin + etaMin)} min`} />
        <Row icon={<Wind className="w-4 h-4 text-cyan-300/80" />} label="OXYGEN" value={oxygen ? `${Math.round(oxygen.remainingPct)}%` : '—'} valueClass={o2Color} />
        {oxygen && (
          <div className="relative h-1.5 rounded bg-white/10 overflow-hidden" aria-label={`oxygen ${Math.round(oxygen.remainingPct)}% , reserve ${oxygen.reservePct}%`}>
            <div className={`h-full ${oxygen.remainingPct < oxygen.reservePct ? 'bg-red-500' : 'bg-cyan-400'}`} style={{ width: `${Math.max(0, Math.min(100, oxygen.remainingPct))}%` }} />
            <div className="absolute top-0 bottom-0 w-[2px] bg-amber-300" style={{ left: `${oxygen.reservePct}%` }} />
          </div>
        )}
        <p className="text-[9px] text-white/35 leading-snug">Computed from the route and stated assumptions (not live suit telemetry). Amber line = reserve.</p>
      </div>
    </div>
  );
};

const Row = ({ icon, label, value, valueClass = 'text-white' }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) => (
  <div className="flex items-center justify-between rounded-lg bg-slate-900/40 border border-white/5 px-2.5 py-1.5">
    <span className="flex items-center gap-2 text-[10px] font-mono text-white/55 tracking-wider">{icon}{label}</span>
    <span className={`text-sm font-mono font-bold ${valueClass}`}>{value}</span>
  </div>
);
