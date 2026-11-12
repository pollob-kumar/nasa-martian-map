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
  const distStr = distanceRemaining >= 1000 ? `${(distanceRemaining / 1000).toFixed(1)} km` : `${Math.round(distanceRemaining)} m`;

  return (
    <div id="hud-environment-telemetry" className="absolute top-20 right-8 z-30 w-52 flex flex-col space-y-1.5 pointer-events-auto select-none scale-95 origin-top-right">
      <div className="rounded-xl bg-slate-950/65 backdrop-blur-md border border-white/10 p-2 space-y-1 shadow-lg">
        <div className="flex items-center justify-between text-[9px] font-mono tracking-wider text-white/50 px-1">
          <span className="flex items-center gap-1 text-cyan-400 font-bold"><Activity className="w-2.5 h-2.5" />TELEMETRY</span>
          <span className="text-[8px] text-white/40">{nature}</span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <CompactCell icon={<Mountain className="w-3 h-3 text-cyan-300" />} label="ELEV" value={elevationM == null ? '—' : `${Math.round(elevationM)}m`} />
          <CompactCell icon={<TrendingUp className="w-3 h-3 text-amber-300" />} label="SLOPE" value={slopeDeg == null ? '—' : `${slopeDeg.toFixed(1)}°`} valueClass={slopeColor} />
          <CompactCell icon={<Timer className="w-3 h-3 text-emerald-300" />} label="TO GO" value={distStr} />
          <CompactCell icon={<Footprints className="w-3 h-3 text-emerald-300/80" />} label="ETA" value={`${etaMin}m`} />
        </div>
        {oxygen && (
          <div className="rounded bg-slate-900/40 border border-white/5 px-2 py-1 space-y-1">
            <div className="flex items-center justify-between text-[9px] font-mono">
              <span className="flex items-center gap-1 text-white/50"><Wind className="w-2.5 h-2.5 text-cyan-300" />OXYGEN</span>
              <span className={`font-bold ${o2Color}`}>{Math.round(oxygen.remainingPct)}%</span>
            </div>
            <div className="relative h-1 rounded bg-white/10 overflow-hidden" aria-label={`oxygen ${Math.round(oxygen.remainingPct)}%`}>
              <div className={`h-full ${oxygen.remainingPct < oxygen.reservePct ? 'bg-red-500' : 'bg-cyan-400'}`} style={{ width: `${Math.max(0, Math.min(100, oxygen.remainingPct))}%` }} />
              <div className="absolute top-0 bottom-0 w-[2px] bg-amber-300" style={{ left: `${oxygen.reservePct}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const CompactCell = ({ icon, label, value, valueClass = 'text-white' }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) => (
  <div className="flex items-center justify-between rounded bg-slate-900/40 border border-white/5 px-2 py-1">
    <span className="flex items-center gap-1 text-[9px] font-mono text-white/50">{icon}{label}</span>
    <span className={`text-xs font-mono font-bold ${valueClass}`}>{value}</span>
  </div>
);
