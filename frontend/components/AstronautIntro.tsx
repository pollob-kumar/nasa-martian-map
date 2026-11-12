'use client';

import React, { useEffect, useState } from 'react';
import { hudSound } from '../utils/soundEffects';

/** Cinematic opening sequence:
 *  Displays the photorealistic astronaut on Mars ("visor.jpg"),
 *  then smoothly zooms directly into the helmet visor until entering the HUD.
 *  Skippable on click / any key.
 */
export const AstronautIntro: React.FC<{ onDone: () => void; regionName?: string }> = ({ onDone, regionName }) => {
  const [phase, setPhase] = useState<0 | 1 | 2>(0); // 0 = view astronaut, 1 = zoom into visor, 2 = transition into HUD

  useEffect(() => {
    // Play subtle suit movement and audio chime
    try {
      hudSound.enabled = true;
      hudSound.playSuitMovement();
    } catch {
      // Audio autoplay policy fallback
    }

    const t1 = setTimeout(() => {
      setPhase(1);
      try { hudSound.playTargetLock(); } catch {}
    }, 1800);

    const t2 = setTimeout(() => {
      setPhase(2);
      try { hudSound.playClick(); } catch {}
    }, 4200);

    const t3 = setTimeout(onDone, 5100);

    const skip = () => onDone();
    window.addEventListener('keydown', skip);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('keydown', skip);
    };
  }, [onDone]);

  // Transform-origin is centered on the astronaut's golden reflective visor (X: 50%, Y: 36%)
  const scale = phase === 0 ? 1 : 12;

  return (
    <div
      onClick={onDone}
      className={`fixed inset-0 z-[100] overflow-hidden bg-black select-none cursor-pointer transition-opacity duration-1000 ${
        phase === 2 ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      role="img"
      aria-label="Astronaut on Mars visor zoom into helmet HUD"
    >
      {/* Background Mars Atmosphere Haze */}
      <div className="absolute inset-0 bg-[#160603]" />

      {/* Photorealistic Astronaut Image with Cinematic Visor Zoom */}
      <div
        className="absolute inset-0 flex items-center justify-center transition-transform ease-in-out duration-[2400ms]"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: '50% 36%',
          willChange: 'transform',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/astronaut_visor_intro.jpg"
          alt="Astronaut on Mars with reflective golden visor"
          className="h-full w-full object-cover filter contrast-110 brightness-105"
        />

        {/* Visor Entry Lens Glow / Flare Effect */}
        <div
          className={`pointer-events-none absolute inset-0 bg-radial from-amber-400/40 via-red-600/20 to-transparent transition-opacity duration-1000 ${
            phase >= 1 ? 'opacity-90' : 'opacity-0'
          }`}
        />
      </div>

      {/* HUD Reticles & Boot Telemetry Overlay */}
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-between p-8">
        {/* Top Boot Header */}
        <div className="flex items-center gap-3 rounded-full border border-cyan-400/30 bg-black/75 px-4 py-1.5 backdrop-blur-md">
          <span className="h-2 w-2 animate-ping rounded-full bg-cyan-400" />
          <span className="font-mono text-xs font-bold tracking-[0.25em] text-cyan-200">
            NASA EVA SUIT HUD · INITIALIZING
          </span>
        </div>

        {/* Center Visor Reticle Target (Active during zoom) */}
        <div
          className={`transition-opacity duration-700 flex flex-col items-center gap-2 ${
            phase === 1 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="relative h-28 w-28 rounded-full border border-cyan-400/60 shadow-[0_0_25px_rgba(6,182,212,0.6)] animate-pulse flex items-center justify-center">
            <div className="h-14 w-14 rounded-full border border-dashed border-cyan-300 animate-spin" />
            <div className="absolute h-1 w-6 bg-cyan-400" />
            <div className="absolute h-6 w-1 bg-cyan-400" />
          </div>
          <div className="font-mono text-[11px] font-bold tracking-widest text-cyan-300 bg-black/80 px-3 py-1 rounded border border-cyan-400/40">
            CONNECTING VISOR OPTICS...
          </div>
        </div>

        {/* Bottom Subtitle / Prompt */}
        <div
          className={`text-center font-mono tracking-widest transition-opacity duration-700 ${
            phase === 0 ? 'opacity-100' : 'opacity-30'
          }`}
        >
          <div className="text-sm font-bold text-white drop-shadow-md">
            {regionName ?? 'JEZERO CRATER · MARS'}
          </div>
          <div className="text-[10px] text-cyan-300 mt-1">
            PRESS ANY KEY OR CLICK TO SKIP INTO VISOR
          </div>
        </div>
      </div>
    </div>
  );
};
