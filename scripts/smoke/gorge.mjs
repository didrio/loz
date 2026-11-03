// The Hushing Gorge (docs/bells.md, 3b): its monsters stand at their spots, a fall off the climb puts
// Wren back on the last checkpoint pillar (half a heart), and the Morrowbell waits on the last pillar.
export const fixture = 'field-sword';

export default async function run(t) {
  const { wait, game, until, finishScript, teleport, continueGame, press, step, check } = t;
  await continueGame();
  await wait(1500);
  const pos = () => game(() => ({ x: window.embervale.player.pos.x, y: window.embervale.player.pos.y, z: window.embervale.player.pos.z, hp: window.embervale.state.hp }));
  const pillars = () => game(() => window.embervale.area.gorgeCourse.platforms.map((p) => ({ x: p.x, z: p.z, y: p.top, checkpoint: !!p.checkpoint, moves: !!p.move })));

  await step('the corridor holds five thornlings and a sentinel', async () => {
    const kinds = await game(() => window.embervale.enemies.list.filter((e) => e.pos.x < -120).map((e) => e.constructor.name));
    check(kinds.filter((k) => k === 'Thornling').length === 5 && kinds.filter((k) => k === 'DozingSentinel').length === 1, `west of the mouth: ${kinds.join(', ')}`);
  });

  await step('a fall off a checkpoint pillar returns Wren there, half a heart lost', async () => {
    await game(() => window.embervale.enemies.list.forEach((e) => (e.alive = false)));
    const cp = (await pillars()).filter((p) => p.checkpoint)[1];
    await teleport(cp.x, cp.z, 0, cp.y + 0.1);
    await wait(900);
    const hp = (await pos()).hp;
    // Into the pit: halfway to the next checkpoint pillar, 3.5 m off the line of pillars.
    const next = (await pillars()).filter((p) => p.checkpoint)[2];
    const dx = next.x - cp.x, dz = next.z - cp.z, len = Math.hypot(dx, dz);
    await teleport((cp.x + next.x) / 2 - (dz / len) * 3.5, (cp.z + next.z) / 2 + (dx / len) * 3.5, 0, cp.y + 2);
    await until(() => window.embervale.mode === 'cutscene', 8000); // the fall's recovery runs as a script
    await wait(1500);
    await finishScript();
    const p = await pos();
    check(Math.hypot(p.x - cp.x, p.z - cp.z) < 2.6 && Math.abs(p.y - cp.y) < 0.6, `back at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}), pillar was (${cp.x.toFixed(1)}, ${cp.y}, ${cp.z.toFixed(1)})`);
    check(p.hp === hp - 1, `hp ${p.hp}, was ${hp}`);
  });

  await step('taking the Morrowbell from the last pillar puts it in Wren\'s hands', async () => {
    const top = (await pillars()).at(-1);
    await teleport(top.x, top.z + 1.2, 0, top.y + 0.1);
    await wait(700);
    await press('KeyE');
    await until(() => window.embervale.state.bells.carried.has('morrow'), 10000);
    await finishScript();
    check(await game(() => !window.embervale.area.morrowBell.present), 'the bell is still on its plinth');
  });
}
