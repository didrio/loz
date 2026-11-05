/**
 * Talking blips: a character "speaks" by playing a short, soft note for some of the letters as the text types.
 * Not words, just a voice-like babble with a pitch, a timbre and a cadence per speaker (woman, boy, old man...).
 * `blipAt` is pure (letter in, blip out); `BlipPlayer` is the only Web Audio part. The shelved speech synth lives in `labs/speech/`.
 */
import { impulse } from './synth';

export interface BlipVoice {
  /** The speaking pitch in Hz: where the babble's lowest note sits. */
  pitch: number;
  /** How far the babble wanders: 1 is about an octave and a half over the pitch; 0.4 is nearly flat. */
  range: number;
  wave: OscillatorType;
  /** Low-pass cutoff in Hz: lower is rounder and duller. */
  cutoff: number;
  /** Seconds per blip. */
  length: number;
  /** One blip per this many letters (1 is a chatter, 3 is a slow mumble). */
  every: number;
  /** Semitones the pitch bends over a blip (+ chirps up, - sags down). */
  glide: number;
  /** Pitch wobble: depth in semitones and speed in Hz (an old or nervous voice). */
  wobble: number;
  wobbleRate: number;
  gain: number;
}

/** A page-wide change to a voice (`[soft]`, `[shake]` around a whole page). */
export interface BlipMood {
  /** Semitones. */
  pitch?: number;
  /** Multiplies the loudness, the length and the cutoff. */
  gain?: number;
  length?: number;
  cutoff?: number;
  /** Added to the wobble depth (semitones) and set as its speed. */
  wobble?: number;
  wobbleRate?: number;
}

export const MOODS = {
  soft: { pitch: -0.5, gain: 0.5, length: 1.2, cutoff: 0.7 },
  shake: { pitch: 0.5, wobble: 0.7, wobbleRate: 9 },
} satisfies Record<string, BlipMood>;
export type MoodName = keyof typeof MOODS;

export const BLIP_PRESETS = {
  woman: { pitch: 330, range: 0.8, wave: 'triangle', cutoff: 2400, length: 0.07, every: 2, glide: 0.6, wobble: 0, wobbleRate: 5.5, gain: 0.5 },
  girl: { pitch: 420, range: 0.9, wave: 'sine', cutoff: 3200, length: 0.06, every: 2, glide: 1, wobble: 0, wobbleRate: 6, gain: 0.55 },
  boy: { pitch: 500, range: 1, wave: 'square', cutoff: 2600, length: 0.05, every: 1, glide: 1.5, wobble: 0, wobbleRate: 6, gain: 0.3 },
  man: { pitch: 150, range: 0.5, wave: 'sawtooth', cutoff: 900, length: 0.08, every: 2, glide: -0.5, wobble: 0, wobbleRate: 5, gain: 0.45 },
  oldMan: { pitch: 105, range: 0.6, wave: 'sawtooth', cutoff: 650, length: 0.11, every: 3, glide: -1, wobble: 0.2, wobbleRate: 5, gain: 0.5 },
  oldWoman: { pitch: 260, range: 0.7, wave: 'triangle', cutoff: 1800, length: 0.09, every: 3, glide: 0.4, wobble: 0.3, wobbleRate: 5.5, gain: 0.5 },
} satisfies Record<string, BlipVoice>;

export interface Blip {
  wave: OscillatorType;
  freq: number;
  gain: number;
  length: number;
  glide: number;
  cutoff: number;
  wobble: number;
  wobbleRate: number;
}

/** Notes the babble draws from, in semitones over the voice's pitch: a pentatonic scale, so it can't sound sour. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
const LETTER = /[a-z]/i;

/** How the blips of a page are counted: letters seen so far. */
export interface BlipState {
  letters: number;
}

/**
 * The blip for visible character `k` of `plain`, or null (not a letter, or between blips). Pitch comes from the letter and
 * its place, so the same text always babbles the same way; the last few letters of a sentence follow its end (a question
 * rises, a statement settles, an exclamation jumps).
 */
export function blipAt(voice: BlipVoice, plain: string, k: number, state: BlipState, mood: BlipMood = {}): Blip | null {
  const ch = plain[k];
  if (!ch || !LETTER.test(ch)) return null;
  const n = state.letters++;
  if (n % voice.every !== 0) return null;
  const code = ch.toLowerCase().charCodeAt(0);
  let semis = SCALE[(code * 7 + n * 3) % SCALE.length] * voice.range + (mood.pitch ?? 0);
  let gain = voice.gain * (mood.gain ?? 1);

  // The sentence end: letters left until the next . ! ? (or the end of the box).
  let left = 0;
  let end = '.';
  for (let i = k + 1; i < plain.length; i++) {
    if (/[.!?]/.test(plain[i])) {
      end = plain[i];
      break;
    }
    if (LETTER.test(plain[i])) left++;
  }
  if (left < 4) {
    const t = (4 - left) / 4; // 0.25 .. 1 toward the end
    if (end === '?') semis += t * 4;
    else if (end === '!') {
      semis += 2 + t * 2;
      gain *= 1.2;
    } else semis -= t * 2.5;
  }
  return {
    wave: voice.wave,
    freq: voice.pitch * 2 ** (semis / 12),
    gain,
    length: voice.length * (mood.length ?? 1),
    glide: voice.glide,
    cutoff: voice.cutoff * (mood.cutoff ?? 1),
    wobble: voice.wobble + (mood.wobble ?? 0),
    wobbleRate: mood.wobbleRate ?? voice.wobbleRate,
  };
}

/** Where the voice is heard (`Area.voiceRoom`): how much goes to the room, and how long it rings. */
export const ROOMS = {
  outdoors: { room: 0.06, seconds: 0.7 },
  house: { room: 0.16, seconds: 1.4 },
  dungeon: { room: 0.28, seconds: 2.6 },
} as const;
export type RoomName = keyof typeof ROOMS;

/** Plays blips: a soft note through a low-pass, with a little room behind it. */
export class BlipPlayer {
  private room: ConvolverNode;
  private roomSeconds = 1.4;

  constructor(private ctx: BaseAudioContext, private out: AudioNode) {
    this.room = ctx.createConvolver();
    this.room.buffer = impulse(ctx, this.roomSeconds);
    this.room.connect(out);
  }

  play(b: Blip, room: RoomName = 'outdoors', delay = 0) {
    const { ctx } = this;
    const r = ROOMS[room];
    if (r.seconds !== this.roomSeconds) {
      this.roomSeconds = r.seconds;
      this.room.buffer = impulse(ctx, r.seconds);
    }
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = b.wave;
    osc.frequency.setValueAtTime(b.freq, t);
    osc.frequency.exponentialRampToValueAtTime(b.freq * 2 ** (b.glide / 12), t + b.length);
    const nodes: AudioNode[] = [osc];
    if (b.wobble > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = b.wobbleRate;
      const depth = ctx.createGain();
      depth.gain.value = b.freq * (2 ** (b.wobble / 12) - 1);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + b.length + 0.05);
      nodes.push(lfo, depth);
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = b.cutoff;
    lp.Q.value = 0.4;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(b.gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + b.length);
    const send = ctx.createGain();
    send.gain.value = r.room;
    osc.connect(lp).connect(env).connect(this.out);
    env.connect(send).connect(this.room);
    osc.start(t);
    osc.stop(t + b.length + 0.02);
    osc.onended = () => {
      for (const n of [lp, env, send, ...nodes]) n.disconnect();
    };
  }
}
