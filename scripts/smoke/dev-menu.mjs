// The dev menu (~): pauses, toggles stay open, Backspace goes back, save states load (keyboard and mouse).
export const fixture = 'field-sword';

export default async function run(t) {
  const { wait, game, until, state, press, continueGame, step, check } = t;
  await continueGame();
  await until(() => window.embervale.mode === 'play');
  await wait(1000);
  const menu = () => game(() => {
    const g = window.embervale;
    return { open: g.devMenu.isOpen, sprint: g.player.devSpeed, invincible: g.state.invincible, hours: g.state.hours };
  });

  await step('~ opens the menu and the game stands still', async () => {
    await press('Backquote');
    await until(() => window.embervale.devMenu.isOpen, 5000);
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
    await until(() => !window.embervale.devMenu.isOpen, 5000);
  });

  await step('save states: Backspace goes back a menu; Enter loads the boss door state', async () => {
    await press('Backquote');
    await press('ArrowDown', 2);
    await press('Enter');
    await press('Backspace');
    check((await menu()).open, 'Backspace from the submenu should return to the dev menu, not close it');
    await press('Enter');
    await press('ArrowDown', 3);
    await press('Enter');
    await until(() => window.embervale.area.id === 'shrine', 20000);
    const g = await game(() => {
      const e = window.embervale;
      const p = e.state.dungeons.get('shrine');
      return { open: e.devMenu.isOpen, bossKey: p.bossKey, bossDoor: p.doors.has('bossDoor'), flasks: [...e.state.flasks.slots], z: e.player.pos.z, mode: e.mode };
    });
    check(!g.open && g.mode === 'play', `menu should close after loading: ${JSON.stringify(g)}`);
    check(g.bossKey && !g.bossDoor, 'boss key held, boss door still shut');
    check(g.flasks.join() === 'life,attack', `flasks ${g.flasks}`);
    check(Math.abs(g.z - -18) < 1.5, `z ${g.z}`);
  });

  await step('the mouse works: click Save states, click the night state', async () => {
    await press('Backquote');
    await t.page.click('.gmenu-row >> nth=2');
    await t.page.click('.gmenu-row >> nth=1');
    await until(() => window.embervale.area.id === 'overworld', 20000);
    const g = await game(() => ({ hours: window.embervale.state.hours, z: window.embervale.player.pos.z, open: window.embervale.devMenu.isOpen }));
    await until(() => window.embervale.activeBoss === null && window.embervale.enemies.list.some((e) => e.alive), 10000);
    check(Math.abs(g.hours - 22) < 0.5 && !g.open && Math.abs(g.z - 100) < 1.5, JSON.stringify(g));
  });
}
