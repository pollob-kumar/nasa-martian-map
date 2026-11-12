import React, { useEffect, useReducer, useRef } from 'react';
import { X, Sun, Volume2, VolumeX, Upload, Play, Trash2 } from 'lucide-react';
import { VisorTint } from '../types';
import { hudSound, SOUND_SLOTS, type SoundSlot } from '../utils/soundEffects';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  visorTint: VisorTint;
  onChangeVisorTint: (tint: VisorTint) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

const TINTS: { id: VisorTint; label: string }[] = [
  { id: 'clear', label: 'Clear' },
  { id: 'gold-polar', label: 'Gold' },
  { id: 'thermal-lidar', label: 'Violet' },
  { id: 'night-nv', label: 'Night' },
];

export const ToolsModal: React.FC<Props> = ({ isOpen, onClose, visorTint, onChangeVisorTint, soundEnabled, onToggleSound }) => {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const pick = useRef<SoundSlot | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { hudSound.listeners.add(bump); void hudSound.loadAll(); return () => { hudSound.listeners.delete(bump); }; }, []);
  if (!isOpen) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog" aria-label="Display settings">
      <div className="w-[440px] max-w-[92vw] max-h-[92vh] overflow-y-auto rounded-2xl border border-white/15 bg-slate-950/90 p-5 space-y-5 cursor-default">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-bold tracking-widest">DISPLAY SETTINGS</h2>
          <button onClick={onClose} className="p-1.5 rounded-full border border-white/15" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-white/55 mb-2"><Sun className="w-3.5 h-3.5" />VISOR TINT</div>
          <div className="grid grid-cols-4 gap-2">
            {TINTS.map((t) => (
              <button key={t.id} onClick={() => { hudSound.playClick(); onChangeVisorTint(t.id); }} className={`py-2 rounded border text-xs font-mono ${visorTint === t.id ? 'border-cyan-400 bg-cyan-500/20' : 'border-white/15'}`}>{t.label}</button>
            ))}
          </div>
        </div>
        <button onClick={onToggleSound} className="w-full flex items-center justify-between rounded border border-white/15 px-3 py-2 text-xs font-mono">
          <span className="flex items-center gap-2">{soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-300" /> : <VolumeX className="w-4 h-4" />}Ambient sound</span>
          <span>{soundEnabled ? 'ON' : 'OFF'}</span>
        </button>
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-white/55 mb-2"><Volume2 className="w-3.5 h-3.5" />SOUNDS · UPLOAD NASA AUDIO</div>
          <input ref={input} type="file" accept="audio/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f && pick.current) { try { await hudSound.saveSlot(pick.current, f); } catch { alert('Could not read this audio file.'); } } e.target.value = ''; }} />
          <ul className="space-y-1">
            {SOUND_SLOTS.map(({ slot, label, hint }) => {
              const src = hudSound.sourceOf(slot);
              return (
                <li key={slot} className="flex items-center gap-2 rounded border border-white/10 px-2 py-1.5">
                  <div className="min-w-0 flex-1 leading-tight"><div className="text-xs font-semibold">{label}</div><div className="truncate text-[9px] text-white/40">{hint}</div></div>
                  <span className={`rounded border px-1.5 text-[9px] font-mono ${src ? 'border-emerald-400/40 text-emerald-200' : 'border-white/15 text-white/45'}`}>{src === 'upload' ? 'UPLOADED' : src === 'public' ? 'FILE' : 'BUILT-IN'}</span>
                  {slot !== 'wind' && <button onClick={() => hudSound.test(slot)} aria-label={`Test ${label}`} className="rounded p-1 hover:bg-white/10"><Play className="w-3.5 h-3.5" /></button>}
                  <button onClick={() => { pick.current = slot; input.current?.click(); }} aria-label={`Upload ${label}`} className="rounded p-1 hover:bg-white/10"><Upload className="w-3.5 h-3.5" /></button>
                  {src === 'upload' && <button onClick={() => hudSound.clearSlot(slot)} aria-label={`Remove ${label}`} className="rounded p-1 hover:bg-white/10"><Trash2 className="w-3.5 h-3.5" /></button>}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="text-[11px] text-white/50 leading-relaxed space-y-1">
          <p><b className="text-white/70">Keys:</b> Space = walk · Arrows/WASD = look · M = map · Esc = back to HUD</p>
          <p>The 3D ground behind the HUD is a generic visual texture. Terrain numbers (elevation, slope) come from the planner data, not from this picture.</p>
        </div>
      </div>
    </div>
  );
};
