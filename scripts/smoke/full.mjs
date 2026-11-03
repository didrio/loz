// Start to finish: new game, intro, the quest thread, the Lamplighter, the shrine door, the seal.
export const fixture = null;

export default async function run(t) {
  const { page, wait, game, until, shot, press, state, finishScript, teleport, boot, step, check } = t;
  await step('boots to the title menu', async () => {
    await boot();
    await shot('01-title');
  });

  await step('new game plays the intro, then gives control', async () => {
    await press('Enter');
    await until(() => window.embervale.mode === 'cutscene', 30000).catch(() => {});
    check((await state()).mode === 'cutscene', 'intro did not start');
    await finishScript();
    check((await state()).mode === 'play', 'still in cutscene');
    await shot('02-field');
  });

  await step('walking moves the player along the ground', async () => {
    const a = await state();
    await page.keyboard.down('KeyW');
    // Game time runs slower than real time under load: wait for the distance, not a delay.
    const end = Date.now() + 30000;
    let b = await state();
    while (Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) <= 3 && Date.now() < end) {
      await wait(200);
      b = await state();
    }
    await page.keyboard.up('KeyW');
    const moved = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
    check(moved > 3, `moved only ${moved.toFixed(2)} m`);
    const ground = await game(([x, z]) => window.embervale.physics.groundY(x, z), [b.pos.x, b.pos.z]);
    check(Math.abs(b.pos.y - ground) < 0.3, `feet at ${b.pos.y.toFixed(2)}, ground at ${ground.toFixed(2)}`);
  });

  await step('a house blocks the player', async () => {
    // Walk east into the west wall of the house at angle 2.35 in the village.
    const house = await game(() => ({ x: -62 + Math.cos(2.35) * 17, z: -58 + Math.sin(2.35) * 17 }));
    await teleport(house.x - 8, house.z, Math.PI / 2);
    await page.keyboard.down('KeyD');
    await wait(1500);
    await page.keyboard.up('KeyD');
    const s = await state();
    check(Math.hypot(s.pos.x - house.x, s.pos.z - house.z) > 2.5, 'walked into the house');
  });

  await step('the bridge carries the player over the river', async () => {
    const bz = 66 + 16 * Math.sin(-14 * 0.022) + 6 * Math.sin(-14 * 0.061 + 1); // riverZ(-14)
    await teleport(-14, bz - 16, 0); // facing south (+z)
    await page.keyboard.down('KeyW');
    let maxY = -Infinity;
    const end = Date.now() + 60000;
    while ((await state()).pos.z < bz + 12 && Date.now() < end) {
      maxY = Math.max(maxY, (await state()).pos.y);
      await wait(100);
    }
    await page.keyboard.up('KeyW');
    const s = await state();
    check(s.pos.z >= bz + 12, `stuck at z=${s.pos.z.toFixed(1)}`);
    check(maxY > 1.2, `never got onto the deck (max y ${maxY.toFixed(2)})`);
  });

  await step('the edge of the valley stops the player', async () => {
    await teleport(0, 150, 0); // facing south, toward the mountains
    await page.keyboard.down('KeyW');
    await wait(4000);
    await page.keyboard.up('KeyW');
    const s = await state();
    check(Math.hypot(s.pos.x, s.pos.z) < 173.5, `escaped to r=${Math.hypot(s.pos.x, s.pos.z).toFixed(1)}`);
  });

  const inShrine = (fn, arg) => game(fn, arg);
  const chestPos = () => game(() => ({ x: window.embervale.area.chest.x, z: window.embervale.area.chest.z }));

  await step('the grove chest is locked without a key (with an [E] prompt floating over it)', async () => {
    const c = await chestPos();
    await teleport(c.x - 1.6, c.z + 1.6, Math.atan2(1.6, -1.6));
    await until(() => !!document.querySelector('.prompt.show'), 15000);
    await until((w) => document.querySelector('.prompt.show')?.textContent.includes(w), 15000, 'Open').catch(() => {}); // prompts update on game frames
    check((await page.textContent('.prompt')).includes('Open'), 'prompt does not say Open');
    await shot('03-chest-prompt');
    await press('KeyE');
    await finishScript();
    const s = await state();
    check(!s.flags.includes('hasSword') && !(await game(() => window.embervale.area.chest.opened)), 'locked chest opened');
  });

  await step('Maren gives Wren the small key (shown in the HUD)', async () => {
    const m = await game(() => ({ x: window.embervale.area.npcs.maren.x, z: window.embervale.area.npcs.maren.z }));
    await teleport(m.x + 1.6, m.z + 1.6, Math.atan2(-1.6, -1.6));
    await wait(300);
    await press('KeyE');
    await wait(900);
    await shot('04-maren');
    await finishScript();
    const s = await state();
    check(s.flags.includes('metMaren') && s.keys === 1, JSON.stringify(s));
    check(await page.isVisible('.keys'), 'key count not shown');
  });

  await step('the key opens the grove chest: the sword', async () => {
    const c = await chestPos();
    await teleport(c.x - 1.6, c.z + 1.6, Math.atan2(1.6, -1.6));
    await wait(300);
    await press('KeyE');
    await wait(1500);
    await finishScript();
    const s = await state();
    check(s.flags.includes('hasSword') && s.keys === 0, JSON.stringify(s));
    check(!(await page.isVisible('.keys')), 'key count still shown with no keys');
  });

  const doorFront = async () => {
    await game(() => window.embervale.enemies.list.forEach((e) => { if (!e.title) e.alive = false; }));
    const d = await game(() => ({ x: window.embervale.area.door.x, z: window.embervale.area.door.z }));
    await teleport(d.x - 2.2, d.z, Math.PI / 2); // facing east, at the door
    await wait(300);
  };

  await step('the shrine door stays shut before the Lamplighter falls', async () => {
    await doorFront();
    await until((w) => document.querySelector('.prompt.show')?.textContent.includes(w), 15000, 'Check').catch(() => {}); // prompts update on game frames
    check((await page.textContent('.prompt')).includes('Check'), 'door prompt should say Check');
    await press('KeyE');
    await wait(800);
    await shot('06-door-sealed');
    await finishScript();
    check(!(await game(() => window.embervale.area.door.opening)), 'door opened without the lantern');
  });

  await step('the Hollow Lamplighter (night only): intro, fight, phase two, defeat cutscene, heart vessel', async () => {
    // By day the hollow is empty; at nightfall the Lamplighter walks in.
    await game(() => (window.embervale.state.hours = 14));
    await until(() => !window.embervale.enemies.list.some((e) => e.title), 30000);
    await game(() => (window.embervale.state.hours = 21));
    await until(() => window.embervale.enemies.list.some((e) => e.title), 30000);
    await teleport(-23, 116.5, 0); // walk into Gloaming Hollow
    await until(() => window.embervale.mode === 'cutscene', 30000);
    await until(() => window.embervale.mode === 'play' && !!window.embervale.activeBoss, 60000);
    // The bar fades in on game frames: under parallel load that can take well over 300 ms.
    await until(() => !!document.querySelector('.boss-bar') && getComputedStyle(document.querySelector('.boss-bar')).display !== 'none', 15000).catch(() => {});
    check(await page.isVisible('.boss-bar'), 'no boss health bar');
    await game(() => (window.embervale.player.invuln = 1e6)); // headless is too slow to dodge (even value keeps Wren visible)
    await wait(1500);
    await shot('11-boss');
    // Knock it past half health from behind: it howls into phase two and frees its wisps.
    const hurt = (dmg) => game((dmg) => {
      const b = window.embervale.activeBoss;
      const f = b.forward;
      return b.hurt(dmg, b.pos.clone().set(b.pos.x - f.x * 3, b.pos.y, b.pos.z - f.z * 3), 'body');
    }, dmg);
    await until(() => !window.embervale.activeBoss.move, 20000);
    check((await hurt(16)) === 'hit', 'hit from behind was not a hit');
    await until(() => { const b = window.embervale.activeBoss; return b.phase === 2 && b.move?.name !== 'howl'; }, 30000);
    await wait(800);
    await shot('12-boss-phase2');
    await until(() => !window.embervale.activeBoss.move, 20000);
    await game(() => (window.embervale.activeBoss.hp = 1));
    check((await hurt(1)) === 'hit', 'finishing blow did not land');
    await until(() => window.embervale.mode === 'cutscene', 15000);
    await wait(1200);
    await shot('13-boss-defeat');
    await until(() => window.embervale.area.door.awake, 60000);
    await wait(1500);
    await shot('14-door-wakes');
    await finishScript(90000);
    check((await state()).flags.includes('lamplighterDefeated'), 'not marked defeated');
    check(await game(() => window.embervale.area.door.awake), 'the relit lantern did not wake the shrine door');
    check(await game(() => window.embervale.area.vessel.visible), 'no heart vessel');
    check(await game(() => !window.embervale.enemies.list.some((e) => e.title)), 'boss still present');
    // Pick up the heart vessel.
    const v = await game(() => ({ x: window.embervale.area.vessel.x, z: window.embervale.area.vessel.z }));
    await game(() => (window.embervale.player.invuln = 0));
    await teleport(v.x, v.z - 2.5, 0);
    await page.keyboard.down('KeyW');
    await until(() => window.embervale.mode === 'cutscene', 30000);
    await page.keyboard.up('KeyW');
    await finishScript();
    check(await game(() => window.embervale.state.maxHp === 8 && window.embervale.state.hp === 8), 'heart vessel did not add a heart');
  });

  await step('the awakened door opens when Wren interacts with it (with a camera cutscene)', async () => {
    await doorFront();
    await until((w) => document.querySelector('.prompt.show')?.textContent.includes(w), 15000, 'Open').catch(() => {}); // prompts update on game frames
    check((await page.textContent('.prompt')).includes('Open'), 'door prompt should say Open');
    await press('KeyE');
    // Read the narration until the door starts sinking, then catch the camera mid-cutscene.
    const end = Date.now() + 45000;
    while (!(await game(() => window.embervale.area.door.opening)) && Date.now() < end) await press('Enter', 1, 250);
    await wait(1500);
    await shot('07-door-cutscene');
    await until(() => window.embervale.area.door.open && window.embervale.mode === 'play');
    check((await state()).flags.includes('shrineOpen'), 'flag not set');
  });

  await step('night falls and the save survives a reload', async () => {
    await game(() => (window.embervale.state.hours = 21));
    await teleport(10, 0, Math.PI);
    await wait(1200);
    await shot('09-night');
    await game(() => window.embervale.save());
    await boot();
    check(await page.locator('.menu-item').first().textContent() === 'Continue', 'no Continue option');
    await press('Enter');
    await wait(600);
    const s = await state();
    check(s.flags.includes('shrineOpen') && s.flags.includes('hasSword') && s.flags.includes('lamplighterDefeated'), JSON.stringify(s.flags));
    check(await game(() => window.embervale.area.door.open && window.embervale.area.chest.opened), 'world not restored');
    check(await game(() => window.embervale.state.maxHp === 8 && window.embervale.area.hollow.cleared && !window.embervale.enemies.list.some((e) => e.title)), 'boss progress not restored');
    await shot('10-continued');
  });

  await step('walking into the open shrine enters the dungeon (no seal, no cutscene)', async () => {
    await doorFront();
    await page.keyboard.down('KeyW');
    await until(() => window.embervale.area.id === 'shrine', 20000);
    await page.keyboard.up('KeyW');
    await wait(900);
    await shot('16-shrine-entered');
    const ok = await inShrine(() => {
      const g = window.embervale;
      return g.state.area === 'shrine' && g.mode === 'play' && g.area.indoor;
    });
    check(ok, 'not inside the shrine, free to move');
  });
}
