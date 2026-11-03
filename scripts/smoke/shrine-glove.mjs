// The shrine's second half, with the Tether Glove: getting it, pulling a heavy stone onto a
// plate, swinging the Pit Hall's fallen column across, the boss key, the boss door, and the
// shortcut back to the Nave. (Gravelheart itself is milestone 6: its hall is empty for now.)
export const fixture = 'shrine-entry';

export default async function run(t) {
  const { wait, game, until, shot, press, page, finishScript, teleport, continueGame, step, check } = t;
  await continueGame();

  const room = (id) => game((id) => window.embervale.area.def.rooms.find((r) => r.id === id), id);
  const floorY = (r) => r.floor * 8;
  const killIn = (r) => game((r) => {
    for (const e of window.embervale.enemies.list) if (e.pos.x > r.x && e.pos.x < r.x + r.w && e.pos.z > r.z && e.pos.z < r.z + r.d) e.alive = false;
  }, r);
  /** Walks up to a chest (teleport beside it), opens it and reads its message. */
  const openChest = async (id) => {
    const c = await game((id) => window.embervale.area.chests.get(id).group.position, id);
    await until((id) => window.embervale.area.chests.get(id).present && window.embervale.mode === 'play', 30000, id);
    await teleport(c.x, c.z + 1.6, Math.PI, c.y + 2);
    await until(() => document.querySelector('.prompt.show')?.textContent.includes('Open'), 15000);
    await press('KeyE');
    await until((id) => window.embervale.area.chests.get(id).opened, 15000, id);
    await finishScript();
  };

  await step('the Glove Shrine\'s chest gives the Tether Glove (its own moment, a how-to, a HUD slot)', async () => {
    const r = await room('tetherRoom');
    await teleport(r.x + r.w / 2, r.z + r.d - 2, Math.PI, floorY(r) + 2);
    await wait(500);
    await killIn(r);
    await until(() => window.embervale.state.dungeon('shrine').cleared.has('tetherRoom'), 30000);
    await finishScript();
    await openChest('tetherChest');
    check(await game(() => window.embervale.state.items.has('tether')), 'no glove');
    await until(() => !!document.querySelector('.drinks .glove'), 10000).catch(() => {});
    check(await page.isVisible('.drinks .glove'), 'no glove slot in the HUD');
    await shot('01-glove');
  });

  await step('the glove pulls the Stone Loft\'s heavy stone onto its plate: the key chest appears', async () => {
    const r = await room('loft');
    const end = Date.now() + 60000;
    while (!(await game(() => window.embervale.area.switches.get('loftPlate').pressed)) && Date.now() < end) {
      // Two cells east of the stone, in its row (never past the room's east end), facing it.
      const s = await game(() => window.embervale.area.stones.get('loftStone').group.position);
      await teleport(Math.min(s.x + 4, r.x + r.w - 1), s.z, -Math.PI / 2, floorY(r) + 2);
      await wait(150);
      await press('KeyF', 1, 700);
    }
    check(await game(() => window.embervale.area.switches.get('loftPlate').pressed), 'the heavy stone never reached the plate');
    await openChest('loftChest');
  });

  await step('the glove swings the Pit Hall\'s fallen column across the pit, and Wren walks over', async () => {
    const r = await room('pitHall');
    const col = await game(() => { const c = window.embervale.area.columns.get('bridgeStone'); return { x: c.x, z: c.z }; });
    await teleport(r.x + 14, col.z, -Math.PI / 2, floorY(r) + 2); // the near (east) ledge, facing west
    await wait(300);
    await press('KeyF', 1, 400);
    await until(() => { const c = window.embervale.area.columns.get('bridgeStone'); return c.laid && !c.swinging; }, 20000);
    await shot('02-bridge');
    await page.keyboard.down('KeyW');
    await until((x) => window.embervale.player.pos.x < x, 15000, r.x + 3.5).catch(() => {});
    await page.keyboard.up('KeyW');
    const p = await game(() => window.embervale.player.pos);
    check(p.x < r.x + 4 && p.y > floorY(r) - 0.5, `didn't make it across: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}`);
  });

  await step('the Key Vault\'s two hold plates give the boss key; the boss door opens onto Warden\'s Hearth', async () => {
    // The vault's push-and-pull is proven by the puzzle checker and the glove by the steps
    // above: here both plates go down together, as the stones would hold them.
    await game(() => {
      const a = window.embervale.area;
      for (const id of ['vaultPlateA', 'vaultPlateB']) a.switches.get(id).setPressed(true);
      a.onSwitch('vaultPlateA');
      a.onSwitch('vaultPlateB');
    });
    await openChest('bossKeyChest');
    check(await game(() => window.embervale.state.dungeon('shrine').bossKey), 'no boss key');
    const d = await game(() => window.embervale.area.interactables.find((i) => i.id === 'bossDoor'));
    const ante = await room('bossAnte');
    await teleport(d.x, d.z + 1.8, Math.PI, floorY(ante) + 2);
    await until(() => document.querySelector('.prompt.show')?.textContent.includes('Unlock'), 15000).catch(() => {});
    await press('KeyE');
    await until(() => window.embervale.area.doors.get('bossDoor').open, 20000);
    await finishScript();
    await page.keyboard.down('KeyW');
    await until(() => window.embervale.area.roomAt(window.embervale.player.pos)?.id === 'boss', 15000).catch(() => {});
    await page.keyboard.up('KeyW');
    check(await game(() => window.embervale.area.roomAt(window.embervale.player.pos)?.id === 'boss'), 'never got into Warden\'s Hearth');
    await shot('03-boss-room');
  });

  await step('the Barred Cell\'s crystal lifts the bar: the shortcut back to the Nave', async () => {
    const r = await room('northCell');
    const c = await game(() => window.embervale.area.switches.get('northBar').group.position);
    await teleport(c.x, c.z + 1.6, Math.PI, floorY(r) + 2);
    await wait(300);
    await press('KeyJ', 3, 300);
    await until(() => window.embervale.area.doors.get('naveNorth').open || window.embervale.area.doors.get('naveNorth').opening, 20000);
    await finishScript();
  });
}
