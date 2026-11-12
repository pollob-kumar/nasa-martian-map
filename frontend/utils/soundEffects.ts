// Web Audio API sound synthesis for Mars Astronaut Helmet HUD
export type SoundSlot = 'wind' | 'click' | 'lock' | 'alert' | 'footstep' | 'suit';
export const SOUND_SLOTS: { slot: SoundSlot; label: string; hint: string; loop?: boolean }[] = [
  { slot: 'wind', label: 'Mars wind', hint: 'Looping ambient (e.g. NASA Perseverance microphone)', loop: true },
  { slot: 'footstep', label: 'Footstep', hint: 'Boot on regolith' },
  { slot: 'click', label: 'Button click', hint: 'Short UI sound' },
  { slot: 'lock', label: 'Target lock', hint: 'Destination chosen' },
  { slot: 'alert', label: 'Hazard alert', hint: 'Warning tone' },
  { slot: 'suit', label: 'Suit movement', hint: 'Fabric / servo' },
];
const DB = 'rednav-sounds';
const idb = (): Promise<IDBDatabase> => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('files');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

class HudAudioEngine {
  // ---- custom sounds: drop files in public/sounds/<slot>.mp3|wav|ogg  OR upload them in Display settings ----
  private custom: Partial<Record<SoundSlot, AudioBuffer>> = {};
  private customSource: Partial<Record<SoundSlot, 'public' | 'upload'>> = {};
  private loadedAll = false;
  listeners = new Set<() => void>();
  sourceOf(slot: SoundSlot) { return this.customSource[slot] ?? null; }
  private notify() { this.listeners.forEach((f) => f()); }

