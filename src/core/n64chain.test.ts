import { describe, expect, it } from 'vitest';
import { ROOMS } from './blips';
import { N64_DEFAULT, VoiceLimiter, musicRoom } from './n64chain';
import { compiledSong, type MusicMood } from './tracks';

describe('the note cap', () => {
  it('refuses a note over the cap, frees room as notes end, and never drops what is kept', () => {
    const l = new VoiceLimiter(2);
    expect(l.admit(0, 1)).toBe(true);
    expect(l.admit(0.1, 1)).toBe(true);
    expect(l.admit(0.2, 1)).toBe(false);
    expect(l.admit(0.2, 1, true)).toBe(true);
    expect(l.admit(1.5, 2)).toBe(true); // the first three have ended
    expect(l.dropped).toBe(1);
  });
});

describe('reverb per place', () => {
  it('gets wetter and longer from the fields to a house to a dungeon, and dry at zero', () => {
    const o = musicRoom(ROOMS.outdoors);
    const h = musicRoom(ROOMS.house);
    const d = musicRoom(ROOMS.dungeon);
    expect(o.wet).toBeLessThan(h.wet);
    expect(h.wet).toBeLessThan(d.wet);
    expect(o.seconds).toBeLessThan(h.seconds);
    expect(h.seconds).toBeLessThan(d.seconds);
    expect(musicRoom(ROOMS.dungeon, 0).wet).toBe(0);
  });
});

describe('the default cap leaves the songs whole', () => {
  const moods: MusicMood[] = ['day', 'night', 'village', 'villageNight', 'boss', 'shrine', 'warden', 'blight', 'blightNight', 'blightVillage'];
  it.each(moods)('%s loses almost no notes', (mood) => {
    const song = compiledSong(mood);
    const l = new VoiceLimiter(N64_DEFAULT.voices);
    const KEEP = new Set(['kick', 'snare', 'bass', 'drive']);
    let total = 0;
    for (const e of song.events) {
      total++;
      l.admit(e.at, e.at + Math.max(e.dur, 0.3), KEEP.has(e.inst));
    }
    expect(l.dropped / total).toBeLessThan(0.05);
  });
});
