// The village: Lark and shield surfing, Tobin's mill key, the mill (bed, exit), Odo's Stoneward Tunic and flask refills.
export const fixture = 'field-sword';

export default async function run(t) {
  const { wait, game, until, state, press, finishScript, teleport, continueGame, step, check } = t;
  await continueGame();
  await wait(1500);
  const at = (id) => game((id) => {
    const g = window.embervale;
    const it = g.area.interactables.find((i) => i.id === id);
    return { x: it.x, z: it.z };
  }, id);

  await step('Lark gives the idea; a shield-held landing rides fast, letting go steps off', async () => {
    const p = await at('npc.lark');
    await teleport(p.x + 1.2, p.z, -Math.PI / 2);
    await press('KeyE');
    await until(() => window.embervale.mode === 'cutscene', 5000);
    await finishScript();
    check((await state()).flags.includes('village.surfIdea'), 'no surf idea');
    // Out on the road to the village, running south with the shield held, one jump.
    await teleport(-40, -38, 0);
    await wait(300);
    const { page } = t;
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await press('Space');
    await until(() => window.embervale.player.surfing, 10000);
    await until(() => window.embervale.player.speedXZ > 12, 10000);
    check((await state()).flags.includes('village.surfTried'), 'riding did not set village.surfTried');
    await page.keyboard.up('ShiftLeft');
    await until(() => !window.embervale.player.surfing, 5000);
    await page.keyboard.up('KeyW');
  });

  await step('Tobin gives the mill key once Wren is armed', async () => {
    const p = await at('npc.tobin');
    await teleport(p.x + 1.4, p.z, -Math.PI / 2);
    await press('KeyE');
    await finishScript();
    check((await state()).flags.includes('village.millKey'), 'no mill key');
  });

  await step('the mill door opens onto the inside; sleeping heals and moves the clock to 18:00', async () => {
    const p = await at('door.mill');
    await teleport(p.x + 0.4, p.z, Math.PI / 2);
    await game(() => (window.embervale.state.hp = 1));
    await press('KeyE');
    await until(() => window.embervale.area.id === 'mill', 15000);
    await finishScript();
    check(!(await game(() => window.embervale.combat.playerEnv.canSurf)), 'surfing allowed indoors');
    const b = await at('bed');
    await teleport(b.x, b.z, 0, 2);
    await press('KeyE');
    await until(() => window.embervale.mode === 'cutscene', 5000);
    await finishScript(); // Enter picks "Sleep"
    const s = await game(() => ({ hp: window.embervale.state.hp, max: window.embervale.state.maxHp, h: window.embervale.state.hours }));
    check(s.hp === s.max, `hp ${s.hp}/${s.max}`);
    check(Math.abs(s.h - 18) < 0.1, `hour ${s.h}`);
  });

  await step('the doorway leads back out to the square', async () => {
    const ex = await game(() => window.embervale.area.triggers.find((t) => t.id === 'exit'));
    await teleport(ex.x, ex.z - 2.2, 0, 2);
    await page_walk(t);
    await finishScript();
    const s = await state();
    check(Math.hypot(s.pos.x - (-62 - 22 + 4.4), s.pos.z - -58) < 2.5, `came out at (${s.pos.x.toFixed(1)}, ${s.pos.z.toFixed(1)})`);
  });

  await step('Odo sells the tunic for 50 gems', async () => {
    const p = await at('npc.odo');
    await game(() => (window.embervale.state.gems = 130));
    await teleport(p.x + 0.3, p.z, -Math.PI / 2);
    await press('KeyE');
    await finishScript(); // Enter picks "Buy"
    const r = await game(() => ({ gems: window.embervale.state.gems, has: window.embervale.state.has('village.stonewardTunic') }));
    check(r.has && r.gems === 80, `tunic ${r.has}, gems ${r.gems}`);
  });

  await step('Odo fills an empty flask for 20 gems', async () => {
    await game(() => {
      const s = window.embervale.state;
      s.flasks.add('attack');
      s.flasks.drink(0);
    });
    await press('KeyE');
    await finishScript(); // Enter picks the first potion: Life
    const r = await game(() => ({ gems: window.embervale.state.gems, slots: window.embervale.state.flasks.slots }));
    check(r.slots[0] === 'life' && r.gems === 60, `flask ${r.slots[0]}, gems ${r.gems}`);
  });
}

async function page_walk({ page, until }) {
  await page.keyboard.down('KeyW');
  await until(() => window.embervale.area.id === 'overworld', 15000);
  await page.keyboard.up('KeyW');
}
