/**
 * Plays a rendered line (`speakPhrases`/`speak` output) through the "softened" chain the owner chose:
 * a gentle low-pass for warmth and a short, dark room behind the voice, so the synth's edges sit back
 * like a storybook voice. The only Web Audio part of the speech code; takes any BaseAudioContext, so a
 * scratch script can render a line through it offline to a WAV.
 */

import { impulse } from '../synth';

export interface VoiceChain {
  /** Low-pass cutoff in Hz: lower is warmer and duller. */
  warmth: number;
  /** How much of the voice goes to the room (0..1). */
  room: number;
  /** Output level of the dry voice. */
  level: number;
}

// level: speech peaks ~0.2–0.5 after the game's master gain, at or a little above the music (which peaks 0.1–0.2).
export const SOFT_CHAIN: VoiceChain = { warmth: 5200, room: 0.22, level: 1.2 };

export interface VoiceHandle {
  /** Fades the line out over `fadeMs` and stops it (cut off by the next box or the end of a talk). */
  stop(fadeMs?: number): void;
  /** Resolves when the line has played to its end or been stopped. */
  done: Promise<void>;
  /** The context time the line started at, to type text along its timeline. */
  startedAt: number;
}

export class VoicePlayer {
  private room: ConvolverNode;
  private current: VoiceHandle | null = null;

  constructor(private ctx: BaseAudioContext, private out: AudioNode) {
    this.room = ctx.createConvolver();
    this.room.buffer = impulse(ctx, 1.4);
    this.room.connect(out);
  }

  /** Plays one line; a line already playing is cut off first (one voice at a time). */
  play(samples: Float32Array, sampleRate: number, chain: VoiceChain = SOFT_CHAIN, delay = 0): VoiceHandle {
    this.current?.stop(40);
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, samples.length, sampleRate);
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = chain.warmth;
    warm.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = chain.level;
    const send = ctx.createGain();
    send.gain.value = chain.room;
    src.connect(warm).connect(gain).connect(this.out);
    gain.connect(send).connect(this.room);

    const startedAt = ctx.currentTime + delay;
    let finish!: () => void;
    const done = new Promise<void>((resolve) => (finish = resolve));
    src.onended = () => {
      gain.disconnect();
      send.disconnect();
      if (this.current === handle) this.current = null;
      finish();
    };
    const handle: VoiceHandle = {
      startedAt,
      done,
      stop: (fadeMs = 80) => {
        const t = Math.max(ctx.currentTime, startedAt);
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
        try {
          src.stop(t + fadeMs / 1000);
        } catch {
          // Already stopped.
        }
      },
    };
    src.start(startedAt);
    this.current = handle;
    return handle;
  }

  /** Cuts off whatever line is playing. */
  stop(fadeMs?: number) {
    this.current?.stop(fadeMs);
  }
}
