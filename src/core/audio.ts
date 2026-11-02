/**
 * All sound is synthesized with Web Audio: no samples, no recordings.
 * The context is created on the first key press (browsers require a user gesture).
 */

import { MusicPlayer } from './synth';
import { compiledSong, type MusicMood } from './tracks';

export type { MusicMood } from './tracks';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private music!: MusicPlayer;
  /** The mood whose song is playing, or null for silence. */
  private musicMood: MusicMood | null = null;
  musicOn = true;

  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.4;
    this.musicGain.connect(this.master);
    this.music = new MusicPlayer(this.ctx, this.musicGain);
    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.25, slideTo?: number, delay = 0, out?: AudioNode) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out ?? this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, from: number, to: number, vol = 0.3, type: BiquadFilterType = 'bandpass', delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  swing() { this.noise(0.16, 2400, 500, 0.25); }
  hit() { this.tone(240, 0.12, 'square', 0.15, 90); this.noise(0.08, 1500, 300, 0.3, 'lowpass'); }
  clank() { this.tone(1200, 0.15, 'square', 0.08, 900); this.tone(1800, 0.1, 'sine', 0.1); }
  /** A heavy blow on the shield: a deeper clang with a thud under it. */
  heavyBlock() { this.tone(700, 0.25, 'square', 0.09, 420); this.tone(1100, 0.18, 'sine', 0.1); this.noise(0.2, 700, 150, 0.3, 'lowpass'); }
  /** The guard gives way: a splintering crack and a dull drop. */
  guardBreak() {
    this.noise(0.3, 3500, 500, 0.4);
    this.tone(260, 0.4, 'sawtooth', 0.12, 70);
    this.tone(900, 0.12, 'square', 0.06, 300, 0.05);
  }
  cut() { this.noise(0.18, 3500, 900, 0.22); }
  hurt() { this.tone(330, 0.25, 'sawtooth', 0.15, 140); }
  jump() { this.tone(300, 0.12, 'sine', 0.08, 520); }
  enemyDie() { this.noise(0.4, 1200, 100, 0.3, 'lowpass'); this.tone(500, 0.35, 'square', 0.06, 60); }
  gem() { this.tone(1318.5, 0.08, 'sine', 0.15); this.tone(1975.5, 0.18, 'sine', 0.15, undefined, 0.07); }
  heart() { this.tone(880, 0.1, 'triangle', 0.15); this.tone(1174.7, 0.2, 'triangle', 0.15, undefined, 0.09); }
  blip() { this.tone(660, 0.03, 'square', 0.03); }
  select() { this.tone(988, 0.06, 'triangle', 0.1); }
  lockOn() { this.tone(700, 0.08, 'triangle', 0.1, 1100); }
  rumble() { this.noise(3.2, 160, 60, 0.5, 'lowpass'); }
  /** Uncorking and drinking a draught: a pop, then a few bubbly gulps. */
  drink() {
    this.tone(900, 0.06, 'sine', 0.12, 400);
    [0.15, 0.32, 0.49].forEach((d) => this.tone(240, 0.12, 'sine', 0.14, 160, d));
    this.noise(0.5, 1800, 600, 0.08, 'bandpass', 0.12);
  }
  /** Can't do that (no drink left). */
  denied() { this.tone(180, 0.12, 'square', 0.06, 140); }
  /** Wren falls: a slow, falling minor figure over a low drone. */
  defeat() {
    [587.33, 523.25, 466.16, 392].forEach((f, i) => this.tone(f, 0.7, 'triangle', 0.14, f * 0.97, i * 0.32));
    this.tone(98, 2.2, 'sine', 0.2, 82);
  }
  /** A wakestone grinding one cell across the floor. */
  stoneSlide() { this.noise(0.35, 500, 160, 0.35, 'lowpass'); this.tone(70, 0.3, 'sawtooth', 0.05, 55); }
  /** The sword on a stone that won't budge. */
  stoneThunk() { this.tone(150, 0.18, 'square', 0.1, 80); this.noise(0.1, 900, 300, 0.25, 'lowpass'); }
  /** A stone dropping into a pit and settling. */
  stoneSink() { this.noise(0.6, 400, 60, 0.45, 'lowpass'); this.tone(90, 0.5, 'sine', 0.25, 40, 0.15); }

  // --- boss sounds ---
  /** A long wooden/iron creak (a huge thing moving). */
  creak() { this.tone(70, 0.9, 'sawtooth', 0.06, 52); this.noise(0.9, 700, 250, 0.12, 'bandpass'); }
  /** A thin, rising shriek. */
  shriek() {
    this.tone(620, 0.7, 'sawtooth', 0.07, 1500);
    this.tone(640, 0.7, 'square', 0.03, 1380);
    this.noise(0.6, 3000, 5200, 0.12, 'bandpass');
  }
  hiss() { this.noise(0.45, 4500, 2500, 0.18, 'highpass'); }
  howl() { this.tone(180, 1.4, 'sawtooth', 0.09, 90); this.tone(270, 1.4, 'sawtooth', 0.05, 120); this.noise(1.2, 1200, 300, 0.2); }
  heavySwing() { this.noise(0.35, 1400, 220, 0.32); }
  boom() { this.tone(110, 0.7, 'sine', 0.5, 32); this.noise(0.6, 900, 60, 0.45, 'lowpass'); }
  inhale() { this.noise(0.8, 300, 2400, 0.12, 'bandpass'); }
  orbFire() { this.tone(900, 0.3, 'sine', 0.1, 300); this.noise(0.25, 2500, 800, 0.12); }
  orbPop() { this.tone(500, 0.12, 'triangle', 0.08, 900); }
  /** Cold flames roaring up around an arena. */
  flameRing() { this.noise(1.2, 400, 3000, 0.25, 'bandpass'); this.tone(150, 1.2, 'sine', 0.12, 300); }
  /** Iron and porcelain bursting apart. */
  shatter() {
    this.noise(0.5, 6000, 1500, 0.35, 'highpass');
    [1800, 2400, 1500, 3100, 2000].forEach((f, i) => this.tone(f, 0.25, 'square', 0.04, f * 0.6, i * 0.04));
    this.tone(90, 0.8, 'sine', 0.3, 40);
  }
  /** The sword landing on a weak point: crunchier than a normal hit. */
  weakHit() { this.tone(180, 0.18, 'square', 0.18, 60); this.noise(0.15, 3000, 400, 0.35); }

  /** A short rising flourish for finding an item. */
  fanfare() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i === 3 ? 0.9 : 0.18, 'triangle', 0.18, undefined, i * 0.13));
    this.tone(1318.5, 0.9, 'sine', 0.08, undefined, 0.39);
  }

  /** The "something just changed in the world" chime. */
  solved() {
    [587.33, 739.99, 880, 1174.7, 1480].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.12, undefined, i * 0.1));
  }

  /**
   * Called every frame: picks the song for the mood and keeps notes scheduled. Day and
   * night crossfade slowly; the boss theme cuts in fast.
   */
  updateMusic(mood: MusicMood, playing: boolean) {
    if (!this.ctx) return;
    // Browsers can suspend audio (a long pause, the tab in the background); bring it back
    // so the music never just stops.
    if (this.ctx.state === 'suspended' && playing && this.musicOn) void this.ctx.resume();
    const want = this.musicOn && playing ? mood : null;
    if (want !== this.musicMood) {
      const fast = want === 'boss' || this.musicMood === 'boss';
      this.music.play(want && compiledSong(want), fast ? 0.6 : 2.5);
      this.musicMood = want;
    }
    this.music.update();
  }
}
