/**
 * Plays compiled songs (`music.ts`) with synthesized instruments through a shared reverb.
 *
 * Scheduling works like a DAW's audio engine rather than a game timer: each frame we hand
 * Web Audio every note due in the next quarter second, stamped with its exact time on the
 * audio clock. Notes then land on time even when frames stutter. Music follows real time,
 * not game time (slow motion and hit-stop shouldn't drag the tempo).
 *
 * Takes any BaseAudioContext, so the same code can render offline (to a WAV) for checks.
 */
import type { CompiledSong, Instrument, NoteEvent } from './music';

/** How far ahead notes are scheduled. Longer survives worse frame drops; shorter switches songs faster. */
const LOOKAHEAD = 0.25;

/** Reverb send per instrument (0 dry, 1 very wet). */
const SEND: Record<Instrument, number> = {
  flute: 0.35, bell: 0.5, box: 0.55, harp: 0.4, pad: 0.45, bass: 0.05, drive: 0.04, brass: 0.25, mallet: 0.3,
  kick: 0.04, snare: 0.2, hat: 0.1, shaker: 0.2, tom: 0.25,
};

/** A song's private output, so it can fade out while the next one starts. */
interface Bus {
  dry: GainNode;
  wet: GainNode;
}

interface Playing {
  song: CompiledSong;
  bus: Bus;
  /** Audio-clock time of the song's start (moves forward each time it loops). */
  start: number;
  /** Next event to schedule. */
  i: number;
  /** First event at or after the loop point. */
  loopIndex: number;
}

export class MusicPlayer {
  private reverb: ConvolverNode;
  private noiseBuf: AudioBuffer;
  private playing: Playing | null = null;

  constructor(private ctx: BaseAudioContext, private out: AudioNode) {
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 2.6);
    const ret = ctx.createGain();
    ret.gain.value = 0.7;
    this.reverb.connect(ret).connect(out);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  get current() {
    return this.playing?.song ?? null;
  }

