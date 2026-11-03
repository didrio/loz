/**
 * All sound is synthesized with Web Audio: no samples, no recordings.
 * The context is created on the first key press (browsers require a user gesture).
 */

import { MusicPlayer } from './synth';
import { BOSS_MOODS, compiledSong, type MusicMood } from './tracks';

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
  /** Getting on the shield: a soft wooden scuff and a low scrape. */
  surf() { this.noise(0.28, 900, 250, 0.22, 'lowpass'); this.tone(150, 0.18, 'triangle', 0.06, 110); }
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

  // --- the Tether Glove ---
  /** The cord whipping out: a rising, airy zip. */
  tetherThrow() { this.noise(0.16, 900, 4200, 0.18); this.tone(520, 0.14, 'triangle', 0.05, 1300); }
  /** It catches: a bright little latch. */
  tetherLatch() { this.tone(1500, 0.06, 'square', 0.05, 900); this.tone(2200, 0.12, 'sine', 0.06, undefined, 0.03); }
  /** A fallen column swinging round and landing across a pit. */
  columnSwing() {
    this.creak();
    this.noise(1.1, 300, 90, 0.4, 'lowpass', 0.1);
    // ...and the thud as it settles across the pit.
    this.tone(110, 0.7, 'sine', 0.5, 32, 1.15);
    this.noise(0.6, 900, 60, 0.45, 'lowpass', 1.15);
  }

  // --- enemy sounds ---
  /** A statue coming alive (and a sentinel heaving its maul up): stone grinding on stone. */
  grind(len = 1.0) { this.noise(len, 350, 120, 0.4, 'lowpass'); this.tone(55, len, 'sawtooth', 0.06, 48); this.noise(len * 0.8, 1800, 900, 0.06, 'bandpass'); }
  /** A shellback tucking into its shell before a charge. */
  shellTuck() { this.tone(260, 0.12, 'square', 0.07, 140); this.noise(0.15, 1200, 400, 0.18, 'lowpass'); }
  /** A shellback's charge: claws scrabbling on stone. */
  scrabble() { this.noise(0.5, 2600, 1400, 0.16, 'bandpass'); }

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

  /**
   * A keeper's bell (docs/bells.md): a cast bell's inharmonic partials (hum, prime, minor
   * tierce, quint, nominal...), the high ones dying first. `gain` < 1 and a `delay` make a
   * far-off bell answering. The Morrowbell rings A4, the Lullbell the D below it (the
   * valley's key, a fifth apart).
   */
  bell(freq: number, gain = 1, delay = 0) {
    const partials: [ratio: number, vol: number, dur: number][] = [
      [0.5, 0.1, 4.5], [1, 0.14, 4], [1.19, 0.07, 2.6], [1.5, 0.05, 2.2], [2, 0.08, 2.4], [2.52, 0.035, 1.4], [3.01, 0.03, 1.1], [4.1, 0.015, 0.7],
    ];
    for (const [r, v, d] of partials) this.tone(freq * r, d, 'sine', v * gain, undefined, delay);
    this.noise(0.05, 4200, 1800, 0.08 * gain, 'bandpass', delay); // the clapper's strike
  }

  /** The sword on a Murmurbud: a soft, hollow knock that climbs with how swollen it is (0..1). */
  budTap(growth: number) { this.tone(330 + growth * 330, 0.14, 'triangle', 0.14, 260 + growth * 260); this.noise(0.06, 900, 400, 0.12, 'lowpass'); }
  /** A Murmurbud overworked: "nuh-uh", two falling buzzy blips, the second lower. */
  nuhUh() {
    this.tone(392, 0.13, 'square', 0.07, 330);
    this.tone(294, 0.22, 'square', 0.07, 220, 0.16);
  }
  /** A Murmurbud peels open: a soft rising arpeggio and a breath. */
  budOpen() {
    [440, 554.37, 659.25, 880].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.1, undefined, i * 0.09));
    this.noise(0.6, 600, 2400, 0.08, 'bandpass');
  }

  /**
   * A scream from across the village, then a tin bucket hitting the ground: a buzzy voice (sawtooth)
   * shaped by three vowel formants ("ah"), its pitch leaping up and sagging with a nervous vibrato,
   * muffled by distance with a faint echo; then the bucket's ring and two bounces.
   */
  scream() {
    const ctx = this.ctx;
    if (!ctx) return;
    const voice = (t0: number, vol: number) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(460, t0);
      o.frequency.exponentialRampToValueAtTime(820, t0 + 0.18);
      o.frequency.setValueAtTime(820, t0 + 0.5);
      o.frequency.exponentialRampToValueAtTime(560, t0 + 1.1);
      const vib = ctx.createOscillator();
      vib.frequency.value = 7;
      const depth = ctx.createGain();
      depth.gain.value = 18;
      vib.connect(depth).connect(o.frequency);
      const far = ctx.createBiquadFilter();
      far.type = 'lowpass';
      far.frequency.value = 2600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.07);
      g.gain.setValueAtTime(vol, t0 + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.15);
      far.connect(g).connect(this.master);
      for (const [f, q, v] of [[850, 6, 1], [1250, 8, 0.6], [2850, 10, 0.3]] as const) {
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = f;
        band.Q.value = q;
        const bg = ctx.createGain();
        bg.gain.value = v;
        o.connect(band).connect(bg).connect(far);
      }
      o.start(t0);
      vib.start(t0);
      o.stop(t0 + 1.2);
      vib.stop(t0 + 1.2);
    };
    const now = ctx.currentTime;
    voice(now, 0.5);
    voice(now + 0.22, 0.08); // the echo off the cottages
    // The bucket: a tinny ring and a clatter, then two smaller bounces.
    [0.95, 1.18, 1.32].forEach((d, i) => {
      const k = 1 / (i + 1);
      this.tone(1480, 0.35 * k, 'sine', 0.05 * k, 1400, d);
      this.tone(2230, 0.25 * k, 'sine', 0.035 * k, undefined, d);
      this.noise(0.12 * k, 3200, 1200, 0.18 * k, 'bandpass', d);
    });
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
      // Silence cuts in at once (death, a boss's entrance); the boss theme fast; day and night slowly.
      const fast = (want !== null && BOSS_MOODS.has(want)) || (this.musicMood !== null && BOSS_MOODS.has(this.musicMood));
      this.music.play(want && compiledSong(want), want === null ? 0.12 : fast ? 0.6 : 2.5);
      this.musicMood = want;
    }
    this.music.update();
  }
}
