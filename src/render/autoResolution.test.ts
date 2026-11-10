import { describe, expect, it } from 'vitest';
import { AUTO_LOW_FPS, AutoResolution, autoLevels } from './autoResolution';

/**
 * Runs `seconds` of frames on a pretend device: `cost(ratio)` is the time a frame takes to draw (ms), shown at the next
 * vsync of a `hz` screen. Returns the controller and the ratios it used, one sample per second.
 */
function run(cost: (ratio: number) => number, seconds: number, { max = 2, hz = 60, auto = new AutoResolution(max) } = {}) {
  const vsync = 1000 / hz;
  const samples: number[] = [];
  let t = 0;
  let nextSample = 1000;
  while (t < seconds * 1000) {
    t += Math.ceil(cost(auto.ratio) / vsync - 1e-9) * vsync;
    auto.frame(t);
    if (t >= nextSample) {
      samples.push(auto.ratio);
      nextSample += 1000;
    }
  }
  return { auto, samples };
}

/** A fill-bound phone: the frame costs a little game code plus a lot per pixel (∝ ratio²). */
const fillBound = (perPixel: number) => (r: number) => 4 + perPixel * r * r;

describe('autoLevels', () => {
  it('quarter steps from 1 up to the screen cap; a 1× screen has only 1', () => {
    expect(autoLevels(2)).toEqual([1, 1.25, 1.5, 1.75, 2]);
    expect(autoLevels(1.5)).toEqual([1, 1.25, 1.5]);
    expect(autoLevels(1.6)).toEqual([1, 1.25, 1.5, 1.6]);
    expect(autoLevels(1)).toEqual([1]);
  });
});

describe('AutoResolution', () => {
  it('a device with room stays at full sharpness and never changes', () => {
    const { auto, samples } = run(fillBound(2), 60);
    expect(samples.every((r) => r === 2)).toBe(true);
    expect(auto.changes).toBe(0);
  });

  it('a fill-bound phone settles quickly on the sharpest level that holds 60, then stays', () => {
    // 4 + 6r² ms: 2× is 28 ms (35 fps), 1.5× is 17.5 (~57 at 60 Hz: a frame just misses vsync), 1.25× is 13.4 ms (60).
    const { auto, samples } = run(fillBound(6), 120);
    const settled = samples.slice(8);
    expect(settled.filter((r) => r === 1.25).length / settled.length).toBeGreaterThan(0.9); // the rest: brief probes up
    expect(settled.every((r) => r >= 1.25)).toBe(true); // never lower than it needs
    expect(samples.findIndex((r) => r === 1.25)).toBeLessThan(8); // within a few seconds of the start's rest (2.5 s)
    expect(auto.changes).toBeLessThan(14); // a few probes up over two minutes, each backed off longer
  });

  it('a step up that drops frames goes back, and is tried again less and less often', () => {
    const { samples } = run(fillBound(6), 600);
    const tries = samples.filter((r, i) => i > 10 && r > 1.25).length;
    expect(tries).toBeLessThan(12); // ~10 minutes: tries at ~15 s, 30 s, 60 s, 120 s, 240 s (a couple of seconds each)
  });

  it('when the pixels are not the bottleneck (slow game code), it keeps full sharpness', () => {
    const cpuBound = () => 26; // ~38 fps whatever the resolution
    const { samples } = run(cpuBound, 120);
    const sharp = samples.filter((r) => r === 2).length;
    expect(sharp / samples.length).toBeGreaterThan(0.85); // a probe down, longer apart each time
  });

  it('a phone in low-power mode (a 30 Hz screen) keeps full sharpness', () => {
    const { samples } = run(fillBound(2), 120, { hz: 30 });
    const sharp = samples.filter((r) => r === 2).length;
    expect(sharp / samples.length).toBeGreaterThan(0.85);
  });

  it('a phone too slow even at 1× sits at 1× without flapping', () => {
    const { auto, samples } = run(fillBound(20), 120); // 1× = 24 ms: ~41 fps
    expect(samples.slice(10).every((r) => r === 1)).toBe(true);
    expect(auto.changes).toBeLessThan(6);
    expect(1000 / 24).toBeLessThan(AUTO_LOW_FPS);
  });

  it('a long gap between frames (a load, the page hidden) is not judged as slowness', () => {
    const auto = new AutoResolution(2);
    let t = 0;
    for (let i = 0; i < 120; i++) auto.frame((t += 1000 / 60));
    auto.frame((t += 5000)); // hidden for five seconds
    for (let i = 0; i < 120; i++) auto.frame((t += 1000 / 60));
    expect(auto.ratio).toBe(2);
    expect(auto.changes).toBe(0);
  });

  it('the slow frames right after an area loads are not judged', () => {
    const auto = new AutoResolution(2);
    let t = 0;
    for (let i = 0; i < 60; i++) auto.frame((t += 40)); // 25 fps for 2.4 s: shaders building
    for (let i = 0; i < 120; i++) auto.frame((t += 1000 / 60));
    expect(auto.changes).toBe(0);
    auto.rest();
    for (let i = 0; i < 60; i++) auto.frame((t += 40));
    expect(auto.changes).toBe(0);
  });

  it('another screen (a new cap) starts again from its top', () => {
    const { auto } = run(fillBound(6), 30);
    expect(auto.ratio).toBeLessThan(2);
    auto.setMax(3);
    expect(auto.ratio).toBe(3);
    auto.setMax(3);
    expect(auto.ratio).toBe(3);
  });
});
