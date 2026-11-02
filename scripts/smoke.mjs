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

const chestPos = () => game(() => ({ x: window.embervale.area.chest.x, z: window.embervale.area.chest.z }));

await step('the grove chest is locked without a key (with an [E] prompt floating over it)', async () => {
  const c = await chestPos();
  await teleport(c.x - 1.6, c.z + 1.6, Math.atan2(1.6, -1.6));
  await until(() => !!document.querySelector('.prompt.show'), 5000);
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

const doorFront = async () => {
  await game(() => window.embervale.enemies.list.forEach((e) => { if (!e.title) e.alive = false; }));
  const d = await game(() => ({ x: window.embervale.area.door.x, z: window.embervale.area.door.z }));
  await teleport(d.x - 2.2, d.z, Math.PI / 2); // facing east, at the door
  await wait(300);
};

await step('the shrine door stays shut before the Lamplighter falls', async () => {
  await doorFront();
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
  await until(() => !window.embervale.enemies.list.some((e) => e.title), 5000);
  await game(() => (window.embervale.state.hours = 21));
  await until(() => window.embervale.enemies.list.some((e) => e.title), 5000);
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
  await until(() => window.embervale.mode === 'cutscene', 10000);
  await page.keyboard.up('KeyW');
  await finishScript();
  check(await game(() => window.embervale.state.maxHp === 8 && window.embervale.state.hp === 8), 'heart vessel did not add a heart');
});

await step('the awakened door opens when Wren interacts with it (with a camera cutscene)', async () => {
  await doorFront();
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

const inShrine = (fn, arg) => game(fn, arg);
const shrineRoom = (id) => game((id) => window.embervale.area.def.rooms.find((r) => r.id === id), id);

await step('walking into the open shrine enters the dungeon, and the seal closes behind Wren', async () => {
  await doorFront();
  await page.keyboard.down('KeyW');
  await until(() => window.embervale.area.id === 'shrine', 20000);
  await page.keyboard.up('KeyW');
  await until(() => window.embervale.area.entranceDoor.closing || !window.embervale.area.entranceDoor.open, 20000);
  await wait(900);
  await shot('16-shrine-seal');
  await finishScript();
  const ok = await inShrine(() => {
    const g = window.embervale;
    return g.state.area === 'shrine' && g.state.dungeon('shrine').entered && !g.area.entranceDoor.open && g.area.indoor;
  });
  check(ok, 'not sealed inside the shrine');
});

await step('the sword slides the doorway stone aside, and the nave\'s stone onto its plate opens the stairwell', async () => {
  // Clear just these two rooms (beating every enemy would clear the fight rooms ahead too).
  await inShrine(() => {
    const g = window.embervale;
    for (const e of g.enemies.list) if (['entry', 'nave'].includes(g.area.roomAt(e.pos)?.id)) e.alive = false;
  });
  /** One strike at a stone; waits until it has actually moved a cell and come to rest. */
  const swing = async (id) => {
    await until(() => window.embervale.mode === 'play', 10000);
    const before = await inShrine((id) => JSON.stringify(window.embervale.area.stoneCell(id)), id);
    await press('KeyJ');
    await until(([id, before]) => JSON.stringify(window.embervale.area.stoneCell(id)) !== before && !window.embervale.area.stones.get(id).moving, 8000, [id, before]);
    await wait(150);
  };
  // South of the doorway stone, facing north: one strike slides it clear.
  const e = await inShrine(() => window.embervale.area.stones.get('entryStone').group.position);
  await teleport(e.x, e.z + 2.4, Math.PI, 2);
  await wait(300);
  await swing('entryStone');
  check(await inShrine(() => window.embervale.area.stoneCell('entryStone').j === 2), 'doorway stone did not move');
  await shot('17a-shrine-doorway');
  // West of the nave's stone, facing east: three strikes onto the plate.
  for (let k = 0; k < 3; k++) {
    const n = await inShrine(() => window.embervale.area.stones.get('naveStone').group.position);
    await teleport(n.x - 2.4, n.z, Math.PI / 2, 2);
    await wait(300);
    await swing('naveStone');
  }
  await until(() => window.embervale.area.switches.get('navePlate').pressed, 5000).catch(async () => {
    throw new Error('plate not pressed: ' + await inShrine(() => { const x = window.embervale; return JSON.stringify({ cell: x.area.stoneCell('naveStone'), entry: x.area.stoneCell('entryStone'), mode: x.mode, pos: x.player.pos.toArray().map((v) => +v.toFixed(1)), facing: +x.player.facing.toFixed(2), near: x.enemies.list.filter((e) => e.alive && e.pos.distanceTo(x.player.pos) < 6).map((e) => e.pos.toArray().map((v) => +v.toFixed(1))) }); }));
  });
  await until(() => window.embervale.area.doors.get('naveEast').opening || window.embervale.area.doors.get('naveEast').open, 10000);
  await finishScript();
  await shot('17b-shrine-plate');
  check(await inShrine(() => window.embervale.state.dungeon('shrine').switches.has('navePlate')), 'plate not saved');
});

await step('a fight room shutters until its enemies fall; its chest holds a key (shown in the HUD)', async () => {
  const r = await shrineRoom('southCell');
  await teleport(r.x + r.w / 2, r.z + r.d / 2, Math.PI, 2);
  await until(() => window.embervale.area.shutters.get('southCell').every((s) => s.closing || !s.open), 10000);
  await wait(500);
  await shot('17-shrine-fight');
  // Beat the room's enemies (stand-ins until the sentinels exist).
  await inShrine((r) => {
    for (const e of window.embervale.enemies.list) if (e.pos.x > r.x && e.pos.x < r.x + r.w && e.pos.z > r.z && e.pos.z < r.z + r.d) e.alive = false;
  }, r);
  await until(() => window.embervale.area.chests.get('southChest').present, 10000);
  await finishScript();
  const c = await inShrine(() => window.embervale.area.chests.get('southChest').group.position);
  await until(() => window.embervale.mode === 'play', 10000);
  await teleport(c.x, c.z + 1.6, Math.PI, 2);
  await until(() => document.querySelector('.prompt.show')?.textContent.includes('Open'), 10000);
  await press('KeyE');
  await until(() => window.embervale.area.chests.get('southChest').opened, 10000);
  await finishScript();
  check(await inShrine(() => window.embervale.state.keysHere === 1), 'no key from the chest: ' + await inShrine(() => { const x = window.embervale; const c = x.area.chests.get('southChest'); return JSON.stringify({ keys: x.state.keysHere, opened: c.opened, present: c.present, mode: x.mode, pos: x.player.pos.toArray().map((v) => +v.toFixed(1)), chest: c.group.position.toArray(), prompt: document.querySelector('.prompt').textContent, show: document.querySelector('.prompt').classList.contains('show') }); }));
  check(await page.isVisible('.keys'), 'key not shown in the HUD');
});

await step('the key unlocks a locked door downstairs', async () => {
  // The crypt's door to the Pit Hall (clear the crypt first: it's a fight room).
  await inShrine(() => {
    const g = window.embervale;
    for (const e of g.enemies.list) if (g.area.roomAt(e.pos)?.id === 'crypt') e.alive = false;
  });
  const c = await shrineRoom('crypt');
  await teleport(c.x + 1.6, c.z + 16, -Math.PI / 2, -7);
  // Clearing it plays a short reveal (its chest appears): wait for that to finish.
  await until(() => window.embervale.state.dungeon('shrine').cleared.has('crypt'), 10000);
  await finishScript();
  await until(() => window.embervale.mode === 'play', 10000);
  await wait(300);
  check((await page.textContent('.prompt')).includes('Unlock'), 'no Unlock prompt at the locked door: ' + await inShrine(() => { const x = window.embervale; return JSON.stringify({ prompt: document.querySelector('.prompt').textContent, show: document.querySelector('.prompt').classList.contains('show'), mode: x.mode, pos: x.player.pos.toArray().map((v) => +v.toFixed(1)), door: x.area.doors.get('cryptPit').open, keys: x.state.keysHere }); }));
  await press('KeyE');
  await until(() => window.embervale.area.doors.get('cryptPit').opening || window.embervale.area.doors.get('cryptPit').open, 10000);
  await finishScript();
  check(await inShrine(() => window.embervale.state.keysHere === 0 && window.embervale.state.dungeon('shrine').doors.has('cryptPit')), 'key not spent');
});

await step('striking the crystal with the sword raises the barred door', async () => {
  const c = await inShrine(() => window.embervale.area.switches.get('northBar').group.position);
  await teleport(c.x - 1.6, c.z, Math.PI / 2, 2);
  await wait(300);
  for (let i = 0; i < 6 && !(await inShrine(() => window.embervale.area.switches.get('northBar').pressed)); i++) await press('KeyJ', 1, 300);
  await until(() => window.embervale.area.doors.get('naveNorth').opening || window.embervale.area.doors.get('naveNorth').open, 10000);
  await finishScript();
  await shot('18-shrine-crystal');
});

await step('dying in the shrine respawns at its entrance: progress kept, drinks refilled, enemies back', async () => {
  // Find a drink and drink it (key 1), so there's something to refill.
  const enemiesBefore = await inShrine(() => {
    const g = window.embervale;
    g.state.drinks.add('restore');
    g.state.hp = 2;
    return g.area.spawns.filter((s) => s.type !== 'gravelheart').length;
  });
  await until(() => window.embervale.mode === 'play', 10000);
  await press('Digit1');
  await until(() => window.embervale.state.drinks.left.get('restore') === 0, 5000).catch(() => {});
  check(await inShrine(() => window.embervale.state.hp === window.embervale.state.maxHp && window.embervale.state.drinks.left.get('restore') === 0), 'the drink did nothing');
  await inShrine(() => (window.embervale.state.hp = 0));
  await until(() => window.embervale.mode === 'cutscene', 10000);
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
    return g.area.id === 'shrine' && g.mode === 'play' && !g.area.entranceDoor.open && g.area.doors.get('cryptPit').open && g.area.doors.get('naveNorth').open;
  });
  check(ok, 'did not resume inside the shrine with its progress');
  await shot('19-shrine-continued');
});

await step('once the keeper is beaten the seal opens, and the way out leads to the shrine door', async () => {
  // The keeper arrives in its own milestone; mark it beaten and come back in.
  await inShrine(() => {
    const g = window.embervale;
    g.state.dungeon('shrine').done = true;
    g.loadArea('shrine');
  });
  await wait(500);
  check(await inShrine(() => window.embervale.area.entranceDoor.open), 'seal still shut');
  const ex = await inShrine(() => window.embervale.area.triggers.find((t) => t.id === 'exit'));
  await teleport(ex.x + 2.5, ex.z, -Math.PI / 2, 2);
  await page.keyboard.down('KeyW');
  await until(() => window.embervale.area.id === 'overworld', 15000);
  await page.keyboard.up('KeyW');
  await finishScript();
  const s = await state();
  check(Math.hypot(s.pos.x - (108 - 4.2 - 3.5), s.pos.z - 28) < 2, `came out at (${s.pos.x.toFixed(1)}, ${s.pos.z.toFixed(1)})`);
});

await step('no errors in the console', async () => {
  check(errors.length === 0, errors.join(' | '));
});

await env.close();
console.log(failed ? 'SMOKE FAILED' : 'Smoke passed. Screenshots in smoke-output/');
process.exit(failed ? 1 : 0);
