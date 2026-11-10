import { describe, expect, it } from 'vitest';
import { FrameCap, HitchLog, overlayLines, PerfMeter, perfReport, type PerfFacts, type PerfScene } from './perf';

const facts: PerfFacts = { calls: 1240, triangles: 312456, pixelRatio: 2, width: 2764, height: 1604, display: 'Native', modern: true, shadowMap: 1024 };

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
      '2.0× · 2764×1604 · Native · modern · sh 1024',
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

describe('FrameCap', () => {
  const run = (cap: FrameCap, hz: number, seconds = 3) => {
    let drawn = 0;
    for (let t = 0; t < seconds * 1000; t += 1000 / hz) if (cap.shouldDraw(t)) drawn++;
    return drawn / seconds;
  };

  it('a 120 Hz phone draws 60 frames a second; a 60 Hz or 90 Hz one draws them all', () => {
    expect(run(new FrameCap(true), 120)).toBeCloseTo(60, -1);
    expect(run(new FrameCap(true), 60)).toBeCloseTo(60, -1);
    expect(run(new FrameCap(true), 90)).toBeCloseTo(90, -1);
  });

  it('off (desktop), every frame is drawn', () => {
    expect(run(new FrameCap(false), 144)).toBeCloseTo(144, -1);
  });
});

describe('HitchLog', () => {
  const steady = (log: HitchLog, from: number, frames: number, ms = 1000 / 60) => {
    let t = from;
    for (let i = 0; i < frames; i++) log.frame((t += ms), 2, []);
    return t;
  };

  it('a frame far over the usual is a hitch, with the causes noted in the frame before it', () => {
    const log = new HitchLog();
    let t = steady(log, 0, 60);
    log.frame((t += 70), 55, ['shader']);
    t = steady(log, t, 10);
    log.frame((t += 45), 3, []);
    expect(log.total).toBe(2);
    expect(log.hitches[0]).toMatchObject({ cpuMs: 55, causes: ['shader'] });
    expect(log.hitches[0].gapMs).toBeCloseTo(70);
    expect(log.lines()[0]).toContain('by cause: shader 1, none 1');
    expect(log.lines()[2]).toContain('nothing noted');
  });

  it('ordinary jitter, the first frames, and a page that was away are not hitches', () => {
    const log = new HitchLog();
    log.frame(0, 0, []);
    log.frame(200, 0, []); // still warming up
    let t = steady(log, 200, 60);
    for (let i = 0; i < 30; i++) log.frame((t += i % 2 ? 22 : 12), 2, []); // uneven but normal
    log.frame((t += 5000), 0, []); // the page was hidden
    log.frame((t += 80), 0, [], true);
    expect(log.total).toBe(0);
    expect(log.lines()[0]).toContain('none');
  });

  it('on a 30 fps device, "usual" is 33 ms: a 50 ms frame is not a hitch, 100 ms is', () => {
    const log = new HitchLog();
    let t = steady(log, 0, 60, 33.3);
    log.frame((t += 50), 2, []);
    expect(log.total).toBe(0);
    log.frame((t += 100), 2, ['resolution']);
    expect(log.total).toBe(1);
    expect(log.recent(t, 60)).toBe(1);
  });
});

describe('the meter with hitches', () => {
  it('names the last minute\'s hitches on the first line, only when there are some', () => {
    const facts: PerfFacts = { calls: 1, triangles: 1, pixelRatio: 2, width: 1, height: 1, display: 'Auto', modern: false, shadowMap: 0 };
    const stats = { fps: 60, frameMs: 16.7, worstMs: 80, cpuMs: 3 };
    expect(overlayLines(stats, facts, 3)[0]).toBe('60 fps · 16.7 ms · worst 80 · 3 hitches/min');
    expect(overlayLines(stats, facts, 1)[0]).toContain('1 hitch/min');
    expect(overlayLines(stats, facts)[0]).toBe('60 fps · 16.7 ms · worst 80');
  });
});
