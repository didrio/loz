/**
 * The performance meter (dev panel: "Performance meter"; shown bottom right): frame timing kept over the last second, and the text for the
 * little overlay and for "Copy performance". Pure: the game feeds it timestamps and renderer facts, so the numbers are testable.
 */

/** How long a window of frames the numbers cover, ms. */
const SPAN = 1000;

export interface PerfStats {
  fps: number;
  /** Average time between frames, ms. */
  frameMs: number;
  /** The longest gap between two frames in the window, ms (a hitch shows here before it shows in the average). */
  worstMs: number;
  /** Average time the game's own code spent per frame (update + submitting the draw calls), ms. A frame far longer than this is waiting on the GPU or the screen. */
  cpuMs: number;
}

/** What the renderer and the game say about the frame just drawn. */
export interface PerfFacts {
  calls: number;
  triangles: number;
  pixelRatio: number;
  width: number;
  height: number;
  display: string;
  modern: boolean;
  /** The sun's shadow map side while it draws, else 0. */
  shadowMap: number;
}

export class PerfMeter {
  private times: number[] = [];
  private cpu: number[] = [];

  /** One finished frame: when it started (the animation frame's timestamp, ms) and how long the game's code took, ms. */
  frame(now: number, cpuMs: number) {
    this.times.push(now);
    this.cpu.push(cpuMs);
    while (this.times.length > 2 && now - this.times[0] > SPAN) {
      this.times.shift();
      this.cpu.shift();
    }
  }

  /** The last second's numbers, or null before there are two frames to measure between. */
  stats(): PerfStats | null {
    const n = this.times.length;
    if (n < 2) return null;
    const span = this.times[n - 1] - this.times[0];
    if (span <= 0) return null;
    let worst = 0;
    for (let i = 1; i < n; i++) worst = Math.max(worst, this.times[i] - this.times[i - 1]);
    // The first frame's own cost belongs to the gap before it, which the window doesn't cover.
    const cpu = this.cpu.slice(1);
    return { fps: ((n - 1) * 1000) / span, frameMs: span / (n - 1), worstMs: worst, cpuMs: cpu.reduce((a, b) => a + b, 0) / cpu.length };
  }
}

