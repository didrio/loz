/**
 * All sound is synthesized with Web Audio: no samples, no recordings.
 * The context is created on the first key press (browsers require a user gesture).
 */

// Five flute notes: a major pentatonic on C5.
export const FLUTE_FREQS = [523.25, 587.33, 659.25, 783.99, 880.0];

// Background music: a slow arpeggio over a four-chord loop (day) or a minor loop (night).
const DAY_CHORDS = [[349.23, 440, 523.25], [293.66, 349.23, 440], [233.08, 293.66, 349.23], [261.63, 329.63, 392]];
const NIGHT_CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66], [164.81, 196, 246.94]];
// Boss fight: a driving low pulse in D minor with a detuned music-box line on top.
const BOSS_BASS = [73.42, 73.42, 69.3, 65.41, 73.42, 73.42, 77.78, 69.3];
const BOSS_BOX = [587.33, 698.46, 554.37, 0, 587.33, 830.61, 698.46, 0, 523.25, 622.25, 554.37, 0, 466.16, 554.37, 440, 0];

export type MusicMood = 'day' | 'night' | 'boss';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private musicT = 0;
  private musicStep = 0;
  private mood: MusicMood = 'day';
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
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.master);
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

  /** A breathy flute note with a little vibrato. */
  flute(i: number, dur = 0.55, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = FLUTE_FREQS[i];
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = ctx.createGain();
    lg.gain.value = 5;
    lfo.connect(lg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.05);
    g.gain.setValueAtTime(0.22, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + dur + 0.05);
    lfo.stop(t0 + dur + 0.05);
    this.noise(0.12, 3000, 1500, 0.03, 'bandpass', delay);
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

  /** Called every frame; schedules the next note when it's due. */
  updateMusic(dt: number, mood: MusicMood, playing: boolean) {
    if (!this.ctx || !this.musicOn || !playing) return;
    if (mood !== this.mood) {
      this.mood = mood;
      this.musicStep = 0;
      this.musicT = 0;
    }
    this.musicT -= dt;
    if (this.musicT > 0) return;
    if (mood === 'boss') {
      this.bossStep();
      return;
    }
    const night = mood === 'night';
    const beat = night ? 0.55 : 0.42;
    this.musicT = beat;
    const chords = night ? NIGHT_CHORDS : DAY_CHORDS;
    const chord = chords[Math.floor(this.musicStep / 8) % chords.length];
    const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
    const note = chord[pattern[this.musicStep % 8]];
    this.tone(note, beat * 2.2, 'triangle', 0.05, undefined, 0, this.musicGain);
    if (this.musicStep % 8 === 0) this.tone(chord[0] / 2, beat * 7, 'sine', 0.06, undefined, 0, this.musicGain);
    this.musicStep++;
  }

  private bossStep() {
    const step = 0.17;
    this.musicT = step;
    const i = this.musicStep++;
    const out = this.musicGain;
    if (i % 2 === 0) this.tone(BOSS_BASS[Math.floor(i / 4) % BOSS_BASS.length], step * 1.8, 'square', 0.07, undefined, 0, out);
    if (i % 4 === 2) this.noise(0.05, 7000, 5000, 0.05, 'highpass');
    if (i % 8 === 4) this.noise(0.12, 300, 80, 0.12, 'lowpass');
    const note = BOSS_BOX[i % BOSS_BOX.length];
    if (note && Math.floor(i / 16) % 2 === 1) {
      this.tone(note, 0.5, 'sine', 0.04, undefined, 0, out);
      this.tone(note * 1.012, 0.5, 'sine', 0.025, undefined, 0, out);
    }
  }
}
