// Overworld water (docs/sallowmere.md, "Water"): the river's bed is deep, so walking into it is a fall back to the
// last dry ground (half a heart); a shallow edge only slows Wren.
export const fixture = 'field-sword';

export default async function run(t) {
  const { wait, game, until, finishScript, teleport, continueGame, check, step } = t;
  await continueGame();
  await wait(1500);
  const pos = () => game(() => ({ x: window.embervale.player.pos.x, y: window.embervale.player.pos.y, z: window.embervale.player.pos.z, hp: window.embervale.state.hp }));
  const X = -60;
  /** Ground height of the river's section at X, scanned north to south: the dry bank, the deepest bed, a shallow edge. */
  const column = await game((x) => {
    const g = window.embervale, level = g.area.waterLevel;
    const rows = [];
    for (let z = -60; z <= 60; z += 1) rows.push({ z, y: g.physics.groundY(x, z, 400) });
    const bed = rows.reduce((a, b) => (b.y < a.y ? b : a));
    const bank = rows.filter((r) => r.z > bed.z && r.y > level + 0.3).at(0);
    const edge = rows.filter((r) => r.z > bed.z && r.y < level - 0.4 && r.y > level - 1).at(-1);
    return { level, bed, bank, edge };
  }, X);

  await step('a river deeper than chest height is on the map', async () => {
    check(column.level - column.bed.y > 1.2, `deepest bed ${column.bed.y.toFixed(2)}, water at ${column.level}`);
    check(!!column.bank && !!column.edge, 'no bank or shallow edge found');
  });

  await step('wading a shallow edge costs nothing', async () => {
    await game(() => window.embervale.enemies.list.forEach((e) => (e.alive = false)));
    const hp = (await pos()).hp;
    await teleport(X, column.edge.z, 0);
    await wait(1500);
    const p = await pos();
    check(p.hp === hp && Math.abs(p.z - column.edge.z) < 1, `hp ${p.hp} (was ${hp}), z ${p.z.toFixed(1)} (edge ${column.edge.z})`);
    check((await game(() => window.embervale.mode)) === 'play', 'a shallow edge should not start a fall');
  });

  await step('deep water is a fall: back to dry ground, half a heart lost', async () => {
    await teleport(X, column.bank.z, 0);
    await wait(900);
    const hp = (await pos()).hp;
    await teleport(X, column.bed.z, 0);
    await until(() => window.embervale.mode === 'cutscene', 8000); // the fall's recovery runs as a script
    await wait(1500);
    await finishScript();
    const p = await pos();
    check(p.hp === hp - 1, `hp ${p.hp}, was ${hp}`);
    check(p.y > column.level + 0.1 && Math.abs(p.z - column.bank.z) < 3, `back at z ${p.z.toFixed(1)}, y ${p.y.toFixed(2)}; the bank is z ${column.bank.z}`);
  });
}
