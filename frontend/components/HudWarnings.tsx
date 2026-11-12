import React from 'react';
import { TriangleAlert, Info, Flag } from 'lucide-react';

export interface HudAlert {
  id: string;
  level: 'critical' | 'warning' | 'info';
  text: string;
}

/** Priority level 1 element: the most urgent warnings only (max 2 shown), centred under the compass. */
export const HudWarnings: React.FC<{ alerts: HudAlert[] }> = ({ alerts }) => {
  if (alerts.length === 0) return null;
  const order = { critical: 0, warning: 1, info: 2 } as const;
  const top = [...alerts].sort((a, b) => order[a.level] - order[b.level]).slice(0, 2);
  return (
    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 w-[min(34rem,60vw)] space-y-1.5 pointer-events-none" role="alert" aria-live="assertive">
      {top.map((a) => (
        <div key={a.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-mono backdrop-blur-md ${a.level === 'critical' ? 'bg-red-950/80 border-red-400/70 text-red-100 animate-pulse' : a.level === 'warning' ? 'bg-amber-950/75 border-amber-400/60 text-amber-100' : 'bg-cyan-950/70 border-cyan-400/40 text-cyan-100'}`}>
          {a.level === 'info' ? (a.id === 'arrived' ? <Flag className="w-4 h-4 shrink-0" /> : <Info className="w-4 h-4 shrink-0" />) : <TriangleAlert className="w-4 h-4 shrink-0" />}
          <span>{a.text}</span>
        </div>
      ))}
    </div>
  );
};
