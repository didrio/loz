/**
 * Who is speaking (a `VoiceProfile`: the instrument) and how they say a line (a `Delivery`:
 * a performance tweak on top, like a macro knob). `voice.ts` re-exports all of this with the
 * `speakPhrases` glue; it lives here so `prosody.ts` can use it without an import cycle.
 */
import { clamp } from '../../core/math';

export interface VoiceProfile {
  /** The speaking pitch in Hz: roughly where an unaccented syllable sits mid-sentence. */
  baseF0: number;
  /** How far the melody moves, in semitones: accents rise about half of it, statements fall about a quarter below the base. */
  rangeSemis: number;
  /** Multiplies every formant: a shorter vocal tract sounds smaller (man 1, woman ~1.15, child ~1.25). */
  tractScale: number;
  /** 0 = a clean, pressed voice; ~0.3 = soft and a little airy; 1 = a whisper. */
  breathiness: number;
  /** Spectral tilt of the voice source, dB down at 3 kHz: higher is darker and softer, lower is brighter and buzzier. */
  tilt: number;
  /** The share of each glottal cycle the folds are open (0.4 pressed .. 0.8 lax): higher is rounder and softer. */
  openQuotient: number;
  /** Speaking rate, 1 = normal. */
  rate: number;
  /** Pitch tremor depth in semitones (0 = steady), and its speed in Hz. Loudness wavers with it. */
  tremorDepth: number;
  tremorRate: number;
  /** Cycle-to-cycle pitch roughness (fraction of the period, ~0.005–0.03) and loudness roughness (dB, ~0.2–1.5). */
  jitter: number;
  shimmer: number;
}

/** A line's performance, relative to the speaker's voice. Every field is an offset or a multiplier, so it suits any voice. */
export interface Delivery {
  /** Semitones up or down. */
  pitch: number;
  /** Multiplies the melody's range. */
  range: number;
  /** Multiplies the speaking rate. */
  rate: number;
  /** Added to breathiness (clamped to 0–1). */
  breathiness: number;
  /** Added to tremor depth, semitones. */
  tremor: number;
  /** dB. */
  loudness: number;
  /** Added to jitter (fraction) and shimmer (dB). */
  jitter?: number;
  shimmer?: number;
}

export const DELIVERIES = {
  neutral: { pitch: 0, range: 1, rate: 1, breathiness: 0, tremor: 0, loudness: 0 },
  /** Higher, a little faster and airier, with a faint waver. */
  worried: { pitch: 1.5, range: 0.85, rate: 1.06, breathiness: 0.12, tremor: 0.18, loudness: -1, jitter: 0.004 },
  /** Lower and flat: the melody barely moves, the pace is unhurried. */
  dry: { pitch: -1.2, range: 0.5, rate: 0.95, breathiness: -0.05, tremor: 0, loudness: -1 },
  /** Higher, wider, quicker, louder. */
  excited: { pitch: 2.5, range: 1.5, rate: 1.12, breathiness: -0.08, tremor: 0, loudness: 2 },
  /** Whisper-leaning: mostly breath, little voice, quieter and slower. */
  soft: { pitch: -0.5, range: 0.7, rate: 0.9, breathiness: 0.7, tremor: 0, loudness: -5 },
  /** A trembling voice: strong tremor, rougher, a little slower. */
  shake: { pitch: 0.8, range: 0.9, rate: 0.92, breathiness: 0.15, tremor: 0.7, loudness: -1, jitter: 0.012, shimmer: 0.8 },
} satisfies Record<string, Delivery>;
export type DeliveryName = keyof typeof DELIVERIES;

/** Generic starting points; each NPC's own profile lives with the content. */
export const PRESET_VOICES = {
  woman: { baseF0: 205, rangeSemis: 9, tractScale: 1.15, breathiness: 0.32, tilt: 8, openQuotient: 0.66, rate: 0.95, tremorDepth: 0, tremorRate: 5.5, jitter: 0.008, shimmer: 0.4 },
  oldWoman: { baseF0: 185, rangeSemis: 8, tractScale: 1.12, breathiness: 0.42, tilt: 10, openQuotient: 0.7, rate: 0.85, tremorDepth: 0.18, tremorRate: 5, jitter: 0.018, shimmer: 0.9 },
  man: { baseF0: 112, rangeSemis: 7, tractScale: 1, breathiness: 0.26, tilt: 7, openQuotient: 0.62, rate: 0.95, tremorDepth: 0, tremorRate: 5.5, jitter: 0.008, shimmer: 0.4 },
  child: { baseF0: 270, rangeSemis: 11, tractScale: 1.25, breathiness: 0.25, tilt: 6, openQuotient: 0.62, rate: 1.05, tremorDepth: 0, tremorRate: 6, jitter: 0.01, shimmer: 0.5 },
} satisfies Record<string, VoiceProfile>;

/** A voice with its delivery applied: what the timing, melody and synth actually use. */
export interface ResolvedVoice extends VoiceProfile {
  /** Linear output gain from the delivery's loudness. */
  gain: number;
}

export function resolveVoice(voice: VoiceProfile, delivery: Delivery = DELIVERIES.neutral): ResolvedVoice {
  return {
    ...voice,
    baseF0: voice.baseF0 * 2 ** (delivery.pitch / 12),
    rangeSemis: Math.max(0, voice.rangeSemis * delivery.range),
    breathiness: clamp(voice.breathiness + delivery.breathiness, 0, 1),
    rate: clamp(voice.rate * delivery.rate, 0.4, 2.5),
    tremorDepth: Math.max(0, voice.tremorDepth + delivery.tremor),
    jitter: clamp(voice.jitter + (delivery.jitter ?? 0), 0, 0.08),
    shimmer: clamp(voice.shimmer + (delivery.shimmer ?? 0), 0, 3),
    openQuotient: clamp(voice.openQuotient, 0.35, 0.85),
    gain: 10 ** (delivery.loudness / 20),
  };
}
