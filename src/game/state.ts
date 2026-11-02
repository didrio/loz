import { SAVE_VERSION, type DungeonSave, type SaveData } from '../core/save';
import { Drinks } from './drinks';

/**
 * Quest progress flags. Add new ones here (they're saved by name). Keep names stable once
 * shipped: renaming one would silently drop it from existing saves.
 */
export const FLAGS = ['metMaren', 'hasSword', 'groveChestOpened', 'shrineOpen', 'lamplighterDefeated', 'hollowVessel', 'gotGroveKey'] as const;
export type Flag = (typeof FLAGS)[number];

/** Items Wren can carry (the dungeon tools). Saved by id; unknown ids are dropped on load. */
export const ITEMS = ['tether'] as const;
export type Item = (typeof ITEMS)[number];

/**
 * Progress inside one dungeon. Everything is keyed by ids from the dungeon's data, so a new
 * door or chest never needs a hand-added flag.
 */
export class DungeonProgress {
  /** Small keys: in genre tradition, a dungeon's keys only open that dungeon's doors. */
  keys = 0;
  bossKey = false;
  /** Doors opened for good (unlocked, raised by a switch, the boss door). */
  readonly doors = new Set<string>();
  readonly chests = new Set<string>();
  readonly switches = new Set<string>();
  /** Fight rooms whose enemies are beaten. */
  readonly cleared = new Set<string>();
  /** Wren has been inside (the seal closed behind them). */
  entered = false;
  /** The boss is beaten: the seal is open for good. */
  done = false;

  toSave(): DungeonSave {
    return {
      keys: this.keys, bossKey: this.bossKey,
      doors: [...this.doors], chests: [...this.chests], switches: [...this.switches], cleared: [...this.cleared],
      entered: this.entered, done: this.done,
    };
  }

  static from(d: DungeonSave) {
    const p = new DungeonProgress();
    Object.assign(p, { keys: d.keys, bossKey: d.bossKey, entered: d.entered, done: d.done });
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
  /** Single-use drinks found in chests (they refill when Wren dies). */
  readonly drinks = new Drinks();
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

  /** A dungeon's progress (created empty the first time it's asked for). */
  dungeon(id: string) {
    let d = this.dungeons.get(id);
    if (!d) this.dungeons.set(id, (d = new DungeonProgress()));
    return d;
  }

  /** Small keys usable where Wren is: the dungeon's own keys inside one, the field's outside. */
  get keysHere() {
    return this.dungeons.get(this.area)?.keys ?? (this.area === 'overworld' ? this.keys : 0);
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
    this.keys = 0;
    this.area = 'overworld';
    this.items.clear();
    this.dungeons.clear();
    this.drinks.clear();
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
      drinks: this.drinks.toSave(),
      gems: this.gems,
      hp: this.hp,
      maxHp: this.maxHp,
      hours: this.hours,
      day: this.day,
      savedAt: Date.now(),
    };
  }

  /** Restores from a (validated) save. Unknown flags are dropped. */
  load(d: SaveData) {
    this.reset();
    for (const f of d.flags) if ((FLAGS as readonly string[]).includes(f)) this.flags.add(f as Flag);
    this.keys = d.keys;
    this.area = d.area;
    for (const i of d.items) if ((ITEMS as readonly string[]).includes(i)) this.items.add(i as Item);
    for (const [id, ds] of Object.entries(d.dungeons)) this.dungeons.set(id, DungeonProgress.from(ds));
    this.drinks.load(d.drinks);
    this.gems = d.gems;
    this.maxHp = d.maxHp;
    // Like the classics: you always continue with at least three hearts.
    this.hp = Math.max(d.hp, Math.min(6, d.maxHp));
    this.hours = d.hours;
    this.day = d.day;
  }
}
