// The shield's guard and the sword, from the field with the sword in hand.
export const fixture = 'field-sword';

export default async function run(t) {
  const { page, wait, game, until, shot, press, state, teleport, continueGame, step, check } = t;
  await continueGame();
  await step('Shift raises the shield; blocks cost guard, one too many breaks it, and it only recovers lowered', async () => {
    const hit = (guard) => game((guard) => {
      const g = window.embervale, p = g.player, f = p.forward;
      return g.combat.hitPlayer(p.pos.clone().set(p.pos.x + f.x * 3, p.pos.y, p.pos.z + f.z * 3), { damage: 2, guard });
    }, guard);
    await page.keyboard.down('ShiftLeft');
    await until(() => window.embervale.player.shielding, 15000);
    const hp = (await state()).hp;
    check((await hit(2)) === 'blocked', 'heavy hit was not blocked');
    check((await hit(2)) === 'broken', 'guard did not break');
    check((await state()).hp === hp, 'the breaking hit should still be stopped');
    await until(() => !!document.querySelector('.guard-gauge.broken'), 10000).catch(() => {});
    check(await page.isVisible('.guard-gauge.broken'), 'HUD does not show the broken guard');
    check(!(await game(() => window.embervale.player.shielding)), 'shield still up while broken');
    // Staggered: no jumping, and only a crawl (measured after the break's knockback settles).
    await press('Space');
    check(await game(() => window.embervale.player.grounded), 'jumped while staggered');
    await wait(400);
    const a = (await state()).pos;
    await page.keyboard.down('KeyW');
    await wait(800);
    await page.keyboard.up('KeyW');
    const b = (await state()).pos;
    if (await game(() => window.embervale.player.guard.broken > 0)) {
      check(Math.hypot(b.x - a.x, b.z - a.z) < 1, `moved ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(2)} m while staggered`);
    }
    await until(() => window.embervale.player.shielding, 60000); // the break wears off
    check(await game(() => window.embervale.player.guard.slots === 3), 'guard should have recovered during the break');
    check(await page.isVisible('.guard-gauge.show'), 'the guard gauge should float beside Wren');
    // Hold the shield and take a light hit: no recovery while it stays up.
    check((await hit(1)) === 'blocked', 'light hit was not blocked');
    await wait(2500);
    check(await game(() => window.embervale.player.guard.slots === 2), 'guard recovered with the shield up');
    await page.keyboard.up('ShiftLeft');
    await until(() => window.embervale.player.guard.slots === 3, 60000);
    await until(() => !window.embervale.player.guard.gaugeVisible, 60000); // fades once full
  });

  await step('lock-on and sword combo defeat a thornling', async () => {
    await game(() => (window.embervale.state.hours = 10));
    const e = await game(() => {
      const g = window.embervale;
      const t = g.enemies.list.find((x) => x.alive && x.constructor.name === 'Thornling');
      return { x: t.pos.x, z: t.pos.z };
    });
    await teleport(e.x + 3.5, e.z, -Math.PI / 2);
    await wait(200);
    for (let i = 0; i < 10 && !(await state()).lock; i++) await press('KeyQ', 1, 500);
    check((await state()).lock, 'lock-on found nothing');
    const before = (await state()).enemies;
    await page.keyboard.press('KeyJ');
    await wait(100);
    await shot('05-swing');
    const end = Date.now() + 30000;
    while ((await state()).enemies >= before && Date.now() < end) await press('KeyJ', 1, 150);
    check((await state()).enemies < before, 'thornling survived');
  });

  await step('the blight\'s thorns: brushing a clump costs a heart and shoves Wren out of it', async () => {
    await until(() => window.embervale.sky.blight > 0.99 && window.embervale.player.invuln <= 0, 15000);
    const c = await game(() => {
      const g = window.embervale, p = g.player.pos;
      const all = g.area.growths.clusters;
      const near = all.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
      return { x: near.x, z: near.z, r: near.r };
    });
    await teleport(c.x + c.r + 0.2, c.z, -Math.PI / 2); // just inside the reach, facing the clump
    const hp = (await state()).hp;
    await until(() => window.embervale.player.invuln > 0, 5000).catch(() => {});
    const after = await state();
    check(after.hp === hp - 2, `thorns took ${hp - after.hp} half-hearts, not 2`);
    await wait(800);
    const p = (await state()).pos;
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    check(d > c.r + 0.4, `Wren is still in the thorns (${d.toFixed(2)} m from the clump's middle)`);
    await shot('06-thorns');
  });

  await step('the sword fells a thorn clump in five hits, and it stays down (thorn.<id> saved)', async () => {
    const c = await game(() => {
      const g = window.embervale, p = g.player.pos;
      const all = g.area.growths.clusters.filter((k) => k.hp > 0);
      const near = all.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
      return { id: near.id, x: near.x, z: near.z, r: near.r };
    });
    await until(() => window.embervale.player.invuln <= 0, 5000);
    await teleport(c.x + c.r + 1, c.z, -Math.PI / 2); // just clear of the thorns, facing them
    await wait(300);
    const hpOf = () => game((id) => window.embervale.area.growths.clusters.find((k) => k.id === id).hp, c.id);
    const end = Date.now() + 20000;
    while ((await hpOf()) > 0 && Date.now() < end) await press('KeyJ', 1, 500);
    check((await hpOf()) === 0, `the clump still stands (${await hpOf()} hits left)`);
    check(await game((id) => window.embervale.state.has(id), c.id), `${c.id} was not saved`);
    await shot('07-thorns-felled');
    // It no longer hurts (its neighbours on a vein or ring may still overlap its middle, so ask for it by name).
    const touching = await game((c) => {
      const g = window.embervale, y = g.physics.groundY(c.x, c.z, 50) ?? 0;
      return g.area.growths.clusters.some((k) => k.id === c.id && k.hp > 0) || g.area.thornAt(c.x, y, c.z)?.id === c.id;
    }, c);
    check(!touching, 'a felled clump still hurts');
  });

  await step('a scar underfoot costs a heart and shoves Wren out of its middle', async () => {
    await until(() => window.embervale.player.invuln <= 0, 5000);
    const at = { x: -11, z: -73 }; // a knot of the spine vein (SCARS in layout.ts), where the west fork leaves it
    const hp = (await state()).hp;
    await teleport(at.x, at.z, 0);
    await until(() => window.embervale.player.invuln > 0, 5000).catch(() => {});
    check((await state()).hp === hp - 2, `the scar took ${hp - (await state()).hp} half-hearts, not 2`);
    await wait(800);
    const p = (await state()).pos;
    // The same shove as a thorn clump (~0.85 m): out of the vein's middle, to the side she stood on.
    check(Math.hypot(p.x - at.x, p.z - at.z) > 0.6, `Wren was not shoved (${Math.hypot(p.x - at.x, p.z - at.z).toFixed(2)} m)`);
    await shot('08-scar');
  });
}
