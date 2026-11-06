// The pause menu's Dev tab (P, then Q/E to the last tab): pauses, toggles stay open, Backspace closes, save states load (keyboard and mouse).
export const fixture = 'field-sword';

export default async function run(t) {
  const { wait, game, until, state, press, continueGame, step, check } = t;
  await continueGame();
  await until(() => window.embervale.mode === 'play');
  await wait(1000);
  const menu = () => game(() => {
    const g = window.embervale;
    return { open: g.pauseMenu.isOpen, sprint: g.player.devSpeed, invincible: g.state.invincible, hours: g.state.hours, text: document.querySelector('.gmenu')?.textContent ?? '' };
  });
  /** Opens the pause menu on its Dev tab (the tab before the first, wrapping). */
  const openDev = async () => {
    await press('KeyP');
    await until(() => window.embervale.pauseMenu.isOpen, 5000);
    if (!/Dev sprint/.test((await menu()).text)) await press('KeyQ');
    check(/Dev sprint/.test((await menu()).text), 'the Dev tab did not show');
  };
  /** The row index of a save state, by its name. */
  const rowOf = (name) => game((name) => [...document.querySelectorAll('.gmenu-row')].findIndex((r) => r.textContent.includes(name)), name);

  await step('P then Q opens the Dev tab and the game stands still', async () => {
    await openDev();
    const a = await menu();
    await wait(1000);
    check((await menu()).hours === a.hours, 'the clock ran while the menu was open');
  });

  await step('toggles flip without closing; Backspace closes', async () => {
    await press('Enter');
    await press('ArrowDown');
    await press('Enter');
    const m = await menu();
    check(m.open && m.sprint === 5 && m.invincible, `sprint ${m.sprint}, invincible ${m.invincible}, open ${m.open}`);
    await press('Backspace');
    await until(() => !window.embervale.pauseMenu.isOpen, 5000);
  });

  await step('the menu reopens on the Dev tab; Enter on a save state loads the boss door state', async () => {
    await press('KeyP');
    await until(() => window.embervale.pauseMenu.isOpen, 5000);
    check(/Dev sprint/.test((await menu()).text), 'should reopen on the tab it was left on');
    const row = await rowOf('at the boss door');
    check(row >= 3, `boss door row ${row}`);
    await press('ArrowDown', row);
    await press('Enter');
    await until(() => window.embervale.area.id === 'shrine', 20000);
    const g = await game(() => {
      const e = window.embervale;
      const p = e.state.dungeons.get('shrine');
      return { open: e.pauseMenu.isOpen, bossKey: p.bossKey, bossDoor: p.doors.has('bossDoor'), flasks: [...e.state.flasks.slots], z: e.player.pos.z, mode: e.mode, sigils: [...e.state.flags].filter((f) => f.startsWith('sigil.')).length, hints: [...e.state.flags].filter((f) => f.startsWith('hint.')).length };
    });
    check(!g.open && g.mode === 'play', `menu should close after loading: ${JSON.stringify(g)}`);
    check(g.bossKey && !g.bossDoor, 'boss key held, boss door still shut');
    check(g.flasks.join() === 'life,attack', `flasks ${g.flasks}`);
    check(Math.abs(g.z - -18) < 1.5, `z ${g.z}`);
    check(g.sigils === 4 && g.hints === 4, `notes ${g.hints}, messages ${g.sigils}`);
  });

  await step('the mouse works: click a tab, then the night state', async () => {
    await press('KeyP');
    await until(() => window.embervale.pauseMenu.isOpen, 5000);
    await t.page.click('.gmenu-tab >> text=Dev');
    const row = await rowOf('night, before the Lamplighter');
    await t.page.click(`.gmenu-row >> nth=${row}`);
    await until(() => window.embervale.area.id === 'overworld', 20000);
    const g = await game(() => ({ hours: window.embervale.state.hours, z: window.embervale.player.pos.z, open: window.embervale.pauseMenu.isOpen }));
    await until(() => window.embervale.activeBoss === null && window.embervale.enemies.list.some((e) => e.alive), 10000);
    check(Math.abs(g.hours - 22) < 0.5 && !g.open && Math.abs(g.z - 100) < 1.5, JSON.stringify(g));
  });

  await step('a state in a streamed region (Sallowmere\'s descent) puts Wren on its ground, not under it', async () => {
    await press('KeyP');
    await until(() => window.embervale.pauseMenu.isOpen, 5000);
    await t.page.click('.gmenu-tab >> text=Dev');
    const row = await rowOf('Sallowmere: the descent');
    await t.page.click(`.gmenu-row >> nth=${row}`);
    await until(() => window.embervale.player.pos.z < -330, 20000);
    await wait(1000);
    const g = await game(() => ({ y: window.embervale.player.pos.y, z: window.embervale.player.pos.z, mode: window.embervale.mode, regions: window.embervale.area.loadedRegions }));
    check(Math.abs(g.y - 12) < 0.6 && g.mode === 'play' && g.regions.includes('sallowmere'), JSON.stringify(g));
  });
}
