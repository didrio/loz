// End-to-end smoke test: starts a dev server, plays through the current quest in headless
// Chrome, checks game state at each step and saves screenshots to smoke-output/.
//
//   npm run smoke                 (uses the installed Google Chrome)
//   CHROME_PATH=/path/to/chrome npm run smoke
//
// Exits non-zero if a step fails or the page logs an error.
import { launch, openGame } from './browser.mjs';

const env = await launch();
const { page, errors, wait, game, until, shot, press, state, finishScript, teleport, boot } = await openGame(
  env,
  new URL('../smoke-output/', import.meta.url).pathname,
);
const url = env.url;

let failed = false;
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed = true;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
};
const check = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

console.log(`Smoke test against ${url}`);

await step('boots to the title menu', async () => {
  await boot();
  await shot('01-title');
});

await step('new game plays the intro, then gives control', async () => {
  await press('Enter');
  check((await state()).mode === 'cutscene', 'intro did not start');
  await finishScript();
  check((await state()).mode === 'play', 'still in cutscene');
  await shot('02-field');
});

await step('walking moves the player along the ground', async () => {
  const a = await state();
  await page.keyboard.down('KeyW');
  await wait(1200);
  await page.keyboard.up('KeyW');
  const b = await state();
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
  const end = Date.now() + 15000;
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

await step('Maren teaches the Song of Waking', async () => {
  const m = await game(() => ({ x: window.embervale.area.npcs.maren.x, z: window.embervale.area.npcs.maren.z }));
  await teleport(m.x + 1.6, m.z + 1.6, Math.atan2(-1.6, -1.6));
  await wait(300);
  await press('KeyE');
  await wait(900);
  await shot('03-maren');
  await finishScript();
  const s = await state();
  check(s.flags.includes('metMaren') && s.songs.includes('waking'), JSON.stringify(s));
});

await step('the grove chest gives the sword', async () => {
  const c = await game(() => ({ x: window.embervale.area.chest.x, z: window.embervale.area.chest.z }));
  await teleport(c.x - 1.6, c.z + 1.6, Math.atan2(1.6, -1.6));
  await wait(300);
  await press('KeyE');
  await wait(1500);
  await shot('04-chest');
  await finishScript();
  check((await state()).flags.includes('hasSword'), 'no sword');
});

await step('Shift raises the shield; blocks cost guard, one too many breaks it, and it only recovers lowered', async () => {
  const hit = (guard) => game((guard) => {
    const g = window.embervale, p = g.player, f = p.forward;
    return g.hitPlayer(p.pos.clone().set(p.pos.x + f.x * 3, p.pos.y, p.pos.z + f.z * 3), { damage: 2, guard });
  }, guard);
  await page.keyboard.down('ShiftLeft');
  await until(() => window.embervale.player.shielding, 5000);
  const hp = (await state()).hp;
  check((await hit(2)) === 'blocked', 'heavy hit was not blocked');
  check((await hit(2)) === 'broken', 'guard did not break');
  check((await state()).hp === hp, 'the breaking hit should still be stopped');
  await until(() => !!document.querySelector('.guard-gauge.broken'), 3000).catch(() => {});
  check(await page.isVisible('.guard-gauge.broken'), 'HUD does not show the broken guard');
  check(!(await game(() => window.embervale.player.shielding)), 'shield still up while broken');
  await until(() => window.embervale.player.shielding, 15000); // the break wears off
  check(await game(() => window.embervale.player.guard.slots === 3), 'guard should have recovered during the break');
  check(await page.isVisible('.guard-gauge.show'), 'the guard gauge should float beside Wren');
  // Hold the shield and take a light hit: no recovery while it stays up.
  check((await hit(1)) === 'blocked', 'light hit was not blocked');
  await wait(2500);
  check(await game(() => window.embervale.player.guard.slots === 2), 'guard recovered with the shield up');
  await page.keyboard.up('ShiftLeft');
  await until(() => window.embervale.player.guard.slots === 3, 15000);
  await until(() => !window.embervale.player.guard.gaugeVisible, 15000); // fades once full
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
  await press('KeyQ');
  check((await state()).lock, 'lock-on found nothing');
  const before = (await state()).enemies;
  await page.keyboard.press('KeyJ');
  await wait(100);
  await shot('05-swing');
  for (let i = 0; i < 12 && (await state()).enemies >= before; i++) await press('KeyJ', 1, 150);
  check((await state()).enemies < before, 'thornling survived');
});

await step('the Song of Waking opens the shrine (with a camera cutscene)', async () => {
  await game(() => window.embervale.enemies.list.forEach((e) => { if (!e.title) e.alive = false; }));
  await teleport(97, 28, Math.PI / 2);
  await wait(300);
  await press('KeyF');
  for (const n of [2, 4, 3, 2, 5]) await press(`Digit${n}`, 1, 260);
  await shot('06-flute');
  // Read the narration until the door starts sinking, then catch the camera mid-cutscene.
  const end = Date.now() + 45000;
  while (!(await game(() => window.embervale.area.door.opening)) && Date.now() < end) await press('Enter', 1, 250);
  await wait(1500);
  await shot('07-door-cutscene');
  await until(() => window.embervale.area.door.open && window.embervale.mode === 'play');
  check((await state()).flags.includes('shrineOpen'), 'flag not set');
});

await step('walking into the open shrine shows the card', async () => {
  await page.keyboard.down('KeyW');
  await until(() => window.embervale.mode === 'cutscene', 15000).catch(() => {});
  await page.keyboard.up('KeyW');
  await wait(300);
  check(await page.isVisible('.card'), 'no card');
  await shot('08-card');
  await press('Enter');
  await until(() => window.embervale.mode === 'play', 5000);
});

await step('the Hollow Lamplighter: intro, fight, phase two, defeat cutscene, heart vessel', async () => {
  await game(() => (window.embervale.state.hours = 16.5));
  await teleport(-23, 116.5, 0); // walk into Gloaming Hollow
  await until(() => window.embervale.mode === 'cutscene', 10000);
  await until(() => window.embervale.mode === 'play' && !!window.embervale.activeBoss, 60000);
  await wait(300);
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
  await until(() => window.embervale.mode === 'cutscene', 5000);
  await wait(1200);
  await shot('13-boss-defeat');
  await finishScript(90000);
  check((await state()).flags.includes('lamplighterDefeated'), 'not marked defeated');
  check(await game(() => window.embervale.area.vessel.visible), 'no heart vessel');
  check(await game(() => !window.embervale.enemies.list.some((e) => e.title)), 'boss still present');
  // Pick up the heart vessel.
  const v = await game(() => ({ x: window.embervale.area.vessel.x, z: window.embervale.area.vessel.z }));
  await game(() => (window.embervale.player.invuln = 0));
  await teleport(v.x, v.z - 2.5, 0);
  await page.keyboard.down('KeyW');
  await until(() => window.embervale.mode === 'cutscene', 10000);
  await page.keyboard.up('KeyW');
  await finishScript();
  check(await game(() => window.embervale.state.maxHp === 8 && window.embervale.state.hp === 8), 'heart vessel did not add a heart');
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

await step('no errors in the console', async () => {
  check(errors.length === 0, errors.join(' | '));
});

await env.close();
console.log(failed ? 'SMOKE FAILED' : 'Smoke passed. Screenshots in smoke-output/');
process.exit(failed ? 1 : 0);
