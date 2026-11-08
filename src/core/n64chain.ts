/**
 * The N64 sound chain (docs/audio.md "The N64 chain"): the era's playback character on what we already compose.
 * Music and effects pass through it on the way to the master gain:
 *
 *   input → sample-rate reducer (a worklet) → low-pass → out
 *
 * plus two things the synth does itself with these numbers: a cap on simultaneous notes (`VoiceLimiter`) and a
 * reverb that depends on the place (`musicRoom`). The songs and instruments are untouched. DAW analogy: a bit-crusher
 * and an EQ on the master channel, plus a polyphony limit on the synth.
 *
 * Pure, no imports: `synth.ts` and `audio.ts` both use it. Tune it by ear in `/n64audio.html` (dev server).
 */

export interface N64Params {
  /** Off: the chain passes everything through untouched (for A/B). */
  on: boolean;
  /** The effective sample rate in Hz: the signal is held between samples at this rate. */
  rate: number;
  /** Low-pass cutoff in Hz, softening the hold's harsh edges (the era's DAC filter). */
  lowpass: number;
  /** Most notes of the music sounding at once; drums and bass are never dropped. */
  voices: number;
  /** Scales how much reverb every place gets (1 = as designed, 0 = dry). */
  reverb: number;
}

/** The starting values; the owner tunes them by ear and pastes "Copy values" here. */
export const N64_DEFAULT: Readonly<N64Params> = { on: true, rate: 22050, lowpass: 9000, voices: 24, reverb: 1 };

/** The sample-rate reducer, a tiny AudioWorklet: sample-and-hold at `rate` (>= the context's rate passes through). */
const CRUSH_SOURCE = `
class N64Crush extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'rate', defaultValue: 22050, minValue: 1000, maxValue: 192000, automationRate: 'k-rate' }];
  }
  constructor() { super(); this.phase = 1; this.held = [0, 0]; }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!out.length) return true;
    const step = params.rate[0] / sampleRate;
    for (let i = 0; i < out[0].length; i++) {
      this.phase += step;
      if (this.phase >= 1) {
        this.phase -= 1;
        for (let c = 0; c < out.length; c++) this.held[c] = inp.length ? inp[Math.min(c, inp.length - 1)][i] : 0;
      }
      for (let c = 0; c < out.length; c++) out[c][i] = this.held[c];
    }
    return true;
  }
}
registerProcessor('n64-crush', N64Crush);
`;

/** The master chain for one bus (or both): connect sources to `input`; it feeds `out`. */
export class N64Chain {
  readonly input: GainNode;
  private lowpass: BiquadFilterNode;
  private crush: AudioWorkletNode | null = null;
  private params: N64Params;
  /** Resolves once the sample-rate reducer is in the path (it loads asynchronously; until then only the low-pass works). */
  readonly ready: Promise<void>;

  constructor(private ctx: BaseAudioContext, out: AudioNode, params: Readonly<N64Params> = N64_DEFAULT) {
    this.params = { ...params };
    this.input = ctx.createGain();
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.Q.value = 0.5;
    this.lowpass.connect(out);
    this.input.connect(this.lowpass);
    this.ready = this.loadCrusher();
    this.set(params);
  }

  private async loadCrusher() {
    if (!this.ctx.audioWorklet || typeof Blob === 'undefined') return;
    try {
      const url = URL.createObjectURL(new Blob([CRUSH_SOURCE], { type: 'application/javascript' }));
      await this.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(this.ctx, 'n64-crush', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
      this.input.disconnect(this.lowpass);
      this.input.connect(node).connect(this.lowpass);
      this.crush = node;
      this.set(this.params);
    } catch {
      // No worklet (an old browser, a test): the chain is just the low-pass and the note cap.
    }
  }

  set(params: Readonly<N64Params>) {
    this.params = { ...params };
    const rate = this.ctx.sampleRate;
    this.lowpass.frequency.value = params.on ? Math.min(params.lowpass, rate / 2 - 100) : rate / 2 - 100;
    const hold = this.crush?.parameters.get('rate');
    if (hold) hold.value = params.on ? params.rate : rate;
  }
}

/**
 * A cap on simultaneous notes. Ask `admit` for each note as it is scheduled: it says whether the note may sound.
 * Notes you mark `keep` (drums, bass) always do, and still count, so the other voices make room for them.
 */
export class VoiceLimiter {
  private ends: number[] = [];
  /** How many notes were refused (for tests and the bench). */
  dropped = 0;

  constructor(public max: number) {}

  admit(start: number, end: number, keep = false) {
    this.ends = this.ends.filter((e) => e > start);
    if (!keep && this.ends.length >= this.max) {
      this.dropped++;
      return false;
    }
    this.ends.push(end);
    return true;
  }

  reset() {
    this.ends = [];
  }
}

/** A room for the music from a `ROOMS` entry (`core/blips.ts`): the reverb return's level and its tail in seconds. */
export function musicRoom(room: { room: number; seconds: number }, amount = 1) {
  return { wet: (0.3 + 4 * room.room) * 0.8 * amount, seconds: 1.2 + room.seconds * 0.8 };
}
