// The Northpass (shrine D3): two Cragstalkers guard the far side of the canyon, the crossing returns a fall to its
// last ledge, the Waybell can be taken from behind it and hung on the camp's post, and the post joins the network.
// Back home with the blight gone: only Lark and Pip are left, Pip asks Wren to find the others, Odo's stall runs on trust.
export const fixture = 'northpass';

export default async function run(t) {
  const { wait, game, until, finishScript, teleport, continueGame, press, step, check } = t;
  await continueGame();
  await wait(1500);
  const pos = () => game(() => ({ x: window.embervale.player.pos.x, y: window.embervale.player.pos.y, z: window.embervale.player.pos.z, hp: window.embervale.state.hp }));
  const ledges = () => game(() => window.embervale.area.canyonCourse.platforms.map((p) => ({ x: p.x, z: p.z, y: p.top, checkpoint: !!p.checkpoint, moves: !!p.move })));

  await step('walking into the Northpass builds the camp\'s ground and two Cragstalkers wait on the far side', async () => {
    await game(() => window.embervale.enemies.list.filter((e) => e.constructor.name !== 'Cragstalker').forEach((e) => (e.alive = false)));
    await teleport(-10, -245, Math.PI);
    await until(() => window.embervale.enemies.list.some((e) => e.constructor.name === 'Cragstalker'), 20000);
    await wait(500);
    const c = await game(() => window.embervale.enemies.list.filter((e) => e.constructor.name === 'Cragstalker').map((e) => ({ x: e.pos.x, y: e.pos.y, z: e.pos.z })));
    check(c.length === 2, `${c.length} Cragstalkers`);
    check(Math.abs(c[0].y - 12) < 1 && c[0].z < -295, `it stands at (${c[0].x.toFixed(1)}, ${c[0].y.toFixed(1)}, ${c[0].z.toFixed(1)})`);
  });

  await step('a fall in the crossing returns Wren to the last ledge she stood on, half a heart lost', async () => {
    const cps = (await ledges()).filter((p) => p.checkpoint);
    await teleport(cps[1].x, cps[1].z, 0, cps[1].y + 0.1);
    await wait(900);
    const hp = (await pos()).hp;
    await teleport(cps[1].x + 3.2, cps[1].z - 3, 0, cps[1].y + 2); // into the chasm beside it
    await until(() => window.embervale.mode === 'cutscene', 8000);
    await wait(1500);
    await finishScript();
    const p = await pos();
    check(Math.hypot(p.x - cps[1].x, p.z - cps[1].z) < 2.6 && Math.abs(p.y - cps[1].y) < 0.6, `back at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
    check(p.hp === hp - 1, `hp ${p.hp}, was ${hp}`);
  });

  await step('the Cragstalker lunges at Wren near it', async () => {
    const c = await game(() => { const e = window.embervale.enemies.list.find((e) => e.constructor.name === 'Cragstalker'); return { x: e.pos.x, z: e.pos.z }; });
    const hp = (await pos()).hp;
    await teleport(c.x, c.z + 6, Math.PI);
    await until((hp) => window.embervale.state.hp < hp, 30000, hp);
  });

  const menu = () => game(() => {
    const m = document.querySelector('.gmenu');
    return m.classList.contains('hidden') ? null : { title: m.querySelector('.gmenu-title').textContent, rows: [...m.querySelectorAll('.gmenu-row span:first-child')].map((r) => r.textContent) };
  });
  /** Pages through the dialog (Enter) until the travel menu is up. */
  const menuOpen = async () => {
    for (let i = 0; i < 40 && !(await menu()); i++) await press('Enter', 1, 400);
    check(!!(await menu()), 'the travel menu never opened');
  };
  const spot = (id) => game((id) => { const i = window.embervale.area.interactables.find((i) => i.id === id); return { x: i.x, z: i.z, y: i.y }; }, id);

  await step('the Waybell can be taken from behind the Cragstalker, and hung on the camp\'s post: with the village bell lifted, it offers only the Hall', async () => {
    await game(() => { window.embervale.enemies.list.forEach((e) => (e.alive = false)); window.embervale.player.invuln = 5; });
    const b = await spot('bellPickup.way');
    await teleport(b.x, b.z + 1.2, 0, b.y + 0.1);
    await wait(700);
    await press('KeyE');
    await until(() => window.embervale.state.bells.carried.has('way'), 10000);
    await finishScript();
    const post = await spot('bellPost.way');
    await teleport(post.x, post.z, 0);
    await wait(700);
    await press('KeyE');
    await menuOpen();
    const m = await menu();
    check(m.rows.join('|') === 'Hall of Sleepers|Stay', `menu ${JSON.stringify(m)}`); // the village bell was lifted after the boss
    check(await game(() => window.embervale.state.bells.hung.has('way')), 'the Waybell is not hung');
    await press('ArrowDown');
    await press('Enter'); // Stay
    await finishScript();
  });

  await step('the Morrowbell found and rehung in Thistledown: the menu offers both other bells, and Wayfarers\' Camp arrives at the camp\'s post', async () => {
    const lost = await spot('bellPickup.morrowLost');
    await teleport(lost.x, lost.z + 1.2, 0);
    await wait(700);
    await press('KeyE');
    await finishScript();
    check(await game(() => window.embervale.state.bells.carried.has('morrow')), 'taking the Morrowbell did not carry it');
    const post = await spot('bellPost.morrow');
    await teleport(post.x, post.z, 0);
    await wait(700);
    await press('KeyE');
    await menuOpen();
    const m = await menu();
    check(m.rows.join('|') === 'Hall of Sleepers|Wayfarers\' Camp|Stay', `menu ${JSON.stringify(m)}`);
    await press('ArrowDown');
    await press('Enter');
    await until(() => window.embervale.player.pos.z < -240, 20000);
    await finishScript();
    const r = await game(() => { const g = window.embervale, e = g.area.entrances['bell.way']; return { d: Math.hypot(g.player.pos.x - e.x, g.player.pos.z - e.z), y: g.player.pos.y }; });
    check(r.d < 1.5 && Math.abs(r.y - 12) < 1, `arrived ${r.d.toFixed(2)} m from the post's spot at y ${r.y.toFixed(1)}`);
  });

  await step('past the Waybell the road goes down to Sallowmere: the descent and its foot are dry, the town\'s shallows wade, the channel is a fall', async () => {
    await game(() => { window.embervale.area.streamAt(-10, -343); window.embervale.enemies.list.forEach((e) => (e.alive = false)); });
    check(await game(() => window.embervale.area.loadedRegions.includes('sallowmere')), 'Sallowmere did not stream in');
    await teleport(-10, -343, Math.PI);
    await wait(900);
    let p = await pos();
    check(Math.abs(p.y - 12) < 0.6, `the overlook at y ${p.y.toFixed(2)}`);
    check(await game(() => window.embervale.area.nameAt(-10, -350) === 'Sallowmere'), 'not named Sallowmere');
    const hp = p.hp;
    await teleport(-10, -384, Math.PI);
    await wait(900);
    p = await pos();
    check(p.y > 0.5 && p.hp === hp, `the descent's foot at y ${p.y.toFixed(2)}, hp ${p.hp}`);
    await teleport(-74, -425, Math.PI); // open water west of the plaza (the plaza itself is a dry deck)
    await wait(1500);
    p = await pos();
    check(p.y < 0 && p.y > -1.2 && p.hp === hp && (await game(() => window.embervale.mode)) === 'play', `Stiltwick's shallows (off the decks): y ${p.y.toFixed(2)}, hp ${p.hp}`);
    await teleport(70, -450, Math.PI); // the east island: dry ground
    await wait(900);
    await teleport(22, -486, Math.PI); // the channel before the Weir
    await until(() => window.embervale.mode === 'cutscene', 8000);
    await wait(1500);
    await finishScript();
    p = await pos();
    check(p.hp === hp - 1 && Math.hypot(p.x - 70, p.z + 450) < 3 && p.y > 0.5, `after the fall: (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}), hp ${p.hp} (was ${hp})`);
  });

  await step('Thistledown without its grown-ups: only the kids, Pip asks, Odo\'s stall takes the gems on trust', async () => {
    const v = await game(() => {
      const g = window.embervale, n = g.area.npcs;
      return { gone: ['maren', 'tobin', 'odo'].filter((k) => !n[k].present && !n[k].model.root.visible), kids: n.lark.present && n.pip.present };
    });
    check(v.gone.length === 3 && v.kids, `gone ${v.gone}, kids ${v.kids}`);
    const pip = await game(() => window.embervale.area.interactables.find((i) => i.id === 'npc.pip'));
    await teleport(pip.x + 1.2, pip.z, -Math.PI / 2);
    await wait(500);
    await press('KeyE');
    await until(() => window.embervale.mode === 'cutscene', 5000);
    await finishScript();
    check(await game(() => window.embervale.state.has('village.searchAsked')), 'Pip did not ask');
    const stall = await game(() => window.embervale.area.interactables.find((i) => i.id === 'npc.odo'));
    await game(() => {
      const s = window.embervale.state;
      s.gems = 50;
      s.flasks.add('attack');
      s.flasks.drink(0);
    });
    await teleport(stall.x + 0.3, stall.z, -Math.PI / 2);
    await wait(500);
    await press('KeyE');
    await until(() => window.embervale.mode === 'cutscene', 5000);
    await finishScript(); // Enter picks the first potion: Life
    const r = await game(() => ({ gems: window.embervale.state.gems, slot: window.embervale.state.flasks.slots[0] }));
    check(r.slot === 'life' && r.gems === 30, `flask ${r.slot}, gems ${r.gems}`);
  });
}
