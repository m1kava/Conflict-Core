export type SoundKind = 'rifle' | 'autocannon' | 'cannon' | 'missile' | 'howitzer' | 'sam' | 'explosionSmall' | 'explosionLarge' | 'click' | 'confirm' | 'alert' | 'error' | 'build' | 'ready';

const MAX_VOICES = 18;
const MIN_INTERVAL_MS: Partial<Record<SoundKind, number>> = { rifle: 45, autocannon: 50, explosionSmall: 60 };

/**
 * Procedural sound effects synthesised with WebAudio (filtered noise, oscillators, envelopes), so the game
 * needs no audio assets. Voices are capped, repeated sounds are throttled and volume falls off with distance
 * from the camera focus.
 */
export class SoundEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = 0;
  private readonly lastPlayed = new Map<SoundKind, number>();
  volume = 0.7;

  /** Browsers only allow audio after a user gesture; call from an input handler. */
  unlock(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) {
      return;
    }
    this.context = new Context();
    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    const compressor = this.context.createDynamicsCompressor();
    this.master.connect(compressor).connect(this.context.destination);
    const length = this.context.sampleRate;
    this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.master) {
      this.master.gain.value = volume;
    }
  }

  /** Plays a sound; `distance` in metres from the listener (camera focus) attenuates it. */
  play(kind: SoundKind, distance = 0): void {
    const ctx = this.context;
    if (!ctx || !this.master || !this.noise || this.volume <= 0 || ctx.state !== 'running') {
      return;
    }
    const gain = Math.max(0, 1 - distance / 220);
    if (gain < 0.05 || this.voices >= MAX_VOICES) {
      return;
    }
    const now = performance.now();
    const interval = MIN_INTERVAL_MS[kind] ?? 25;
    if (now - (this.lastPlayed.get(kind) ?? 0) < interval) {
      return;
    }
    this.lastPlayed.set(kind, now);
    this.voices++;
    const duration = this.synth(ctx, kind, gain);
    window.setTimeout(() => this.voices--, duration * 1000 + 50);
  }

  private synth(ctx: AudioContext, kind: SoundKind, gain: number): number {
    const t = ctx.currentTime;
    switch (kind) {
      case 'rifle':
        return this.noiseBurst(t, 0.08, 2400, 1.2, 0.25 * gain, 'bandpass');
      case 'autocannon':
        this.thump(t, 140, 60, 0.12, 0.4 * gain);
        return this.noiseBurst(t, 0.12, 1500, 1, 0.35 * gain, 'bandpass');
      case 'cannon':
        this.thump(t, 90, 35, 0.4, 0.9 * gain);
        return this.noiseBurst(t, 0.5, 900, 0.7, 0.6 * gain, 'lowpass');
      case 'howitzer':
        this.thump(t, 70, 28, 0.6, 1.0 * gain);
        return this.noiseBurst(t, 0.9, 600, 0.6, 0.7 * gain, 'lowpass');
      case 'missile':
      case 'sam':
        return this.sweep(t, 0.7, 500, 2600, 0.3 * gain);
      case 'explosionSmall':
        this.thump(t, 80, 30, 0.3, 0.6 * gain);
        return this.noiseBurst(t, 0.6, 1200, 0.6, 0.5 * gain, 'lowpass');
      case 'explosionLarge':
        this.thump(t, 60, 22, 0.9, 1.0 * gain);
        return this.noiseBurst(t, 1.6, 700, 0.5, 0.9 * gain, 'lowpass');
      case 'click':
        return this.tone(t, 0.05, 880, 'triangle', 0.15);
      case 'confirm':
        this.tone(t, 0.06, 660, 'triangle', 0.14);
        return this.tone(t + 0.06, 0.08, 990, 'triangle', 0.14);
      case 'build':
        this.tone(t, 0.08, 520, 'square', 0.06);
        return this.tone(t + 0.09, 0.12, 780, 'square', 0.06);
      case 'ready':
        this.tone(t, 0.1, 740, 'sine', 0.18);
        return this.tone(t + 0.11, 0.16, 1110, 'sine', 0.18);
      case 'alert':
        this.tone(t, 0.14, 520, 'sawtooth', 0.08);
        return this.tone(t + 0.18, 0.14, 420, 'sawtooth', 0.08);
      case 'error':
        return this.tone(t, 0.16, 180, 'square', 0.1);
    }
  }

  private noiseBurst(t: number, duration: number, frequency: number, q: number, volume: number, type: BiquadFilterType): number {
    const ctx = this.context!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(volume, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(env).connect(this.master!);
    source.start(t, Math.random() * 0.5, duration);
    return duration;
  }

  private thump(t: number, from: number, to: number, duration: number, volume: number): void {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(volume, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(env).connect(this.master!);
    osc.start(t);
    osc.stop(t + duration);
  }

  private sweep(t: number, duration: number, from: number, to: number, volume: number): number {
    const ctx = this.context!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + duration * 0.4);
    filter.frequency.exponentialRampToValueAtTime(from * 0.6, t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, t);
    env.gain.exponentialRampToValueAtTime(volume, t + 0.05);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(env).connect(this.master!);
    source.start(t, 0, duration);
    return duration;
  }

  private tone(t: number, duration: number, frequency: number, type: OscillatorType, volume: number): number {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const env = ctx.createGain();
    env.gain.setValueAtTime(volume, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(env).connect(this.master!);
    osc.start(t);
    osc.stop(t + duration + 0.02);
    return duration;
  }
}
