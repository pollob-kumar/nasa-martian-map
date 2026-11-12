'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus, Maximize2 } from 'lucide-react';
import type { RegionMeta } from '../lib/missionTypes';
import { api } from '../lib/api';
import { fracToLatLon } from '../lib/geo';

export type LayerState = Record<string, { on: boolean; opacity: number }>;

interface Props {
  meta: RegionMeta;
  layerState: LayerState;
  cursor?: string;
  onPick: (p: { lat: number; lon: number; fx: number; fy: number; px: number; py: number }) => void;
  /** SVG overlay drawn in a 0..1000 (x) by 0..vbH (y) box. `s` = 1/zoom so markers keep their screen size. */
  overlay?: (s: number, vbH: number) => React.ReactNode;
  popup?: { px: number; py: number; node: React.ReactNode } | null;
  onViewChange?: () => void;
}

/** Pan / zoom viewer that loads only the map tiles on screen (fast for huge GeoTIFFs). Wheel = zoom, drag = move, click = pick. */
export const RasterMap: React.FC<Props> = ({ meta, layerState, cursor, onPick, overlay, popup, onViewChange }) => {
  const rm = meta.raster!;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  const W = rm.frame.width_m, H = rm.frame.height_m, maxDim = Math.max(W, H);
  const aspect = W / H;
  const baseW = Math.min(size.w, size.h * aspect), baseH = baseW / aspect;
  const baseMax = Math.max(baseW, baseH);
  const vbH = 1000 / aspect;

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(() => box.current && setSize({ w: box.current.clientWidth, h: box.current.clientHeight }));
    ro.observe(box.current);
    setSize({ w: box.current.clientWidth, h: box.current.clientHeight });
    return () => ro.disconnect();
  }, []);

  const clamp = useCallback((v: { k: number; tx: number; ty: number }) => {
    const k = Math.min(Math.max(v.k, 1), 2 ** (rm.frame.max_zoom + 1));
    const sw = baseW * k, sh = baseH * k;
    const tx = sw <= size.w ? (size.w - sw) / 2 : Math.min(0, Math.max(size.w - sw, v.tx));
    const ty = sh <= size.h ? (size.h - sh) / 2 : Math.min(0, Math.max(size.h - sh, v.ty));
    return { k, tx, ty };
  }, [size, baseW, baseH, rm.frame.max_zoom]);

  // centre the picture whenever the box size changes
  useEffect(() => { setView(clamp({ k: 1, tx: (size.w - baseW) / 2, ty: (size.h - baseH) / 2 })); }, [size.w, size.h, baseW, baseH]); // eslint-disable-line

  const zoomAt = (factor: number, cx: number, cy: number) => {
    setView((v) => {
      const k = Math.min(Math.max(v.k * factor, 1), 2 ** (rm.frame.max_zoom + 1));
      const f = k / v.k;
      return clamp({ k, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f });
    });
    onViewChange?.();
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }); // eslint-disable-line

  const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false }; };
  const onMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) { setView((v) => clamp({ ...v, tx: d.tx + dx, ty: d.ty + dy })); onViewChange?.(); }
  };
  const onUp = (e: React.MouseEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const fx = ((px - view.tx) / view.k) / baseW, fy = ((py - view.ty) / view.k) / baseH;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
    const { lat, lon } = fracToLatLon(meta, fx, fy);
    onPick({ lat, lon, fx, fy, px, py });
  };

  // ---- which tiles are on screen -------------------------------------------------
  const zoom = Math.min(rm.frame.max_zoom, Math.max(0, Math.ceil(Math.log2((baseMax * view.k) / rm.frame.tile_size))));
  const n = 2 ** zoom;
  const tilePx = baseMax / n;
  const tiles = useMemo(() => {
    const x0 = Math.max(0, Math.floor((-view.tx / view.k) / tilePx)), x1 = Math.min(n - 1, Math.floor(((size.w - view.tx) / view.k) / tilePx));
    const y0 = Math.max(0, Math.floor((-view.ty / view.k) / tilePx)), y1 = Math.min(n - 1, Math.floor(((size.h - view.ty) / view.k) / tilePx));
    const out: { x: number; y: number }[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x * tilePx < baseW && y * tilePx < baseH) out.push({ x, y });
    return out.slice(0, 120);
  }, [view, size, tilePx, n, baseW, baseH]);

  const active = rm.layers.filter((l) => layerState[l.key]?.on).sort((a, b) => a.z - b.z);
  const s = 1 / view.k;

  return (
    <div ref={box} className="relative w-full h-full overflow-hidden select-none bg-[#0b0608]" style={{ cursor: cursor ?? 'grab' }}
      onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { drag.current = null; }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: baseW, height: baseH, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.k})`, willChange: 'transform' }}>
        {active.map((l) => (
          <div key={l.key} className="absolute inset-0 overflow-hidden pointer-events-none"
            style={{ opacity: layerState[l.key].opacity, mixBlendMode: (l.blend as React.CSSProperties['mixBlendMode']) ?? 'normal' }}>
            {tiles.map((t) => (
              <img key={`${zoom}/${t.x}/${t.y}`} src={api.tileUrl(l.key, zoom, t.x, t.y)} alt="" draggable={false} decoding="async"
                className="absolute max-w-none" style={{ left: t.x * tilePx, top: t.y * tilePx, width: tilePx + 0.6, height: tilePx + 0.6 }} />
            ))}
          </div>
        ))}
        {overlay && (
          <svg viewBox={`0 0 1000 ${vbH}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            {overlay(s, vbH)}
          </svg>
        )}
      </div>

      {popup && <div className="absolute z-20" style={{ left: Math.min(popup.px + 12, size.w - 300), top: Math.min(Math.max(popup.py - 10, 8), size.h - 40) }} onMouseDown={(e) => e.stopPropagation()} onMouseUp={(e) => e.stopPropagation()}>{popup.node}</div>}

      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1" onMouseDown={(e) => e.stopPropagation()} onMouseUp={(e) => e.stopPropagation()}>
        {[{ i: <Plus className="w-4 h-4" />, f: () => zoomAt(1.6, size.w / 2, size.h / 2), t: 'Zoom in' }, { i: <Minus className="w-4 h-4" />, f: () => zoomAt(1 / 1.6, size.w / 2, size.h / 2), t: 'Zoom out' },
          { i: <Maximize2 className="w-4 h-4" />, f: () => setView(clamp({ k: 1, tx: (size.w - baseW) / 2, ty: (size.h - baseH) / 2 })), t: 'Fit' }].map((b) => (
          <button key={b.t} onClick={b.f} title={b.t} aria-label={b.t} className="p-2 rounded bg-slate-950/80 border border-white/20 hover:border-cyan-400/60">{b.i}</button>
        ))}
      </div>
      <div className="absolute left-3 bottom-3 z-10 pointer-events-none flex items-center gap-2 text-[10px] font-mono bg-black/70 rounded px-2 py-1">
        <span className="inline-block h-[3px] bg-white" style={{ width: Math.max(20, (Math.pow(10, Math.floor(Math.log10((maxDim / view.k) * 0.2))) / maxDim) * baseMax * view.k) }} />
        <span>{(() => { const m = Math.pow(10, Math.floor(Math.log10((maxDim / view.k) * 0.2))); return m >= 1000 ? `${m / 1000} km` : `${m} m`; })()} · N↑</span>
      </div>
    </div>
  );
};
