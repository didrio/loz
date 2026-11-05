/**
 * A speaking voice: profiles, deliveries, and the glue from phrases to samples
 * (`speakPhrases`: prosody → frames → formant synth). The text side (`phonemize`) feeds it.
 */
import { synthesize } from './klatt';
import { DELIVERIES, type Delivery, type VoiceProfile } from './profile';
import { prosody, type Timeline } from './prosody';
import { phonemize } from './phonemize';
import type { Phrase } from './types';

export { DELIVERIES, PRESET_VOICES, resolveVoice, type Delivery, type DeliveryName, type ResolvedVoice, type VoiceProfile } from './profile';

export interface Speech {
  samples: Float32Array;
  sampleRate: number;
  timeline: Timeline;
}

export function speakPhrases(phrases: Phrase[], voice: VoiceProfile, delivery: Delivery = DELIVERIES.neutral, sampleRate = 24000): Speech {
  const timeline = prosody(phrases, voice, delivery);
  return { samples: synthesize(timeline, sampleRate), sampleRate, timeline };
}

/** Text in (rich-text tags allowed), speech out: `phonemize` → `speakPhrases`. */
export function speak(text: string, voice: VoiceProfile, delivery: Delivery = DELIVERIES.neutral, sampleRate = 24000): Speech {
  return speakPhrases(phonemize(text), voice, delivery, sampleRate);
}
