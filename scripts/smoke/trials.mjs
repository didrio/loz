// The bell trials (docs/bells.md): in the Bell Shaft, falling off the ledges puts Wren back on
// the last checkpoint without a scratch; taking the Lullbell at the top lets her hang it.
export const fixture = 'shrine-entry';

export default async function run(t) {
  const { wait, game, until, finishScript, teleport, continueGame, press, step, check } = t;
  await continueGame();
  await wait(1500);
  /** Platforms of the Bell Shaft in world space (x, z = centre; y = top), plus the floor's height. */
  const ledges = () => game(() => {
    const r = window.embervale.area.def.rooms.find((r) => r.id === 'bellShaft');
    return r.platforms.map((p) => ({ x: r.x + p.x, z: r.z + p.z, y: r.floor * 8 + p.top, checkpoint: !!p.checkpoint, rise: p.move ? p.move.by[1] : 0 }));
  });
  const floorOf = () => game(() => window.embervale.area.def.rooms.find((r) => r.id === 'bellShaft').floor * 8);
  const pos = () => game(() => ({ x: window.embervale.player.pos.x, y: window.embervale.player.pos.y, z: window.embervale.player.pos.z, hp: window.embervale.state.hp }));

  await step('a fall from a checkpoint ledge returns Wren there, a half heart lost', async () => {
    await game(() => window.embervale.enemies.list.forEach((e) => (e.alive = false)));
    const cp = (await ledges()).filter((l) => l.checkpoint && !l.rise)[1];
    await teleport(cp.x, cp.z, 0, cp.y + 0.1);
    await wait(900);
    const hp = (await pos()).hp;
    // Off the ledge into the pit: the middle of the room.
    const mid = await game(() => {
      const r = window.embervale.area.def.rooms.find((r) => r.id === 'bellShaft');
      return { x: r.x + r.w / 2 + 2, z: r.z + r.d / 2 };
    });
    const fy = await floorOf();
    await teleport(mid.x, mid.z, 0, fy + 1);
    await until(() => window.embervale.player.pos.y > -13 && window.embervale.player.grounded, 10000);
    await wait(1200);
    await finishScript();
    const p = await pos();
    check(Math.hypot(p.x - cp.x, p.z - cp.z) < 2.5 && Math.abs(p.y - cp.y) < 0.6, `back at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}), ledge was (${cp.x}, ${cp.y}, ${cp.z})`);
    check(p.hp === hp - 1, `hp ${p.hp}, was ${hp} (a fall costs half a heart)`);
  });

  await step('Wren rides a rising ledge up and down without falling through (no input, 7 s)', async () => {
    await game(() => window.embervale.enemies.list.forEach((e) => (e.alive = false)));
    const riser = (await ledges()).find((l) => l.rise > 0);
    await teleport(riser.x, riser.z, 0, riser.y + 3);
    await wait(300);
    const lows = [];
    for (let i = 0; i < 14; i++) {
      await wait(500);
      lows.push((await pos()).y);
    }
    const p = await pos();
    const rel = lows.map((y) => (y - riser.y).toFixed(1)).join(' ');
    check(Math.min(...lows) > riser.y - 0.5, `fell: heights ${rel}`);
    check(Math.max(...lows) - Math.min(...lows) > 1, `the ledge didn't carry her up and down: ${rel}`);
    check(Math.hypot(p.x - riser.x, p.z - riser.z) < 1.5, `ended at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  });

  await step('taking the Lullbell from the top ledge puts it in Wren\'s hands', async () => {
    const top = (await ledges()).at(-1);
    await teleport(top.x + 1.5, top.z, 0, top.y + 0.1);
    await wait(600);
    await press('KeyE');
    await until(() => window.embervale.state.bells.carried.has('lull'), 10000);
    await finishScript();
    check(await game(() => !window.embervale.area.bellPickups.get('lullBell').present), 'the bell is still on its plinth');
  });
}
