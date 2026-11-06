// The village: Lark and shield surfing, Tobin's mill key, the mill (its door, walking in, the bed), Odo's Stoneward Tunic and flask refills.
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

  await step('a villager talks in blips as the line types; skipping the typing is silent', async () => {
    const p = await at('npc.tobin');
    await teleport(p.x + 1.4, p.z, -Math.PI / 2);
    await game(() => {
      const g = window.embervale;
      window.__blips = 0;
      const talk = g.sfx.talk.bind(g.sfx);
      g.sfx.talk = (...a) => ((window.__blips += 1), talk(...a));
    });
    await press('KeyE');
    await until(() => window.embervale.mode === 'cutscene', 5000);
    await until(() => window.__blips > 0, 5000);
    // Skip the typing (what confirm does mid-page): the rest appears at once, and nothing more blips.
    const skipped = await game(() => {
      window.embervale.hud.finishTyping();
      return window.__blips;
    });
    await wait(600);
    check((await game(() => window.__blips)) === skipped, 'skipping the typing still blipped');
    await finishScript();
    await game(() => {
      const g = window.embervale;
      delete g.sfx.talk; // back to the prototype's method
    });
  });

  await step('the mill door swings open in place; Wren walks in, sleeps (heals, clock to 18:00), and a shut door keeps her in', async () => {
    const MILL = { x: -62 - 22, z: -58 };
    const millDoor = () => window.embervale.area.millDoor.open;
    const fromMill = async () => {
      const s = await state();
      return Math.hypot(s.pos.x - MILL.x, s.pos.z - MILL.z);
    };
    // On the doorstep, facing the door (west).
    await teleport(MILL.x + 5.6, MILL.z, -Math.PI / 2);
    await game(() => (window.embervale.state.hp = 1));
    await press('KeyE');
    await finishScript();
    check(await game(millDoor), 'the door did not open');
    check((await game(() => window.embervale.area.id)) === 'overworld', 'opening the door changed area');
    const { page } = t;
    await page.keyboard.down('KeyW');
    await wait(1600);
    await page.keyboard.up('KeyW');
    check((await fromMill()) < 3.6, `did not walk in (${(await fromMill()).toFixed(1)} m from the middle)`);
    const b = await at('bed.mill');
    await teleport(b.x, b.z, -Math.PI / 2, 3);
    await press('KeyE');
    await until(() => window.embervale.mode === 'cutscene', 5000);
    await finishScript(); // Enter picks "Sleep"
    const s = await game(() => ({ hp: window.embervale.state.hp, max: window.embervale.state.maxHp, h: window.embervale.state.hours }));
    check(s.hp === s.max, `hp ${s.hp}/${s.max}`);
    check(Math.abs(s.h - 18) < 0.1, `hour ${s.h}`);
    // Shut it from inside, then try to walk out through it.
    await teleport(MILL.x + 3.1, MILL.z, Math.PI / 2, 3);
    await press('KeyE');
    await finishScript();
    check(!(await game(millDoor)), 'the door did not shut');
    await page.keyboard.down('KeyW');
    await wait(1500);
    await page.keyboard.up('KeyW');
    check((await fromMill()) < 4, `walked through the shut door (${(await fromMill()).toFixed(1)} m out)`);
    // And out again.
    await press('KeyE');
    await finishScript();
    await page.keyboard.down('KeyW');
    await wait(1800);
    await page.keyboard.up('KeyW');
    check((await fromMill()) > 5, `did not walk back out (${(await fromMill()).toFixed(1)} m)`);
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
