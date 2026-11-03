/**
 * A minimal Standard MIDI File reader (no library). Used by the music import pipeline
 * (`midiImport.ts`, `npm run midi`), never by the game at runtime.
 */

export interface MidiNote {
  /** Start, in beats (quarter notes) from the start of the file. */
  beat: number;
  /** Length in beats. */
  beats: number;
  /** MIDI note number (60 = C4). */
  midi: number;
  vel: number;
}

export interface MidiTrack {
  name: string;
  notes: MidiNote[];
}

export interface MidiFile {
  /** Tempo changes (the file may have none: DAWs often leave it out). */
  tempos: Array<{ beat: number; bpm: number }>;
  /** [numerator, denominator] of the first time signature, if any. */
  timeSig?: [number, number];
  tracks: MidiTrack[];
}

export function parseMidi(buf: Uint8Array): MidiFile {
  let p = 0;
  const u8 = () => buf[p++];
  const u16 = () => (buf[p++] << 8) | buf[p++];
  const u32 = () => buf[p++] * 2 ** 24 + (buf[p++] << 16) + (buf[p++] << 8) + buf[p++];
  const text = (n: number) => {
    const s = String.fromCharCode(...buf.subarray(p, p + n));
    p += n;
    return s;
  };
  const vlq = () => {
    let v = 0;
    let b: number;
    do {
      b = u8();
      v = (v << 7) | (b & 0x7f);
    } while (b & 0x80);
    return v;
  };

  if (text(4) !== 'MThd') throw new Error('Not a MIDI file (no MThd header)');
  u32();
  u16(); // format
  const trackCount = u16();
  const ppq = u16();
  if (ppq & 0x8000) throw new Error('SMPTE time division is not supported');
  const out: MidiFile = { tempos: [], tracks: [] };

  for (let t = 0; t < trackCount; t++) {
    if (text(4) !== 'MTrk') throw new Error(`Track ${t + 1} has no MTrk header`);
    const end = u32() + p;
    let tick = 0;
    let running = 0;
    let name = '';
    const open = new Map<number, { tick: number; vel: number }>();
    const notes: MidiNote[] = [];
    while (p < end) {
      tick += vlq();
      let status = buf[p];
      if (status & 0x80) {
        p++;
        if (status < 0xf0) running = status;
      } else status = running;
      if (status === 0xff) {
        const type = u8();
        const len = vlq();
        const at = p;
        if (type === 0x03) name = text(len);
        else if (type === 0x51) out.tempos.push({ beat: tick / ppq, bpm: 60_000_000 / ((buf[at] << 16) | (buf[at + 1] << 8) | buf[at + 2]) });
        else if (type === 0x58 && !out.timeSig) out.timeSig = [buf[at], 2 ** buf[at + 1]];
        p = at + len;
      } else if (status === 0xf0 || status === 0xf7) {
        p += vlq();
      } else {
        const kind = status & 0xf0;
        const a = u8();
        const b = kind === 0xc0 || kind === 0xd0 ? 0 : u8();
        const key = (status & 0x0f) * 128 + a;
        if (kind === 0x90 && b > 0) open.set(key, { tick, vel: b });
        else if (kind === 0x80 || (kind === 0x90 && b === 0)) {
          const o = open.get(key);
          if (o) {
            notes.push({ beat: o.tick / ppq, beats: (tick - o.tick) / ppq, midi: a, vel: o.vel });
            open.delete(key);
          }
        }
      }
    }
    p = end;
    notes.sort((x, y) => x.beat - y.beat || x.midi - y.midi);
    out.tracks.push({ name, notes });
  }
  return out;
}
