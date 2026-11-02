import { describe, expect, it } from 'vitest';
import { Director } from './director';

/** Lets pending promise continuations run, like the gap between two frames. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Director', () => {
  it('resolves waits on game time, not wall time', async () => {
    const d = new Director();
    let done = false;
    void d.wait(1).then(() => (done = true));
    d.update(0.5);
    await flush();
    expect(done).toBe(false);
    d.update(0.6);
    await flush();
    expect(done).toBe(true);
  });

  it('runs a script step by step', async () => {
    const d = new Director();
    const log: string[] = [];
    let flag = false;
    void (async () => {
      log.push('start');
      await d.wait(0.1);
      log.push('waited');
      await d.until(() => flag);
      log.push('condition');
      await d.tween(0.2, (p) => log.push(`tween ${p.toFixed(1)}`));
      log.push('end');
    })();
    for (let i = 0; i < 10; i++) {
      if (i === 3) flag = true;
      d.update(0.1);
      await flush();
    }
    expect(log).toEqual(['start', 'waited', 'condition', 'tween 0.5', 'tween 1.0', 'end']);
    expect(d.busy).toBe(false);
  });
});
