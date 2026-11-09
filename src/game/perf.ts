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
export function overlayLines(s: PerfStats | null, f: PerfFacts): string[] {
  return [
    s ? `${Math.round(s.fps)} fps · ${one(s.frameMs)} ms · worst ${Math.round(s.worstMs)}` : '… fps',
    s ? `cpu ${one(s.cpuMs)} ms · ${count(f.calls)} calls · ${count(f.triangles)} tris` : `${count(f.calls)} calls · ${count(f.triangles)} tris`,
    `${f.pixelRatio.toFixed(1)}× · ${f.width}×${f.height} · ${f.display}${f.modern ? ' · modern' : ''}`,
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
    `Display: ${f.display}; shadows ${scene.shadows ? 'on' : 'off'}; baked light ${scene.bakedLight ? 'on' : 'off'}; modern lighting ${f.modern ? 'on' : 'off'}`,
    `GPU: ${scene.gpu}`,
    `Dev settings changed from the defaults: ${scene.changed ? `\n${scene.changed}` : 'none'}`,
  ].join('\n');
}
