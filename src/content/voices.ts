/**
 * Who sounds like what (docs/audio.md "Voices"). A page's `who` picks a voice and a default delivery;
 * pages without a known speaker (narration, signs, items, keeper notes, sigils) stay silent.
 * Maren, Tobin and Pip are the owner-approved trial voices; Lark and Odo start from presets (queue 6 tunes them).
 */
import { DELIVERIES, PRESET_VOICES, type Delivery, type VoiceProfile } from '../core/speech/voice';

export interface Speaker {
  voice: VoiceProfile;
  delivery: Delivery;
}

export const SPEAKERS: Record<string, Speaker> = {
  Maren: { voice: PRESET_VOICES.oldWoman, delivery: DELIVERIES.worried },
  Tobin: { voice: PRESET_VOICES.man, delivery: DELIVERIES.dry },
  Pip: { voice: PRESET_VOICES.child, delivery: DELIVERIES.excited },
  Lark: { voice: PRESET_VOICES.woman, delivery: DELIVERIES.neutral },
  Odo: { voice: { ...PRESET_VOICES.man, baseF0: 124, rate: 1.02 }, delivery: DELIVERIES.neutral },
};

/** The speaker for a page's `who` ("Tobin the Miller" is Tobin: the first word counts), or null for silence. */
export function speakerFor(who: string | undefined): Speaker | null {
  if (!who) return null;
  return SPEAKERS[who] ?? SPEAKERS[who.split(' ')[0]] ?? null;
}