  private async decode(buf: ArrayBuffer) {
    this.initCtx();
    if (!this.ctx) throw new Error('no audio');
    return await this.ctx.decodeAudioData(buf.slice(0));
  }
  async loadAll() {
    if (this.loadedAll || typeof window === 'undefined') return;
    this.loadedAll = true;
    let files: Record<string, string> = {};
    try { files = await (await fetch('/api/sounds')).json(); } catch { /* no list */ }
    for (const { slot } of SOUND_SLOTS) {
      if (!files[slot]) continue;
      try {
        const r = await fetch(files[slot]);
        if (!r.ok) continue;
        this.custom[slot] = await this.decode(await r.arrayBuffer());
        this.customSource[slot] = 'public';
      } catch { /* unreadable file: keep built-in */ }
    }
    try {
      const db = await idb();
      for (const { slot } of SOUND_SLOTS) {
        const data: ArrayBuffer | undefined = await new Promise((res) => { const q = db.transaction('files').objectStore('files').get(slot); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); });
        if (data) { try { this.custom[slot] = await this.decode(data); this.customSource[slot] = 'upload'; } catch { /* ignore broken file */ } }
      }
    } catch { /* no IndexedDB */ }
    this.notify();
  }
  async saveSlot(slot: SoundSlot, file: File) {
    const data = await file.arrayBuffer();
    this.custom[slot] = await this.decode(data);
    this.customSource[slot] = 'upload';
    try { const db = await idb(); db.transaction('files', 'readwrite').objectStore('files').put(data, slot); } catch { /* memory only */ }
    this.notify();
  }
  async clearSlot(slot: SoundSlot) {
    delete this.custom[slot]; delete this.customSource[slot];
    try { const db = await idb(); db.transaction('files', 'readwrite').objectStore('files').delete(slot); } catch { /* ignore */ }
    this.notify();
  }
  /** play an uploaded / dropped-in sound for this slot. Returns true if one existed. */
  playCustom(slot: SoundSlot, volume = 0.8, force = false): boolean {
    const b = this.custom[slot];
    if (!b) return false;
    if (!this.enabled && !force) return true;
    try {
      this.initCtx();
      if (!this.ctx) return false;
      const src = this.ctx.createBufferSource(); src.buffer = b;
      const g = this.ctx.createGain(); g.gain.value = volume;
      src.connect(g); g.connect(this.ctx.destination); src.start();
      return true;
    } catch { return false; }
  }
  test(slot: SoundSlot) {
    if (slot === 'wind') return;
    if (this.playCustom(slot, 0.8, true)) return;
    const was = this.enabled; this.enabled = true;
    ({ click: () => this.playClick(), lock: () => this.playTargetLock(), alert: () => this.playHazardAlert(), footstep: () => this.playFootstep(), suit: () => this.playSuitMovement() } as Record<string, () => void>)[slot]?.();
    this.enabled = was;
  }

  private ctx: AudioContext | null = null;
   enabled: boolean = true;
  private windGain: GainNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private isWindPlaying: boolean = false;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Authentic Martian Wind Sound Simulation (NASA Perseverance rover microphone recording model)
   startMartianWind() {
    if (!this.enabled || this.isWindPlaying) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      if (this.custom.wind) {
        const src = this.ctx.createBufferSource(); src.buffer = this.custom.wind; src.loop = true;
        this.windGain = this.ctx.createGain(); this.windGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
        this.windGain.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 2);
        src.connect(this.windGain); this.windGain.connect(this.ctx.destination); src.start();
        this.windSource = src; this.isWindPlaying = true;
        return;
      }

      const bufferSize = this.ctx.sampleRate * 4; // 4 second seamless looping pinkish noise buffer
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
        b6 = white * 0.115926;
      }

      this.windSource = this.ctx.createBufferSource();
      this.windSource.buffer = buffer;
      this.windSource.loop = true;

      // Martian low-pressure atmosphere low-pass filter (thin air absorbs high frequencies)
      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(320, this.ctx.currentTime);

      const highpass = this.ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(45, this.ctx.currentTime);

      this.windGain = this.ctx.createGain();
      this.windGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      this.windGain.gain.linearRampToValueAtTime(0.045, this.ctx.currentTime + 2.0); // Gentle fade in

      this.windSource.connect(lowpass);
      lowpass.connect(highpass);
      highpass.connect(this.windGain);
      this.windGain.connect(this.ctx.destination);

      this.windSource.start();
      this.isWindPlaying = true;
    } catch {
      // Audio autoplay policy fallback
    }
  }

   stopMartianWind() {
    if (!this.isWindPlaying || !this.windGain || !this.ctx) return;
    try {
      this.windGain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 1.0);
      setTimeout(() => {
        if (this.windSource) {
          try {
            this.windSource.stop();
            this.windSource.disconnect();
          } catch {}
          this.windSource = null;
        }
        this.isWindPlaying = false;
      }, 1000);
    } catch {
      this.isWindPlaying = false;
    }
  }

  // Trigger a gust of wind (increases ambient wind during walking or near dust devils)
   triggerWindGust() {
    if (!this.enabled || !this.isWindPlaying || !this.windGain || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      this.windGain.gain.cancelScheduledValues(now);
      this.windGain.gain.setValueAtTime(this.windGain.gain.value, now);
      this.windGain.gain.linearRampToValueAtTime(0.095, now + 1.2);
      this.windGain.gain.exponentialRampToValueAtTime(0.04, now + 4.5);
    } catch {}
  }

  // Muted crisp HUD UI chirp (Apple-like subtle click)
   playClick() {
    if (!this.enabled) return;
    if (this.playCustom('click')) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  // Target locked subtle electronic chime
   playTargetLock() {
    if (!this.enabled) return;
    if (this.playCustom('lock')) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.setValueAtTime(1320, t + 0.05);

      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.12);
    } catch {
      // Ignore
    }
  }

  // Hazard warning chime
   playHazardAlert() {
    if (!this.enabled) return;
    if (this.playCustom('alert')) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.setValueAtTime(660, t + 0.08);

      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.22);
    } catch {
      // Ignore
    }
  }

  // Regolith boot step (deep muffled crunch + gravel displacement)
   playFootstep(foot: 'left' | 'right' = 'left') {
    if (!this.enabled) return;
    if (this.playCustom('footstep', 0.6)) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;

      // 1. Low-frequency sole thump (compacted soil compression)
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      const baseFreq = foot === 'left' ? 72 : 80; // Slight variance between left and right foot
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + 0.08);

      oscGain.gain.setValueAtTime(0.12, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);

      // 2. High-frequency dry regolith gravel crunch
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.09);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(foot === 'left' ? 380 : 440, t);
      filter.Q.setValueAtTime(2.2, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(t);
      noise.stop(t + 0.09);
    } catch {
      // Ignore
    }
  }

  // Subtle pressurized suit fabric crinkle & servo/pneumatic hiss
   playSuitMovement() {
    if (!this.enabled) return;
    if (this.playCustom('suit')) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;

      // Soft air / fabric hiss
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.05);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1600, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.015, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(t);
      noise.stop(t + 0.05);
    } catch {
      // Ignore
    }
  }
}

export const hudSound = new HudAudioEngine();
