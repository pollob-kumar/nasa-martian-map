'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { ProbeResult } from './missionTypes';
import { offsetM } from './geo';

/** Real terrain values under the astronaut (elevation, both slopes, hazard, trust) from the GeoTIFF layers.
 *  Re-reads only after the position moved > 8 m, at most every 1.2 s. */
export function useLiveProbe(pos: { lat: number; lon: number } | null, enabled: boolean): ProbeResult | null {
  const [data, setData] = useState<ProbeResult | null>(null);
  const last = useRef<{ lat: number; lon: number; t: number } | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    if (!enabled || !pos) return;
    const l = last.current;
    const now = Date.now();
    if (l) {
      const { dx, dy } = offsetM(l.lat, l.lon, pos.lat, pos.lon);
      if (Math.hypot(dx, dy) < 8 || now - l.t < 1200) return;
    }
    if (busy.current) return;
    busy.current = true;
    last.current = { lat: pos.lat, lon: pos.lon, t: now };
    api.probe(pos.lat, pos.lon).then(setData).catch(() => undefined).finally(() => { busy.current = false; });
  }, [pos?.lat, pos?.lon, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return enabled ? data : null;
}
