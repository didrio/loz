// The dev panel (backtick): a plain list down the right edge, with the Default switch pinned under it. The game stands still behind it, toggles flip without closing it, Backtick/Backspace
// close it, save states load (keyboard and mouse), and the pause menu has no Dev tab.
export const fixture = 'field-sword';

export default async function run(t) {
  const { wait, game, until, press, continueGame, step, check } = t;
  await continueGame();
  await until(() => window.embervale.mode === 'play');
  await wait(1000);
  const dev = () => game(() => {
    const g = window.embervale;
    return { open: g.devPanel.isOpen, sprint: g.player.devSpeed, invincible: g.state.invincible, hours: g.state.hours, text: document.querySelector('.devmenu')?.textContent ?? '', pause: g.pauseMenu.isOpen };
  });
  const openDev = async () => {
    await press('Backquote');
    await until(() => window.embervale.devPanel.isOpen, 5000);
  };
  /** The row index of a row, by its text. */
  const rowOf = (name) => game((name) => [...document.querySelectorAll('.devmenu .gmenu-row')].findIndex((r) => r.textContent.includes(name)), name);

  await step('the pause menu has no Dev tab', async () => {
    await press('KeyP');
    await until(() => window.embervale.pauseMenu.isOpen, 5000);
    const text = await game(() => document.querySelector('.gmenu')?.textContent ?? '');
    check(!/Dev/.test(text), `pause menu text: ${text}`);
    await press('KeyP');
    await until(() => !window.embervale.pauseMenu.isOpen, 5000);
  });

  await step('Backtick opens the dev panel and the game stands still', async () => {
    await openDev();
    const a = await dev();
    check(/Dev sprint/.test(a.text) && !a.pause, `panel text: ${a.text}`);
    await wait(1000);
    check((await dev()).hours === a.hours, 'the clock ran while the panel was open');
  });

  await step('toggles flip without closing; Backtick closes', async () => {
    await press('Enter');
    await press('ArrowDown', 2); // past the performance meter, to Invincible
    await press('Enter');
    const m = await dev();
    check(m.open && m.sprint === 5 && m.invincible, `sprint ${m.sprint}, invincible ${m.invincible}, open ${m.open}`);
    await press('Backquote');
    await until(() => !window.embervale.devPanel.isOpen, 5000);
  });

  await step('a drag on the world turns the camera while the panel is open', async () => {
    await openDev();
    const before = await game(() => window.embervale.rig.yaw);
    await t.page.mouse.move(300, 300);
    await t.page.mouse.down();
    await t.page.mouse.move(420, 300, { steps: 6 });
    await t.page.mouse.up();
    await wait(300);
    const after = await game(() => window.embervale.rig.yaw);
    check(Math.abs(after - before) > 0.1, `yaw ${before} -> ${after}`);
    await press('Backquote');
    await until(() => !window.embervale.devPanel.isOpen, 5000);
  });

  await step('Default: shows the defaults and locks the visual rows while on, through a close and reopen; off brings the tweak back; reset puts it back', async () => {
    await openDev();
    const res = () => game(() => [...document.querySelectorAll('.devmenu .gmenu-row')].find((r) => r.textContent.includes('Texture resolution'))?.querySelector('.gmenu-value')?.textContent);
    const resLocked = () => game(() => [...document.querySelectorAll('.devmenu .gmenu-row')].find((r) => r.textContent.includes('Texture resolution'))?.classList.contains('locked'));
    const defaultOn = () => game(() => document.querySelector('.devmenu-pinned .sw')?.classList.contains('on'));
    check(!(await defaultOn()) && (await res()) === '32 / m', `starts with Default off at the default resolution: ${await res()}`);
    const row = await rowOf('Texture resolution');
    await press('ArrowDown', row); // the panel opens on its first row
    await press('ArrowLeft');
    await press('ArrowLeft');
    check((await res()) === '30 / m', `tweaked resolution ${await res()}`);
    await t.page.click('.devmenu-pinned .sw');
    check((await defaultOn()) && (await res()) === '32 / m' && (await resLocked()), `Default on: ${await res()}, locked ${await resLocked()}`);
    await press('ArrowDown', row + 1); // the click selected Default, the last row: down wraps to the first
    await press('ArrowLeft');
    check((await res()) === '32 / m', 'a locked row ignored the change');
    await press('Backquote');
    await until(() => !window.embervale.devPanel.isOpen, 5000);
    await wait(300);
    await openDev();
    check((await defaultOn()) && (await res()) === '32 / m', `reopened: Default ${await defaultOn()}, ${await res()}`);
    await t.page.click('.devmenu-pinned .sw');
    check(!(await defaultOn()) && (await res()) === '30 / m' && !(await resLocked()), `Default off: the tweak is back (${await res()})`);
    await press('ArrowDown', row + 1);
    await press('KeyR'); // the selected row back to its default
    check((await res()) === '32 / m', `after reset ${await res()}`);
    await press('Backquote');
    await until(() => !window.embervale.devPanel.isOpen, 5000);
  });

  await step('the performance meter shows numbers; Copy performance builds a report with the scene, the draw counts and the GPU', async () => {
    await game(() => { window.embervale.showPerf = true; });
    await until(() => /fps/.test(document.querySelector('.perf')?.textContent ?? '') && !document.querySelector('.perf').classList.contains('hidden'), 5000);
    const report = await game(() => window.embervale.performanceReport());
    check(/Scene: overworld/.test(report) && /Draw: \d+ calls, \d+ triangles/.test(report) && /GPU: \S/.test(report) && /Frames \(last second\): [\d.]+ fps/.test(report), `report: ${report}`);
    await game(() => { window.embervale.showPerf = false; });
    await until(() => document.querySelector('.perf').classList.contains('hidden'), 5000);
  });

  await step('Enter on a save state loads the boss door state', async () => {
    await openDev();
    const row = await rowOf('at the boss door');
    check(row >= 3, `boss door row ${row}`);
    await press('ArrowDown', row);
    await press('Enter');
    await until(() => window.embervale.area.id === 'shrine', 20000);
    const g = await game(() => {
      const e = window.embervale;
      const p = e.state.dungeons.get('shrine');
      return { open: e.devPanel.isOpen, bossKey: p.bossKey, bossDoor: p.doors.has('bossDoor'), flasks: [...e.state.flasks.slots], z: e.player.pos.z, mode: e.mode, sigils: [...e.state.flags].filter((f) => f.startsWith('sigil.')).length, hints: [...e.state.flags].filter((f) => f.startsWith('hint.')).length };
    });
    check(!g.open && g.mode === 'play', `panel should close after loading: ${JSON.stringify(g)}`);
    check(g.bossKey && !g.bossDoor, 'boss key held, boss door still shut');
    check(g.flasks.join() === 'life,attack', `flasks ${g.flasks}`);
    check(Math.abs(g.z - -18) < 1.5, `z ${g.z}`);
    check(g.sigils === 4 && g.hints === 4, `notes ${g.hints}, messages ${g.sigils}`);
  });

  await step('the mouse works: click the night state', async () => {
    await openDev();
    const row = await rowOf('night, before the Lamplighter');
    await t.page.click(`.devmenu .gmenu-row >> nth=${row}`);
    await until(() => window.embervale.area.id === 'overworld', 20000);
    const g = await game(() => ({ hours: window.embervale.state.hours, z: window.embervale.player.pos.z, open: window.embervale.devPanel.isOpen }));
    await until(() => window.embervale.activeBoss === null && window.embervale.enemies.list.some((e) => e.alive), 10000);
    check(Math.abs(g.hours - 22) < 0.5 && !g.open && Math.abs(g.z - 100) < 1.5, JSON.stringify(g));
  });

  await step('a state in a streamed region (Sallowmere\'s descent) puts Wren on its ground, not under it', async () => {
    await openDev();
    const row = await rowOf('Sallowmere: the descent');
    await t.page.click(`.devmenu .gmenu-row >> nth=${row}`);
    await until(() => window.embervale.player.pos.z < -330, 20000);
    await wait(1000);
    const g = await game(() => ({ y: window.embervale.player.pos.y, z: window.embervale.player.pos.z, mode: window.embervale.mode, regions: window.embervale.area.loadedRegions }));
    check(Math.abs(g.y - 12) < 0.6 && g.mode === 'play' && g.regions.includes('sallowmere'), JSON.stringify(g));
  });
}
