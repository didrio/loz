import { SAVE_VERSION, type SaveData } from '../core/save';
import { SONG_IDS, type SongId } from './songs';

/**
 * Quest progress flags. Add new ones here (they're saved by name). Keep names stable once
 * shipped: renaming one would silently drop it from existing saves.
 */
export const FLAGS = ['metMaren', 'hasSword', 'groveChestOpened', 'shrineOpen', 'lamplighterDefeated', 'hollowVessel'] as const;
export type Flag = (typeof FLAGS)[number];

const STARTING_SONGS: SongId[] = ['hours'];

/**
 * Everything about a playthrough that gets saved. Mutated in place (never replaced) so
 * systems can hold a reference to it.
 */
export class GameState {
  readonly flags = new Set<Flag>();
  readonly songs = new Set<SongId>(STARTING_SONGS);
  gems = 0;
  maxHp = 6;
  hp = 6;
  hours = 9;
  day = 1;

  has(f: Flag) {
    return this.flags.has(f);
  }

  set(f: Flag) {
    this.flags.add(f);
  }

  get isNight() {
    return this.hours < 6 || this.hours >= 18;
  }

  heal(n: number) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  damage(n: number) {
    this.hp = Math.max(0, this.hp - n);
  }

  addGems(n: number) {
    this.gems = Math.min(9999, this.gems + n);
  }

  /** Moves the clock forward, rolling over into the next day. */
  advance(hours: number) {
    this.hours += hours;
    while (this.hours >= 24) {
      this.hours -= 24;
      this.day++;
    }
  }

  reset() {
    this.flags.clear();
    this.songs.clear();
    for (const s of STARTING_SONGS) this.songs.add(s);
    this.gems = 0;
    this.maxHp = this.hp = 6;
    this.hours = 9;
    this.day = 1;
  }

  toSave(): SaveData {
    return {
      version: SAVE_VERSION,
      flags: [...this.flags],
      songs: [...this.songs],
      gems: this.gems,
      hp: this.hp,
      maxHp: this.maxHp,
      hours: this.hours,
      day: this.day,
      savedAt: Date.now(),
    };
  }

  /** Restores from a (validated) save. Unknown flags/songs are dropped. */
  load(d: SaveData) {
    this.reset();
    for (const f of d.flags) if ((FLAGS as readonly string[]).includes(f)) this.flags.add(f as Flag);
    for (const s of d.songs) if ((SONG_IDS as string[]).includes(s)) this.songs.add(s as SongId);
    this.gems = d.gems;
    this.maxHp = d.maxHp;
    // Like the classics: you always continue with at least three hearts.
    this.hp = Math.max(d.hp, Math.min(6, d.maxHp));
    this.hours = d.hours;
    this.day = d.day;
  }
}
