import { SAVE_VERSION, type DungeonSave, type SaveData } from '../core/save';
import { isBellId, type BellId } from '../world/bell';
import { KEY_COLORS, type KeyColor } from '../world/dungeon/format';
import { Flasks } from './flasks';

/**
 * Quest progress flags. Add new ones here (they're saved by name). Keep names stable once
 * shipped: renaming one would silently drop it from existing saves.
 */
export const FLAGS = ['metMaren', 'hasSword', 'hasShield', 'groveChestOpened', 'shrineOpen', 'lamplighterDefeated', 'hollowVessel', 'gravelheartVessel', 'valleyOpen', 'gotGroveKey', 'village.millKey', 'village.stonewardTunic', 'village.marenBell', 'village.tobinBell', 'village.surfIdea', 'village.surfTried', 'village.scare', 'hint.tunic', 'hint.flasks', 'hint.bells', 'hint.boss'] as const;
/** A broken jar (`jar.<ruin id>.<n>`; world/jars.ts) is saved as a flag by its own id. */
export type Flag = (typeof FLAGS)[number] | `jar.${string}`;

/** Items Wren can carry (the dungeon tools). Saved by id; unknown ids are dropped on load. */
export const ITEMS = ['tether'] as const;
export type Item = (typeof ITEMS)[number];

/**
 * Progress inside one dungeon. Everything is keyed by ids from the dungeon's data, so a new
 * door or chest never needs a hand-added flag.
 */
export class DungeonProgress {
  /** Colored small keys held: each opens one door, and only in this dungeon. Spent when the door opens. */
  readonly keys = new Set<KeyColor>();
  bossKey = false;
  /** Doors opened for good (unlocked, raised by a switch, the boss door). */
  readonly doors = new Set<string>();
  readonly chests = new Set<string>();
  readonly switches = new Set<string>();
  /** Fight rooms whose enemies are beaten. */
  readonly cleared = new Set<string>();
  /** The boss is beaten. */
  done = false;

  toSave(): DungeonSave {
    return {
      keys: [...this.keys], bossKey: this.bossKey,
      doors: [...this.doors], chests: [...this.chests], switches: [...this.switches], cleared: [...this.cleared],
      done: this.done,
    };
  }

  static from(d: DungeonSave) {
    const p = new DungeonProgress();
    Object.assign(p, { bossKey: d.bossKey, done: d.done });
    for (const c of KEY_COLORS) if (d.keys.includes(c)) p.keys.add(c);
    for (const id of d.doors) p.doors.add(id);
    for (const id of d.chests) p.chests.add(id);
    for (const id of d.switches) p.switches.add(id);
    for (const id of d.cleared) p.cleared.add(id);
    return p;
  }
}

/**
 * Everything about a playthrough that gets saved. Mutated in place (never replaced) so
 * systems can hold a reference to it.
 */
export class GameState {
  readonly flags = new Set<Flag>();
  /** Small keys held outside dungeons (each opens one padlock or locked door). */
  keys = 0;
  /** The area Wren is in (saved, so continue resumes there). */
  area = 'overworld';
  readonly items = new Set<Item>();
  readonly dungeons = new Map<string, DungeonProgress>();
  /** Flasks found in chests: emptied by drinking, refilled only at Odo's stall. */
  readonly flasks = new Flasks();
  /**
   * The keepers' bells (docs/bells.md): found at the end of a trial (`carried`, no HUD),
   * then hung on their own post (`hung`, and no longer carried). Two or more hung bells
   * answer each other: ringing one offers to travel to the others.
   */
  readonly bells = { carried: new Set<BellId>(), hung: new Set<BellId>() };
  gems = 0;
  maxHp = 6;
  hp = 6;
  hours = 9;
  day = 1;
  /** Dev menu only (never saved): damage does nothing. */
  invincible = false;

  has(f: Flag) {
    return this.flags.has(f);
  }

  set(f: Flag) {
    this.flags.add(f);
  }

  /** A dungeon's progress (created empty the first time it's asked for). */
  dungeon(id: string) {
    let d = this.dungeons.get(id);
    if (!d) this.dungeons.set(id, (d = new DungeonProgress()));
    return d;
  }

  /** Plain small keys usable where Wren is: the field's, outside dungeons (a dungeon's keys are colored: `dungeonKeysHere`). */
  get keysHere() {
    return this.dungeons.has(this.area) ? 0 : this.area === 'overworld' ? this.keys : 0;
  }

  /** The colored keys Wren holds in the dungeon they're in (empty elsewhere). */
  get dungeonKeysHere(): KeyColor[] {
    return [...(this.dungeons.get(this.area)?.keys ?? [])];
  }

  get isNight() {
    return this.hours < 6 || this.hours >= 18;
  }

  heal(n: number) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  damage(n: number) {
    if (this.invincible) return;
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
    this.keys = 0;
    this.area = 'overworld';
    this.items.clear();
    this.dungeons.clear();
    this.flasks.clear();
    this.bells.carried.clear();
    this.bells.hung.clear();
    this.gems = 0;
    this.maxHp = this.hp = 6;
    this.hours = 9;
    this.day = 1;
  }

  toSave(): SaveData {
    return {
      version: SAVE_VERSION,
      flags: [...this.flags],
      keys: this.keys,
      area: this.area,
      items: [...this.items],
      dungeons: Object.fromEntries([...this.dungeons].map(([id, d]) => [id, d.toSave()])),
      flasks: this.flasks.toSave(),
      bells: { carried: [...this.bells.carried], hung: [...this.bells.hung] },
      gems: this.gems,
      hp: this.hp,
      maxHp: this.maxHp,
      hours: this.hours,
      day: this.day,
      savedAt: Date.now(),
    };
  }

  /** Restores from a (validated) save. Unknown flags, items and bells are dropped. */
  load(d: SaveData) {
    this.reset();
    for (const f of d.flags) if ((FLAGS as readonly string[]).includes(f) || f.startsWith('jar.')) this.flags.add(f as Flag);
    this.keys = d.keys;
    this.area = d.area;
    for (const i of d.items) if ((ITEMS as readonly string[]).includes(i)) this.items.add(i as Item);
    for (const [id, ds] of Object.entries(d.dungeons)) this.dungeons.set(id, DungeonProgress.from(ds));
    this.flasks.load(d.flasks);
    for (const id of d.bells.hung) if (isBellId(id)) this.bells.hung.add(id);
    // A hung bell isn't carried any more (a hand-edited save could say both).
    for (const id of d.bells.carried) if (isBellId(id) && !this.bells.hung.has(id)) this.bells.carried.add(id);
    this.gems = d.gems;
    this.maxHp = d.maxHp;
    // Like the classics: you always continue with at least three hearts.
    this.hp = Math.max(d.hp, Math.min(6, d.maxHp));
    this.hours = d.hours;
    this.day = d.day;
  }
}
