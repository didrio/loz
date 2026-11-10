// Touch controls on a landscape phone (ui/touch.ts): the title takes a tap, the stick walks, the sword swings,
// Jump then holding Shield surfs, Interact (its own button) reads Talk near Lark and opens her talk, taps read on, a late tap
// still talks (the button lingers; hit areas are geometry), the floating prompt is tappable, backgrounding pauses, ☰ (top-left)
// and ✕ open and close the pause menu, and a key press hides the controls until the next touch.
export const fixture = 'field-sword';
export const touch = true;

export default async function run(t) {
  const { page, wait, game, until, teleport, boot, step, check } = t;
  const cdp = await page.context().newCDPSession(page);
  // Real multi-touch through Chrome's DevTools protocol: each event lists the fingers still down.
  const fingers = new Map();
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...fingers].map(([id, p]) => ({ id, x: p.x, y: p.y })) });
  const down = (id, x, y) => (fingers.set(id, { x, y }), send('touchStart'));
  const move = (id, x, y) => (fingers.set(id, { x, y }), send('touchMove'));
  const up = (id) => (fingers.delete(id), fingers.size ? send('touchMove') : cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }));
  const center = async (sel) => {
    const b = await page.locator(sel).first().boundingBox();
    if (!b) throw new Error(`${sel} is not on screen`);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const tap = async (sel) => {
    const c = await center(sel);
    await page.touchscreen.tap(c.x, c.y);
  };
  const shown = (sel) => game((sel) => {
    const el = document.querySelector(sel);
    return !!el && !el.closest('.hidden') && getComputedStyle(el).display !== 'none';
  }, sel);
  const g = () => game(() => {
    const e = window.embervale;
    return { mode: e.mode, x: e.player.pos.x, z: e.player.pos.z, surfing: e.player.surfing, speed: e.player.speedXZ, state: e.player.state, menu: e.pauseMenu.isOpen };
  });

  await step('the title takes a tap; play shows the controls', async () => {
    await boot();
    await tap('.menu-item');
    await until(() => window.embervale.mode === 'play', 60000);
    await wait(600);
    for (const sel of ['.tb-attack', '.tb-shield', '.tb-jump', '.tb-lock', '.menu-btn']) check(await shown(sel), `${sel} hidden`);
    check(!(await shown('.tb-item')), 'the glove button shows without the glove');
    check(!(await shown('.tb-interact.show')), 'the interact button shows with nothing to use');
    check(!(await shown('.actions')), 'the keyboard hints should hide on touch');
  });

  await step('the stick walks Wren', async () => {
    await teleport(-40, -38, 0);
    await wait(300);
    const a = await g();
    await down(1, 150, 280);
    await move(1, 150, 210);
    await until(([x, z]) => Math.hypot(window.embervale.player.pos.x - x, window.embervale.player.pos.z - z) > 3, 10000, [a.x, a.z]);
    await up(1);
  });

  await step('Sword swings', async () => {
    const c = await center('.tb-attack');
    await down(2, c.x, c.y);
    await up(2);
    await until(() => window.embervale.player.state === 'attack', 5000);
  });

  await step('Jump, then holding Shield, lands on the shield and rides; letting go steps off', async () => {
    await game(() => window.embervale.state.set('village.surfIdea'));
    await until(() => window.embervale.player.state === 'move', 5000);
    await teleport(-40, -38, 0);
    await wait(300);
    await down(1, 150, 280);
    await move(1, 150, 210);
    const j = await center('.tb-jump');
    await down(3, j.x, j.y);
    await up(3);
    const s = await center('.tb-shield');
    await down(4, s.x, s.y);
    await until(() => window.embervale.player.surfing, 10000);
    await until(() => window.embervale.player.speedXZ > 12, 10000);
    await up(4);
    await until(() => !window.embervale.player.surfing, 5000);
    await up(1);
  });

  await step('near Lark, Interact appears reading Talk (Jump stays Jump) and opens her talk; taps read on', async () => {
    const p = await game(() => {
      const it = window.embervale.area.interactables.find((i) => i.id === 'npc.lark');
      return { x: it.x, z: it.z };
    });
    await teleport(p.x + 1.2, p.z, -Math.PI / 2);
    await until(() => document.querySelector('.tb-interact.show')?.textContent === 'Talk', 5000);
    check((await game(() => document.querySelector('.tb-jump').textContent)) === 'Jump', 'Jump should stay Jump near Lark');
    await tap('.tb-jump');
    await wait(500);
    check((await g()).mode === 'play', 'a Jump tap near Lark started her talk');
    await tap('.tb-interact');
    await until(() => window.embervale.mode === 'cutscene', 5000);
    const end = Date.now() + 45000;
    while ((await g()).mode === 'cutscene') {
      if (Date.now() > end) throw new Error('the talk never ended');
      if (await shown('.choice-row')) await tap('.choice-row');
      else await page.touchscreen.tap(420, 120);
      await wait(250);
    }
  });

  // Read every talk out (a choice row if there is one, else a tap anywhere).
  const finishTalk = async () => {
    const end = Date.now() + 45000;
    while ((await g()).mode === 'cutscene') {
      if (Date.now() > end) throw new Error('the talk never ended');
      if (await shown('.choice-row')) await tap('.choice-row');
      else await page.touchscreen.tap(420, 120);
      await wait(250);
    }
  };
  const lark = () => game(() => {
    const it = window.embervale.area.interactables.find((i) => i.id === 'npc.lark');
    return { x: it.x, z: it.z, r: it.r };
  });

  await step('a late tap: just out of reach, Interact lingers and still talks; a tap just past its rim counts', async () => {
    const p = await lark();
    await teleport(p.x + 1.2, p.z, -Math.PI / 2);
    await until(() => !!document.querySelector('.tb-interact.show'), 5000);
    await wait(200);
    await teleport(p.x + p.r + 0.6, p.z, -Math.PI / 2); // slid out of reach
    await wait(60);
    check(await shown('.tb-interact.show'), 'Interact vanished the moment Lark left reach');
    // Land the finger 12 px past the drawn rim, down-left (toward Shield): geometry, not the element, decides.
    const b = await page.locator('.tb-interact').boundingBox();
    const r = b.width / 2 + 12;
    await down(5, b.x + b.width / 2 - r * Math.SQRT1_2, b.y + b.height / 2 + r * Math.SQRT1_2);
    await up(5);
    await until(() => window.embervale.mode === 'cutscene', 3000);
    await finishTalk();
    // Long after leaving reach, the button is gone and a tap there is a camera drag, not a talk.
    await teleport(p.x + p.r + 6, p.z, -Math.PI / 2);
    await wait(1200);
    check(!(await shown('.tb-interact.show')), 'Interact still showing far from Lark');
  });

  await step('the floating prompt is a button too', async () => {
    const p = await lark();
    await teleport(p.x + 1.2, p.z, -Math.PI / 2);
    await until(() => !!document.querySelector('.prompt.show'), 5000);
    await wait(300);
    // (The title's rows were still tappable after it faded, and caught this tap: hidden for good since T58.)
    check(await game(() => [...document.querySelectorAll('.title .menu-item')].every((m) => getComputedStyle(m).pointerEvents === 'none')), 'the faded title still takes taps');
    await tap('.prompt');
    await until(() => window.embervale.mode === 'cutscene', 3000);
    await finishTalk();
  });

  await step('sent to the background, it comes back paused', async () => {
    await game(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await until(() => window.embervale.pauseMenu.isOpen, 5000);
    await tap('.gmenu-close');
    await until(() => !window.embervale.pauseMenu.isOpen, 5000);
  });

  await step('the bed: Interact reads Sleep, its label is centred, a tapped "Sleep" ends with the controls back and the stick working', async () => {
    const b = await game(() => {
      const it = window.embervale.area.interactables.find((i) => i.id === 'bed.mill');
      return { x: it.x, z: it.z };
    });
    await teleport(b.x, b.z, -Math.PI / 2, 3);
    await until(() => document.querySelector('.tb-interact.show') && document.querySelector('.prompt.show'), 5000);
    const off = await game(() => {
      const p = document.querySelector('.prompt').getBoundingClientRect();
      const l = document.querySelector('.prompt span:not(.key)').getBoundingClientRect();
      return (l.left + l.width / 2) - (p.left + p.width / 2);
    });
    check(Math.abs(off) < 2, `the prompt's label is ${off.toFixed(1)} px off centre`);
    await tap('.tb-interact');
    await until(() => window.embervale.mode === 'cutscene', 5000);
    const end = Date.now() + 60000;
    while ((await g()).mode === 'cutscene') {
      if (Date.now() > end) throw new Error('the sleep never ended');
      if (await shown('.choice-row')) await tap('.choice-row'); // the first row is "Sleep"
      else await page.touchscreen.tap(420, 120);
      await wait(250);
    }
    check(Math.abs((await game(() => window.embervale.state.hours)) - 18) < 0.1, 'she did not sleep');
    await wait(400);
    check(await shown('.tb-attack'), 'the buttons did not come back after sleeping');
    const a = await g();
    await down(1, 150, 280);
    await move(1, 150, 210);
    await until(([x, z]) => Math.hypot(window.embervale.player.pos.x - x, window.embervale.player.pos.z - z) > 1, 10000, [a.x, a.z]);
    await up(1);
  });

  await step('☰ opens the pause menu; tapping Display\'s options switches it (Auto, then back to Native); ✕ closes it', async () => {
    await tap('.menu-btn');
    await until(() => window.embervale.pauseMenu.isOpen, 5000);
    // A finger never hovers (iPhone Safari drops a tap whose pretend mouse move redrew the menu, T70).
    const pick = async (name) => {
      const o = page.locator('.gmenu .seg-opt', { hasText: new RegExp(`^${name}$`) }).first();
      await o.scrollIntoViewIfNeeded();
      const b = await o.boundingBox();
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      await wait(300);
    };
    await pick('Auto');
    check((await game(() => window.embervale.settings.display)) === 3, 'one tap on Auto did not choose it');
    await pick('Native');
    check((await game(() => window.embervale.settings.display)) === 0, 'one tap on Native did not choose it');
    check((await game(() => window.embervale.renderer.getPixelRatio())) === (await game(() => Math.min(2, devicePixelRatio))), 'Native did not restore its ratio');
    await tap('.gmenu-close');
    await until(() => !window.embervale.pauseMenu.isOpen, 5000);
  });

  await step('a key press hides the controls; the next touch brings them back', async () => {
    await page.keyboard.press('KeyW');
    await until(() => document.querySelector('.touch').classList.contains('hidden'), 5000);
    await page.touchscreen.tap(600, 150);
    await until(() => !document.querySelector('.touch').classList.contains('hidden'), 5000);
  });

  await step('a rotation the browser reports late still fills the screen', async () => {
    // Phones (iOS Safari especially) fire `resize` before the new size is known: the canvas once kept its old size and
    // the game showed on the left half, black beside it. Turn the phone while the window still reports the old size,
    // then let it report the real one, with no event after.
    await game(() => {
      window.__stale = { w: innerWidth, h: innerHeight };
      const el = document.documentElement;
      Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => window.__stale?.w ?? el.clientWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => window.__stale?.h ?? el.clientHeight });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300); // the resize events, on the old size
    await game(() => (window.__stale = null));
    await wait(300);
    const fit = await game(() => {
      const c = document.querySelector('#game'), r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, aspect: c.width / c.height };
    });
    check(Math.abs(fit.w - fit.vw) < 2 && Math.abs(fit.h - fit.vh) < 2, `the canvas covers ${fit.w}×${fit.h} of ${fit.vw}×${fit.vh}`);
    check(Math.abs(fit.aspect - fit.vw / fit.vh) < 0.02, `the picture's shape ${fit.aspect.toFixed(3)}, the screen's ${(fit.vw / fit.vh).toFixed(3)}`);
  });
}
