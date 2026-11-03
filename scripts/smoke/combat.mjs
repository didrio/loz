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
}
