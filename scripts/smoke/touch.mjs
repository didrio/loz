// Touch controls on a landscape phone (ui/touch.ts): the title takes a tap, the stick walks, the sword swings,
// Jump then holding Shield surfs, Interact (its own button) reads Talk near Lark and opens her talk, taps read on, ☰ (top-left) and ✕ open and close the
// pause menu, and a key press hides the controls until the next touch.
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

  await step('☰ opens the pause menu, ✕ closes it', async () => {
    await tap('.menu-btn');
    await until(() => window.embervale.pauseMenu.isOpen, 5000);
    await tap('.gmenu-close');
    await until(() => !window.embervale.pauseMenu.isOpen, 5000);
  });

  await step('a key press hides the controls; the next touch brings them back', async () => {
    await page.keyboard.press('KeyW');
    await until(() => document.querySelector('.touch').classList.contains('hidden'), 5000);
    await page.touchscreen.tap(600, 150);
    await until(() => !document.querySelector('.touch').classList.contains('hidden'), 5000);
  });
}
