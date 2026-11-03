/**
 * Save files: plain JSON, versioned and validated on load so a corrupt or old save never
 * crashes the game. Storage goes through `KeyValueStore`, so the desktop (Electron) build
 * can swap localStorage for real files without touching game code.
 */

export const SAVE_VERSION = 3;

export interface SaveData {
  version: typeof SAVE_VERSION;
  flags: string[];
  /** Small keys held outside dungeons (v2+; v1 saved known flute songs instead, since removed). */
  keys: number;
  /** The area the game was saved in; continue resumes at its entrance (v3+; before: overworld). */
  area: string;
  /** Items Wren carries, by id (v3+). */
  items: string[];
  /** Progress inside each dungeon, by dungeon id (v3+). */
  dungeons: Record<string, DungeonSave>;
  /** Drinks found and left, by drink id (added within v3; absent means none). */
  drinks: Record<string, { found: number; left: number }>;
  gems: number;
  hp: number;
  maxHp: number;
  hours: number;
  day: number;
  savedAt: number;
}

/** One dungeon's progress, all keyed by the ids in its data (doors, chests, switches, rooms). */
export interface DungeonSave {
  keys: number;
  bossKey: boolean;
  doors: string[];
  chests: string[];
  switches: string[];
  cleared: string[];
  done: boolean;
}

export interface Settings {
  music: boolean;
}

export const DEFAULT_SETTINGS: Settings = { music: true };

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Browser storage. Errors (private mode, quota) are swallowed: losing a save beats crashing. */
export const localStore: KeyValueStore = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/**
 * Parses and validates a save. Returns null for anything unusable. When the format changes,
 * bump SAVE_VERSION and migrate older versions here instead of discarding them.
 */
export function decodeSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  // v1 saved the flute songs the player knew; the flute is gone, so they're just dropped
  // (v1 had no keys). The quest grants the key by its own flag, so nothing gets stuck.
  // v1/v2 had no areas, items or dungeons: they load in the overworld with none.
  if (o.version !== SAVE_VERSION && o.version !== 1 && o.version !== 2) return null;
  if (!Array.isArray(o.flags)) return null;
  const maxHp = isNum(o.maxHp) ? Math.max(2, Math.min(40, Math.round(o.maxHp / 2) * 2)) : 6;
  return {
    version: SAVE_VERSION,
    flags: strings(o.flags),
    keys: count(o.keys),
    area: typeof o.area === 'string' && o.area ? o.area : 'overworld',
    items: strings(o.items),
    dungeons: decodeDungeons(o.dungeons),
    drinks: decodeDrinks(o.drinks),
    gems: isNum(o.gems) ? Math.max(0, Math.min(9999, Math.floor(o.gems))) : 0,
    maxHp,
    hp: isNum(o.hp) ? Math.max(1, Math.min(maxHp, Math.floor(o.hp))) : maxHp,
    hours: isNum(o.hours) ? ((o.hours % 24) + 24) % 24 : 9,
    day: isNum(o.day) ? Math.max(1, Math.floor(o.day)) : 1,
    savedAt: isNum(o.savedAt) ? o.savedAt : 0,
  };
}

function count(v: unknown) {
  return isNum(v) ? Math.max(0, Math.min(99, Math.floor(v))) : 0;
}

function decodeDrinks(v: unknown): Record<string, { found: number; left: number }> {
  const out: Record<string, { found: number; left: number }> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [id, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const d = raw as Record<string, unknown>;
    const found = count(d.found);
    if (found > 0) out[id] = { found, left: Math.min(found, count(d.left)) };
  }
  return out;
}

function decodeDungeons(v: unknown): Record<string, DungeonSave> {
  const out: Record<string, DungeonSave> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [id, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const d = raw as Record<string, unknown>;
    out[id] = {
      keys: count(d.keys),
      bossKey: d.bossKey === true,
      doors: strings(d.doors),
      chests: strings(d.chests),
      switches: strings(d.switches),
      cleared: strings(d.cleared),
      done: d.done === true,
    };
  }
  return out;
}

export function decodeSettings(raw: string | null): Settings {
  try {
    const o = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    return { music: typeof o.music === 'boolean' ? o.music : DEFAULT_SETTINGS.music };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** One save slot (the game has one for now; more slots = more keys). */
export class SaveSlot {
  constructor(private store: KeyValueStore, private key = 'embervale:save:0') {}

  load() {
    return decodeSave(this.store.get(this.key));
  }

  write(data: SaveData) {
    this.store.set(this.key, JSON.stringify(data));
  }

  clear() {
    this.store.remove(this.key);
  }
}
