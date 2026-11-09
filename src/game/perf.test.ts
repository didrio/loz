import { describe, expect, it } from 'vitest';
import { overlayLines, PerfMeter, perfReport, type PerfFacts, type PerfScene } from './perf';

const facts: PerfFacts = { calls: 1240, triangles: 312456, pixelRatio: 2, width: 2764, height: 1604, display: 'Native', modern: true };

describe('PerfMeter', () => {
  it('says nothing until there are two frames', () => {
    const m = new PerfMeter();
    expect(m.stats()).toBeNull();
    m.frame(0, 3);
    expect(m.stats()).toBeNull();
  });

  it('reads 60 fps from frames 1/60 s apart, and the game code time', () => {
    const m = new PerfMeter();
    for (let i = 0; i < 40; i++) m.frame(i * (1000 / 60), 4);
    const s = m.stats()!;
    expect(s.fps).toBeCloseTo(60, 3);
    expect(s.frameMs).toBeCloseTo(16.667, 2);
    expect(s.worstMs).toBeCloseTo(16.667, 2);
    expect(s.cpuMs).toBeCloseTo(4);
  });

  it('shows a hitch in the worst frame before it moves the average much', () => {
    const m = new PerfMeter();
    let t = 0;
    for (let i = 0; i < 30; i++) m.frame((t += 16.7), 4);
    m.frame((t += 90), 4);
    for (let i = 0; i < 20; i++) m.frame((t += 16.7), 4);
    const s = m.stats()!;
    expect(s.worstMs).toBeCloseTo(90);
    expect(s.fps).toBeGreaterThan(50);
  });

  it('forgets frames older than a second', () => {
    const m = new PerfMeter();
    for (let i = 0; i < 60; i++) m.frame(i * 100, 2); // 10 fps for six seconds
    for (let i = 0; i < 120; i++) m.frame(6000 + i * 10, 2); // then 100 fps, for longer than the window
    expect(m.stats()!.fps).toBeGreaterThan(95);
  });
});

describe('the overlay and the report', () => {
  const stats = { fps: 58.2, frameMs: 17.2, worstMs: 24.4, cpuMs: 6.14 };

  it('the overlay is three short lines', () => {
    expect(overlayLines(stats, facts)).toEqual([
      '58 fps · 17.2 ms · worst 24',
      'cpu 6.1 ms · 1240 calls · 312k tris',
      '2.0× · 2764×1604 · Native · modern',
    ]);
  });

  it('the overlay copes with no stats yet', () => {
    expect(overlayLines(null, { ...facts, modern: false })[0]).toBe('… fps');
  });

  it('the report carries the scene, the numbers and the changed settings', () => {
    const scene: PerfScene = {
      area: 'overworld', hours: 9.5, position: '10, 2, -4', gpu: 'ANGLE (Apple, Metal)', windowSize: '1382×802', devicePixelRatio: 2,
      geometries: 1830, textures: 41, programs: 22, lines: 0, points: 5200, shadows: true, bakedLight: true, changed: 'Exposure: 1.30 (default 1.00)',
    };
    const text = perfReport(stats, facts, scene);
    expect(text).toContain('Scene: overworld at 09:30, Wren at 10, 2, -4');
    expect(text).toContain('58.2 fps, 17.2 ms average, 24.4 ms worst; game code 6.1 ms per frame');
    expect(text).toContain('Draw: 1240 calls, 312456 triangles');
    expect(text).toContain('modern lighting on');
    expect(text).toContain('GPU: ANGLE (Apple, Metal)');
    expect(text).toContain('Exposure: 1.30 (default 1.00)');
    expect(perfReport(null, facts, { ...scene, changed: '' })).toContain('changed from the defaults: none');
  });
});
