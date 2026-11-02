/**
 * Save files: plain JSON, versioned and validated on load so a corrupt or old save never
 * crashes the game. Storage goes through `KeyValueStore`, so the desktop (Electron) build
 * can swap localStorage for real files without touching game code.
 */

export const SAVE_VERSION = 1;

export interface SaveData {
  version: typeof SAVE_VERSION;
  flags: string[];
  songs: string[];
  gems: number;
  hp: number;
  maxHp: number;
  hours: number;
  day: number;
  savedAt: number;
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
  if (o.version !== SAVE_VERSION) return null;
  if (!Array.isArray(o.flags) || !Array.isArray(o.songs)) return null;
  const maxHp = isNum(o.maxHp) ? Math.max(2, Math.min(40, Math.round(o.maxHp / 2) * 2)) : 6;
  return {
    version: SAVE_VERSION,
    flags: strings(o.flags),
    songs: strings(o.songs),
    gems: isNum(o.gems) ? Math.max(0, Math.min(9999, Math.floor(o.gems))) : 0,
    maxHp,
    hp: isNum(o.hp) ? Math.max(1, Math.min(maxHp, Math.floor(o.hp))) : maxHp,
    hours: isNum(o.hours) ? ((o.hours % 24) + 24) % 24 : 9,
    day: isNum(o.day) ? Math.max(1, Math.floor(o.day)) : 1,
    savedAt: isNum(o.savedAt) ? o.savedAt : 0,
  };
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
