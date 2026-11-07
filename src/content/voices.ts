/**
 * Who sounds like what (docs/audio.md "Talking blips"). A page's `who` picks a blip voice; pages without a
 * known speaker (narration, signs, items, keeper notes, sigils) type in silence, with the old key-tap.
 * Starting points: the owner tunes each one by ear on `/blips.html` (queue 6).
 */
import { BLIP_PRESETS, type BlipVoice } from '../core/blips';

export const SPEAKERS: Record<string, BlipVoice> = {
  // Old and worried: wavery, a little high.
  Maren: { ...BLIP_PRESETS.oldWoman, pitch: 275, wobble: 0.4 },
  // Dry and plain: low, flat, unhurried.
  Tobin: { ...BLIP_PRESETS.man, range: 0.35 },
  Pip: BLIP_PRESETS.boy,
  Lark: BLIP_PRESETS.girl,
  // Jovial: a bright mid voice that wanders.
  // Grist (experiment): low and grinding, slow, a stone voice.
  Grist: { ...BLIP_PRESETS.oldMan, pitch: 80, range: 0.3, cutoff: 500, wobble: 0.1 },
  Odo: { ...BLIP_PRESETS.man, pitch: 175, range: 0.9, wave: 'triangle', cutoff: 1500, every: 2 },
};

/** The voice for a page's `who` ("Tobin the Miller" is Tobin: the first word counts), or null for silence. */
export function speakerFor(who: string | undefined): BlipVoice | null {
  if (!who) return null;
  return SPEAKERS[who] ?? SPEAKERS[who.split(' ')[0]] ?? null;
}