const one = (v: number) => v.toFixed(1);
const count = (n: number) => (n >= 100000 ? `${Math.round(n / 1000)}k` : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** The overlay's lines (short: it is always on). */
export function overlayLines(s: PerfStats | null, f: PerfFacts, hitchesLastMinute = 0): string[] {
  const hitches = hitchesLastMinute ? ` · ${hitchesLastMinute} hitch${hitchesLastMinute === 1 ? '' : 'es'}/min` : '';
  return [
    s ? `${Math.round(s.fps)} fps · ${one(s.frameMs)} ms · worst ${Math.round(s.worstMs)}${hitches}` : '… fps',
    s ? `cpu ${one(s.cpuMs)} ms · ${count(f.calls)} calls · ${count(f.triangles)} tris` : `${count(f.calls)} calls · ${count(f.triangles)} tris`,
    `${f.pixelRatio.toFixed(2).replace(/0$/, '')}× · ${f.width}×${f.height} · ${f.display}${f.modern ? ' · modern' : ''}${f.shadowMap ? ` · sh ${f.shadowMap}` : ''}`,
  ];
}

/** Everything the report adds beyond the meter: where Wren is, the machine, the settings. Plain facts, gathered by the game. */
export interface PerfScene {
  area: string;
  hours: number;
  position: string;
  gpu: string;
  windowSize: string;
  devicePixelRatio: number;
  geometries: number;
  textures: number;
  programs: number;
  lines: number;
  points: number;
  shadows: boolean;
  bakedLight: boolean;
  /** The dev panel's settings that are not at their defaults ("" for none). */
  changed: string;
  /** The hitch log's lines (`HitchLog.lines`). */
  hitches?: string[];
}

/** The text "Copy performance" puts on the clipboard: the scene and the numbers, to paste to an agent. */
export function perfReport(s: PerfStats | null, f: PerfFacts, scene: PerfScene): string {
  const h = Math.floor(scene.hours) % 24;
  const m = Math.floor((scene.hours % 1) * 60);
  return [
    'Performance',
    `Scene: ${scene.area} at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}, Wren at ${scene.position}`,
    s
      ? `Frames (last second): ${one(s.fps)} fps, ${one(s.frameMs)} ms average, ${one(s.worstMs)} ms worst; game code ${one(s.cpuMs)} ms per frame`
      : 'Frames: not enough yet',
    `Draw: ${f.calls} calls, ${f.triangles} triangles, ${scene.lines} lines, ${scene.points} points; ${scene.geometries} geometries, ${scene.textures} textures, ${scene.programs} programs`,
    `Canvas: ${f.width}×${f.height} px at pixel ratio ${f.pixelRatio.toFixed(2)} (window ${scene.windowSize}, devicePixelRatio ${scene.devicePixelRatio})`,
    `Display: ${f.display}; shadows ${scene.shadows ? `on (map ${f.shadowMap || 'idle'})` : 'off'}; baked light ${scene.bakedLight ? 'on' : 'off'}; modern lighting ${f.modern ? 'on' : 'off'}`,
    `GPU: ${scene.gpu}`,
    `Dev settings changed from the defaults: ${scene.changed ? `\n${scene.changed}` : 'none'}`,
    ...(scene.hitches ?? []),
  ].join('\n');
}

/** On a touch device a screen faster than this (Hz) gets every other frame drawn: a 120 Hz phone plays at 60. */
export const CAP_ABOVE_HZ = 100;

/**
 * The phone frame cap (T58). Mobile games hold 60: a 120 Hz phone drawing every refresh does twice the work for a picture a
 * thumb can't tell apart, and pays in heat, battery and, soon after, the phone slowing itself down. Fed every animation frame's
 * timestamp; says whether to draw this one. It watches the screen's own rate, so a 60 Hz or 90 Hz screen (or a game already
 * slower than the cap) draws every frame.
 */
export class FrameCap {
  private last = -1;
  /** The smoothed time between animation frames, ms. */
  private interval = 1000 / 60;
  private drewLast = false;

  constructor(public enabled: boolean) {}

  shouldDraw(now: number): boolean {
    if (this.last >= 0) {
      const d = now - this.last;
      if (d > 0 && d < 100) this.interval += (d - this.interval) * 0.1; // a long gap (a hitch, the page hidden) says nothing
    }
    this.last = now;
    if (!this.enabled || this.interval > 1000 / CAP_ABOVE_HZ) return (this.drewLast = true);
    this.drewLast = !this.drewLast;
    return this.drewLast;
  }
}

/** What can happen in a frame that might make it long (the hitch log's causes). */
export type HitchCause = 'resolution' | 'shader' | 'upload' | 'area' | 'bake' | 'save' | 'menu';

/** A frame this many times the usual one, or this much longer (ms), whichever is more, is a hitch. */
const HITCH_TIMES = 2.5;
const HITCH_EXTRA_MS = 12;
/** How many frames the "usual" (the median gap) is taken over. */
const USUAL_OVER = 120;
/** How many hitches the report lists. */
const HITCH_KEEP = 30;

export interface Hitch {
  /** Seconds since the page loaded. */
  at: number;
  /** The gap between this frame and the one before, ms. */
  gapMs: number;
  /** How long the game's own code took in the long frame, ms (most of the gap: our code; little of it: the GPU, the browser, garbage collection). */
  cpuMs: number;
  causes: HitchCause[];
}

/**
 * The hitch log (T70): frames much longer than the usual, with what happened in them, for "Copy performance". Stutter is a few
 * long frames, not a low average, so the meter's fps can look fine while play doesn't. Pure: the game feeds each frame's start, the
 * previous frame's code time and the causes it noted during that frame; a long frame with none noted is the browser's own work
 * (usually garbage collection) or the GPU.
 */
export class HitchLog {
  private gaps: number[] = [];
  private usual = 1000 / 60;
  private sinceSort = 0;
  private last = -1;
  readonly hitches: Hitch[] = [];
  private readonly counts = new Map<string, number>();
  total = 0;

  /** At the start of a frame: `now` its timestamp (ms), `cpuMs` and `causes` the previous frame's. `hidden`: the page was away (not a hitch). */
  frame(now: number, cpuMs: number, causes: readonly HitchCause[], hidden = false) {
    const gap = this.last >= 0 ? now - this.last : 0;
    this.last = now;
    if (gap <= 0 || hidden || gap > 2000) return; // the page in the background, or a pause in the debugger
    const limit = Math.max(this.usual * HITCH_TIMES, this.usual + HITCH_EXTRA_MS);
    if (this.gaps.length >= 30 && gap > limit) {
      const h: Hitch = { at: now / 1000, gapMs: gap, cpuMs, causes: [...causes] };
      this.hitches.push(h);
      if (this.hitches.length > HITCH_KEEP) this.hitches.shift();
      this.total++;
      const key = causes.length ? causes.join('+') : 'none';
      this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    } else {
      // Hitches don't move "usual" (a run of them would hide themselves).
      this.gaps.push(gap);
      if (this.gaps.length > USUAL_OVER) this.gaps.shift();
      if (++this.sinceSort >= 15 || this.gaps.length < 30) {
        this.sinceSort = 0;
        const sorted = [...this.gaps].sort((a, b) => a - b);
        this.usual = sorted[sorted.length >> 1];
      }
    }
  }

  /** Hitches in the last `seconds` before `now` (ms). */
  recent(now: number, seconds = 60) {
    let n = 0;
    for (const h of this.hitches) if (now / 1000 - h.at <= seconds) n++;
    return n;
  }

  /** The report's lines: the usual frame, counts by cause, then the latest hitches. */
  lines(): string[] {
    if (!this.total) return [`Hitches: none (usual frame ${this.usual.toFixed(1)} ms)`];
    const by = [...this.counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
    return [
      `Hitches: ${this.total} (frames over ${HITCH_TIMES}× the usual ${this.usual.toFixed(1)} ms); by cause: ${by}`,
      ...this.hitches.map((h) => `  ${h.at.toFixed(1)} s: ${Math.round(h.gapMs)} ms (code ${h.cpuMs.toFixed(1)} ms) ${h.causes.length ? h.causes.join(', ') : 'nothing noted (garbage collection, the GPU or the browser)'}`),
    ];
  }
}
