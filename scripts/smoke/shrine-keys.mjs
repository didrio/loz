// Inside the shrine: a room's enemies and its key chest, a locked door, dying, saving and continuing.
export const fixture = 'shrine-entry';

export default async function run(t) {
  const { page, wait, game, until, shot, press, state, finishScript, teleport, boot, continueGame, step, check } = t;
    const inShrine = (fn, arg) => game(fn, arg);
    const shrineRoom = (id) => game((id) => window.embervale.area.def.rooms.find((r) => r.id === id), id);

    await continueGame();

  await step('a room is cleared once its enemies fall; its chest holds a key (shown in the HUD)', async () => {
    const r = await shrineRoom('southCell');
    await teleport(r.x + r.w / 2, r.z + r.d / 2, Math.PI, 2);
    await wait(500);
    await shot('17-shrine-fight');
    // Beat the room's enemies (stand-ins until the sentinels exist).
    await inShrine((r) => {
      for (const e of window.embervale.enemies.list) if (e.pos.x > r.x && e.pos.x < r.x + r.w && e.pos.z > r.z && e.pos.z < r.z + r.d) e.alive = false;
    }, r);
    await until(() => window.embervale.area.chests.get('southChest').present, 30000);
    await finishScript();
    const c = await inShrine(() => window.embervale.area.chests.get('southChest').group.position);
    await until(() => window.embervale.mode === 'play', 30000);
    await teleport(c.x, c.z + 1.6, Math.PI, 2);
    await until(() => document.querySelector('.prompt.show')?.textContent.includes('Open'), 30000);
    await press('KeyE');
    await until(() => window.embervale.area.chests.get('southChest').opened, 30000);
    await finishScript();
    check(await inShrine(() => window.embervale.state.keysHere === 1), 'no key from the chest: ' + await inShrine(() => { const x = window.embervale; const c = x.area.chests.get('southChest'); return JSON.stringify({ keys: x.state.keysHere, opened: c.opened, present: c.present, mode: x.mode, pos: x.player.pos.toArray().map((v) => +v.toFixed(1)), chest: c.group.position.toArray(), prompt: document.querySelector('.prompt').textContent, show: document.querySelector('.prompt').classList.contains('show') }); }));
    check(await page.isVisible('.keys'), 'key not shown in the HUD');
  });

  await step('the key unlocks a locked door downstairs', async () => {
    // The crypt's door to the Pit Hall (clear the crypt first).
    await inShrine(() => {
      const g = window.embervale;
      for (const e of g.enemies.list) if (g.area.roomAt(e.pos)?.id === 'crypt') e.alive = false;
    });
    const c = await shrineRoom('crypt');
    await teleport(c.x + 1.6, c.z + 16, -Math.PI / 2, -7);
    // Clearing it plays a short reveal (its chest appears): wait for that to finish.
    await until(() => window.embervale.state.dungeon('shrine').cleared.has('crypt'), 30000);
    await finishScript();
    await until(() => window.embervale.mode === 'play', 30000);
    // The prompt updates on game frames: under parallel load that takes well over 300 ms.
    await until(() => document.querySelector('.prompt.show')?.textContent.includes('Unlock'), 15000).catch(() => {});
    check((await page.textContent('.prompt')).includes('Unlock'), 'no Unlock prompt at the locked door: ' + await inShrine(() => { const x = window.embervale; return JSON.stringify({ prompt: document.querySelector('.prompt').textContent, show: document.querySelector('.prompt').classList.contains('show'), mode: x.mode, pos: x.player.pos.toArray().map((v) => +v.toFixed(1)), door: x.area.doors.get('cryptPit').open, keys: x.state.keysHere }); }));
    await press('KeyE');
    await until(() => window.embervale.area.doors.get('cryptPit').opening || window.embervale.area.doors.get('cryptPit').open, 30000);
    await finishScript();
    check(await inShrine(() => window.embervale.state.keysHere === 0 && window.embervale.state.dungeon('shrine').doors.has('cryptPit')), 'key not spent');
  });

  await step('dying in the shrine respawns at its entrance: progress kept, drinks refilled, enemies back', async () => {
    // Find a drink and drink it (key 1), so there's something to refill.
    const enemiesBefore = await inShrine(() => {
      const g = window.embervale;
      g.state.drinks.add('restore');
      g.state.hp = 2;
      return g.area.spawns.filter((s) => s.type !== 'gravelheart').length;
    });
    await until(() => window.embervale.mode === 'play', 30000);
    await press('Digit1');
    await until(() => window.embervale.state.drinks.left.get('restore') === 0, 15000).catch(() => {});
    check(await inShrine(() => window.embervale.state.hp === window.embervale.state.maxHp && window.embervale.state.drinks.left.get('restore') === 0), 'the drink did nothing');
    await inShrine(() => (window.embervale.state.hp = 0));
    await until(() => window.embervale.mode === 'cutscene', 30000);
    await finishScript();
    const s = await state();
    const spawn = await inShrine(() => window.embervale.area.spawn);
    check(Math.hypot(s.pos.x - spawn.x, s.pos.z - spawn.z) < 1.5 && s.hp > 0, `respawned at (${s.pos.x.toFixed(1)}, ${s.pos.z.toFixed(1)})`);
    check(await inShrine(() => window.embervale.state.dungeon('shrine').doors.has('cryptPit') && window.embervale.area.doors.get('cryptPit').open), 'progress lost');
    check(await inShrine(() => window.embervale.state.drinks.left.get('restore') === 1), 'drink not refilled');
    const alive = await inShrine(() => window.embervale.enemies.list.filter((e) => e.alive).length);
    check(alive === enemiesBefore, `${alive} enemies after respawning, expected all ${enemiesBefore}`);
  });

  await step('a game saved in the shrine continues in the shrine', async () => {
    await inShrine(() => window.embervale.save());
    await boot();
    await press('Enter');
    await wait(800);
    const ok = await inShrine(() => {
      const g = window.embervale;
      return g.area.id === 'shrine' && g.mode === 'play' && g.area.doors.get('cryptPit').open;
    });
    check(ok, 'did not resume inside the shrine with its progress');
    await shot('19-shrine-continued');
  });
}
