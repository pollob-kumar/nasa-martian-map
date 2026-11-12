import React from 'react';
import {
  Map,
  Navigation,
  Wrench,
  Footprints,
  RotateCcw,
  Info,
} from 'lucide-react';
import { HudMode } from '../types';
import { hudSound } from '../utils/soundEffects';

interface BottomNavControlsProps {
  activeMode: HudMode;
  onModeChange: (mode: HudMode) => void;
  isWalking: boolean;
  onToggleWalking: () => void;
  onResetView: () => void;
  isInformationOpen?: boolean;
  onToggleInformation?: () => void;
  informationCount?: number;
  viewMode?: 'eva' | 'astronaut';
  onToggleViewMode?: () => void;
  nasaHudOn?: boolean;
  onToggleNasaHud?: () => void;
}

export const BottomNavControls: React.FC<BottomNavControlsProps> = ({
  activeMode,
  onModeChange,
  isWalking,
  onToggleWalking,
  onResetView,
  isInformationOpen = false,
  onToggleInformation,
  informationCount = 0,
  viewMode = 'eva',
  onToggleViewMode,
  nasaHudOn = true,
  onToggleNasaHud,
}) => {
  const navItems: { mode: HudMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'MAP', label: 'MAP & ROUTE', icon: <Map className="w-4 h-4" /> },
    {
      mode: 'NAVIGATION',
      label: 'NAVIGATION',
      icon: <Navigation className="w-4 h-4" />,
    },
    { mode: 'TOOLS', label: 'TOOLS', icon: <Wrench className="w-4 h-4" /> },
  ];

  return (
    <div
      id="hud-bottom-navigation-dock"
      className="absolute bottom-5 inset-x-0 z-40 flex items-center justify-center pointer-events-auto select-none px-4"
    >
      <div className="flex items-center space-x-3">
        {/* Reset View Button */}
        <button
          onClick={() => {
            hudSound.playClick();
            onResetView();
          }}
          className="p-2.5 rounded-full bg-slate-950/60 backdrop-blur-xl border border-white/10 hover:border-cyan-400/40 text-slate-300 hover:text-white transition-all shadow-lg active:scale-95"
          title="Center Helmet View (Reset Pan)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Apple-like Glass Floating Dock */}
        <nav
          className="flex items-center p-1.5 rounded-full bg-slate-950/70 backdrop-blur-2xl border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
          aria-label="Helmet HUD Navigation"
        >
          {navItems.map((item) => {
            const isActive = activeMode === item.mode;
            return (
              <button
                key={item.mode}
                id={`nav-btn-${item.mode.toLowerCase()}`}
                onClick={() => {
                  hudSound.playClick();
                  onModeChange(item.mode);
                }}
                className={`relative flex items-center space-x-2 px-4 py-2 rounded-full font-mono text-xs font-semibold tracking-wider transition-all duration-200 ${
                  isActive
                    ? 'bg-cyan-500/25 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] border border-cyan-400/50'
                    : 'text-slate-300 hover:text-white hover:bg-white/10 border border-transparent'
                }`}
              >
                <span className={isActive ? 'text-cyan-300' : 'text-slate-400'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>

                {/* Active cyan status pip */}
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,1)] animate-pulse" />
                )}
              </button>
            );
          })}

          {/* Dedicated INFORMATION Button */}
          {onToggleInformation && (
            <button
              id="nav-btn-information"
              onClick={() => {
                hudSound.playClick();
                onToggleInformation();
              }}
              className={`relative flex items-center space-x-1.5 px-3.5 py-2 rounded-full font-mono text-xs font-semibold tracking-wider transition-all duration-200 border ${
                isInformationOpen
                  ? 'bg-cyan-500/30 text-white shadow-[0_0_20px_rgba(6,182,212,0.45)] border-cyan-400/60'
                  : 'text-slate-300 hover:text-white hover:bg-white/10 border-transparent'
              }`}
              title="Sites and hazards seen from your position"
            >
              <Info className={`w-4 h-4 ${isInformationOpen ? 'text-cyan-300' : 'text-slate-400'}`} />
              <span>SITES</span>
              {informationCount > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold ${
                    isInformationOpen
                      ? 'bg-cyan-400 text-slate-950'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                  }`}
                >
                  {informationCount}
                </span>
              )}
            </button>
          )}
        </nav>

        {/* Walk / EVA Sim Toggle & Pace Selector */}
        <div className="flex items-center space-x-1 p-0.5 rounded-full bg-slate-950/60 backdrop-blur-xl border border-white/10">
          <button
            onClick={() => {
              hudSound.playClick();
              onToggleWalking();
            }}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-full transition-all duration-200 shadow-lg active:scale-95 ${
              isWalking
                ? 'bg-emerald-500/30 border border-emerald-400/70 text-emerald-200 shadow-[0_0_15px_rgba(52,211,153,0.4)]'
                : 'hover:bg-white/10 text-slate-300 hover:text-white'
            }`}
            title="Start / stop the simulated walk along the planned route (Spacebar)"
          >
            <Footprints className={`w-4 h-4 ${isWalking ? 'text-emerald-300 animate-bounce' : ''}`} />
            <span className="font-mono text-xs font-bold tracking-wider">
              {isWalking ? 'WALKING' : 'WALK'}
            </span>
          </button>
        </div>

        {/* 1st / 3rd Person Camera Toggle */}
        {onToggleViewMode && (
          <button
            onClick={() => {
              hudSound.playClick();
              onToggleViewMode();
            }}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-full font-mono text-xs font-semibold tracking-wider transition-all duration-200 border shadow-lg active:scale-95 ${
              viewMode === 'astronaut'
                ? 'bg-cyan-500/30 text-cyan-200 border-cyan-400/60 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'bg-slate-950/60 text-slate-300 border-white/10 hover:text-white hover:border-cyan-400/40'
            }`}
            title="Toggle between 1st-Person Helmet Visor and 3rd-Person Astronaut Follow View"
          >
            <span>{viewMode === 'astronaut' ? '3RD PERSON' : '1ST PERSON'}</span>
          </button>
        )}

        {/* NASA Data Visor ON/OFF Master Switch */}
        {onToggleNasaHud && (
          <button
            onClick={() => {
              hudSound.playClick();
              onToggleNasaHud();
            }}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-full font-mono text-xs font-semibold tracking-wider transition-all duration-200 border shadow-lg active:scale-95 ${
              nasaHudOn
                ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/60 shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                : 'bg-slate-950/60 text-white/40 border-white/10 hover:text-white'
            }`}
            title="Toggle Real NASA Data HUD Display ON/OFF on Visor"
          >
            <span className={`w-2 h-2 rounded-full ${nasaHudOn ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
            <span>NASA DATA: {nasaHudOn ? 'ON' : 'OFF'}</span>
          </button>
        )}

      </div>
    </div>
  );
};