  /** Switches to a song (or silence), fading the old one out over `fade` seconds. */
  play(song: CompiledSong | null, fade = 1.5) {
    const now = this.ctx.currentTime;
    if (this.playing) {
      const { dry, wet } = this.playing.bus;
      for (const g of [dry, wet]) {
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0, now + fade);
      }
      // Disconnect once the fade and the reverb tail are done.
      const src = this.ctx.createConstantSource();
      src.onended = () => { dry.disconnect(); wet.disconnect(); };
      src.start(now);
      src.stop(now + fade + 3);
    }
    this.playing = null;
    if (!song || !song.events.length) return;
    const dry = this.ctx.createGain();
    const wet = this.ctx.createGain();
    dry.connect(this.out);
    wet.connect(this.reverb);
    const loopIndex = song.events.findIndex((e) => e.at >= song.loopAt - 1e-6);
    this.playing = { song, bus: { dry, wet }, start: now + 0.05, i: 0, loopIndex: Math.max(0, loopIndex) };
  }

  /** Call every frame. `lookahead` can be made huge to schedule a whole render offline. */
  update(lookahead = LOOKAHEAD) {
    const p = this.playing;
    if (!p) return;
    const now = this.ctx.currentTime;
    const { events, length, loopAt } = p.song;
    for (let guard = 0; guard < 100000; guard++) {
      if (p.i >= events.length) {
        p.start += length - loopAt;
        p.i = p.loopIndex;
      }
      const ev = events[p.i];
      const t = p.start + ev.at;
      if (t > now + lookahead) return;
      if (now - t > 1) {
        // We fell far behind (the tab was hidden): pick up from the loop point instead of
        // blasting every missed note at once.
        p.start = now + 0.05 - loopAt;
        p.i = p.loopIndex;
        continue;
      }
      if (t >= now - 0.03) this.note(ev, Math.max(t, now), p.bus);
      p.i++;
    }
  }

  /** A gain node that feeds the bus dry and the reverb by the instrument's send amount. */
  private voiceOut(bus: Bus, inst: Instrument) {
    const g = this.ctx.createGain();
    g.connect(bus.dry);
    const send = this.ctx.createGain();
    send.gain.value = SEND[inst];
    g.connect(send).connect(bus.wet);
    return g;
  }

  private osc(type: OscillatorType, freq: number, t: number, end: number, to: AudioNode) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(to);
    o.start(t);
    o.stop(end);
    return o;
  }

  private gain(to: AudioNode, value = 0) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    g.connect(to);
    return g;
  }

  private filter(type: BiquadFilterType, freq: number, to: AudioNode, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(to);
    return f;
  }

  private noise(t: number, dur: number, to: AudioNode) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.connect(to);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur);
  }

  /** Attack, hold, then an exponential release; returns when the voice is silent. */
  private envelope(g: GainNode, t: number, attack: number, peak: number, hold: number, release: number) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, hold));
    g.gain.setTargetAtTime(0, t + Math.max(attack, hold), release / 4);
    return t + Math.max(attack, hold) + release;
  }

  /** A struck/plucked sound: instant attack, exponential decay. */
  private strike(g: GainNode, t: number, peak: number, decay: number) {
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    return t + decay;
  }

  /** Delayed vibrato, like a player leaning into a long note. */
  private vibrato(o: OscillatorNode, t: number, end: number, rate: number, depth: number) {
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = rate;
    const amt = this.ctx.createGain();
    amt.gain.setValueAtTime(0, t);
    amt.gain.setValueAtTime(0, t + 0.15);
    amt.gain.linearRampToValueAtTime(depth, t + 0.6);
    lfo.connect(amt).connect(o.frequency);
    lfo.start(t);
    lfo.stop(end);
  }

  private note(ev: NoteEvent, t: number, bus: Bus) {
    // A touch of human looseness: tiny timing and loudness variation.
    t += Math.random() * 0.006;
    const v = ev.vel * (0.9 + Math.random() * 0.15);
    const f = ev.freq;
    const d = ev.dur;
    const out = this.voiceOut(bus, ev.inst);

    switch (ev.inst) {
      case 'flute': {
        const g = this.gain(out);
        const end = this.envelope(g, t, 0.06, 0.16 * v, d * 0.95, 0.25);
        const tone = this.filter('lowpass', f * 3, g);
        const o = this.osc('triangle', f, t, end, tone);
        const o2 = this.osc('sine', f * 2, t, end, this.gain(g, 0.12));
        this.vibrato(o, t, end, 5.2, f * 0.006);
        this.vibrato(o2, t, end, 5.2, f * 0.012);
        // A puff of breath at the start of the note.
        const breath = this.gain(out);
        this.strike(breath, t, 0.035 * v, 0.12);
        this.noise(t, 0.12, this.filter('bandpass', f * 2, breath, 1.5));
        break;
      }
      case 'bell':
      case 'box': {
        const decay = ev.inst === 'box' ? 1.1 : 1.8;
        const end = t + decay;
        const g = this.gain(out);
        this.strike(g, t, 0.24 * v, decay);
        this.osc('sine', f, t, end, g);
        if (ev.inst === 'box') this.osc('sine', f * 1.008, t, end, g); // slightly out of tune: eerie
        const hi = this.gain(out);
        this.strike(hi, t, 0.05 * v, 0.35);
        this.osc('sine', f * 4, t, t + 0.4, hi);
        break;
      }
      case 'mallet': {
        // A wooden bar struck with a soft mallet (marimba-ish): a warm fundamental, a quick
        // bright partial at four times the pitch, and a little knock of wood.
        const g = this.gain(out);
        this.strike(g, t, 0.16 * v, 0.7);
        this.osc('sine', f, t, t + 0.75, g);
        const hi = this.gain(out);
        this.strike(hi, t, 0.04 * v, 0.12);
        this.osc('sine', f * 4, t, t + 0.15, hi);
        const knock = this.gain(out);
        this.strike(knock, t, 0.05 * v, 0.03);
        this.noise(t, 0.04, this.filter('bandpass', 1800, knock, 2));
        break;
      }
      case 'harp': {
        const decay = Math.max(1.4, d + 0.6);
        const g = this.gain(out);
        this.strike(g, t, 0.12 * v, decay);
        const lp = this.filter('lowpass', 900, g);
        lp.frequency.setValueAtTime(Math.min(f * 8, 8000), t);
        lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.5, 300), t + 0.5);
        this.osc('triangle', f, t, t + decay, lp);
        this.osc('sawtooth', f, t, t + decay, this.gain(lp, 0.25));
        break;
      }
      case 'pad': {
        const g = this.gain(out);
        const end = this.envelope(g, t, 0.5, 0.035 * v, d, 0.9);
        const lp = this.filter('lowpass', 1100, g, 0.3);
        this.osc('sawtooth', f * 1.004, t, end, lp);
        this.osc('sawtooth', f / 1.004, t, end, lp);
        this.osc('triangle', f, t, end, this.gain(lp, 0.6));
        break;
      }
      case 'bass': {
        const g = this.gain(out);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.14 * v, t + 0.01);
        g.gain.setTargetAtTime(0.09 * v, t + 0.01, 0.15);
        g.gain.setTargetAtTime(0, t + d * 0.9, 0.05);
        const end = t + d + 0.3;
        const lp = this.filter('lowpass', 700, g);
        this.osc('sine', f, t, end, lp);
        this.osc('triangle', f, t, end, this.gain(lp, 0.5));
        break;
      }
      case 'drive': {
        const g = this.gain(out);
        const end = this.envelope(g, t, 0.005, 0.12 * v, d * 0.85, 0.08);
        const lp = this.filter('lowpass', 400, g, 5);
        lp.frequency.setValueAtTime(1600, t);
        lp.frequency.exponentialRampToValueAtTime(350, t + 0.12);
        this.osc('sawtooth', f, t, end, lp);
        this.osc('sine', f / 2, t, end, this.gain(g, 0.5));
        break;
      }
      case 'brass': {
        const g = this.gain(out);
        const end = this.envelope(g, t, 0.05, 0.15 * v, d * 0.95, 0.2);
        const lp = this.filter('lowpass', f * 2, g, 1.2);
        lp.frequency.setValueAtTime(f * 1.5, t);
        lp.frequency.exponentialRampToValueAtTime(f * 7, t + 0.07);
        lp.frequency.exponentialRampToValueAtTime(f * 4, t + 0.3);
        const a = this.osc('sawtooth', f * 1.003, t, end, lp);
        const b = this.osc('sawtooth', f / 1.003, t, end, lp);
        this.vibrato(a, t, end, 5, f * 0.005);
        this.vibrato(b, t, end, 5, f * 0.005);
        break;
      }
      case 'kick': {
        const g = this.gain(out);
        const end = this.strike(g, t, 0.55 * v, 0.35);
        const o = this.osc('sine', 150, t, end, g);
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        break;
      }
      case 'snare': {
        const g = this.gain(out);
        this.strike(g, t, 0.4 * v, 0.18);
        this.noise(t, 0.2, this.filter('bandpass', 2200, g, 0.8));
        const body = this.gain(out);
        this.strike(body, t, 0.2 * v, 0.1);
        const o = this.osc('triangle', 200, t, t + 0.12, body);
        o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
        break;
      }
      case 'hat': {
        const g = this.gain(out);
        this.strike(g, t, 0.18 * v, 0.05);
        this.noise(t, 0.06, this.filter('highpass', 7500, g));
        break;
      }
      case 'shaker': {
        const g = this.gain(out);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.25 * v, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        this.noise(t, 0.1, this.filter('bandpass', 6500, g, 1.5));
        break;
      }
      case 'tom': {
        const g = this.gain(out);
        const end = this.strike(g, t, 0.35 * v, 0.4);
        const o = this.osc('sine', 120, t, end, g);
        o.frequency.exponentialRampToValueAtTime(70, t + 0.2);
        const skin = this.gain(out);
        this.strike(skin, t, 0.06 * v, 0.06);
        this.noise(t, 0.07, this.filter('lowpass', 700, skin));
        break;
      }
    }
    // Free the voice's output node once everything in it has finished.
    const tail = this.ctx.createConstantSource();
    tail.onended = () => out.disconnect();
    tail.start(t);
    tail.stop(t + d + 3);
  }
}

/** A synthesized room: stereo noise that decays, darker toward the tail. */
function impulse(ctx: BaseAudioContext, seconds: number) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let low = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      // One-pole lowpass whose cutoff falls over time: high frequencies die first, like a real room.
      const smooth = 0.2 + 0.75 * k;
      low = low * smooth + (Math.random() * 2 - 1) * (1 - smooth);
      d[i] = low * (1 - k) ** 2.5 * (i < rate * 0.015 ? 0 : 1);
    }
  }
  return buf;
}
