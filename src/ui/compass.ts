/**
 * The compass strip at the top of the screen: N, NE, E... slide past a fixed centre mark as the camera
 * turns, so "southwest of the village" can be followed from where you stand. World axes: +x east,
 * -z north (docs/engine.md), the same in the field and in dungeons.
 */

/** Degrees of view the strip shows, edge to edge. */
export const COMPASS_SPAN = 150;
const LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** The compass bearing (0 = north, 90 = east, 0-360) of a horizontal direction. */
export function bearing(dx: number, dz: number) {
  const deg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** The nearest of the eight directions, for a bearing (handy in tests and the debug readout). */
export function directionName(deg: number) {
  return LABELS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export class Compass {
  private strip: HTMLElement;
  private shown = NaN;

  constructor(readonly el: HTMLElement) {
    // Two and a half turns of ticks (-360..540), so the window never runs off the strip's ends.
    let ticks = '';
    for (let d = -360; d <= 540; d += 15) {
      const left = ((d + 360) / COMPASS_SPAN) * 100;
      const name = d % 45 === 0 ? LABELS[(((d / 45) % 8) + 8) % 8] : '';
      const kind = name === 'N' ? 'north' : name.length === 1 ? 'major' : name ? 'minor' : 'tick';
      ticks += `<span class="cmp-${kind}" style="left:${left}%">${kind === 'tick' ? '' : name}</span>`;
    }
    el.innerHTML = `<div class="cmp-window"><div class="cmp-strip">${ticks}</div></div><div class="cmp-mark"></div>`;
    this.strip = el.querySelector<HTMLElement>('.cmp-strip')!;
  }

  /** The camera's look direction on the ground plane. */
  set(dx: number, dz: number) {
    const deg = Math.round(bearing(dx, dz) * 2) / 2;
    if (deg === this.shown) return;
    this.shown = deg;
    // The strip is laid out in units of the window's width (one window = COMPASS_SPAN degrees).
    // Put `deg` under the centre: shift left by (deg + 360) degrees, then right by half a window.
    this.strip.style.transform = `translateX(${((COMPASS_SPAN / 2 - (deg + 360)) / COMPASS_SPAN) * 100}%)`;
  }
}
