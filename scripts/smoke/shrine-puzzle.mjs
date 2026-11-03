// Inside the shrine at its entrance: stones, plates, the crystal switch; progress survives a reload.
export const fixture = 'shrine-entry';

export default async function run(t) {
  const { wait, game, until, shot, press, finishScript, teleport, boot, continueGame, step, check } = t;
    const inShrine = (fn, arg) => game(fn, arg);
  
    await continueGame();

  await step('the sword slides the doorway stone aside, and the nave\'s stone onto its plate opens the stairwell', async () => {
    // Clear just these two rooms (beating every enemy would clear the fight rooms ahead too).
    await inShrine(() => {
      const g = window.embervale;
      for (const e of g.enemies.list) if (['entry', 'nave'].includes(g.area.roomAt(e.pos)?.id)) e.alive = false;
    });
    /** One strike at a stone; waits until it has actually moved a cell and come to rest. */
    const swing = async (id) => {
      await until(() => window.embervale.mode === 'play', 30000);
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
    await until(() => window.embervale.area.switches.get('navePlate').pressed, 15000).catch(async () => {
      throw new Error('plate not pressed: ' + await inShrine(() => { const x = window.embervale; return JSON.stringify({ cell: x.area.stoneCell('naveStone'), entry: x.area.stoneCell('entryStone'), mode: x.mode, pos: x.player.pos.toArray().map((v) => +v.toFixed(1)), facing: +x.player.facing.toFixed(2), near: x.enemies.list.filter((e) => e.alive && e.pos.distanceTo(x.player.pos) < 6).map((e) => e.pos.toArray().map((v) => +v.toFixed(1))) }); }));
    });
    await until(() => window.embervale.area.doors.get('naveEast').opening || window.embervale.area.doors.get('naveEast').open, 30000);
    await finishScript();
    await shot('17b-shrine-plate');
    check(await inShrine(() => window.embervale.state.dungeon('shrine').switches.has('navePlate')), 'plate not saved');
  });

  await step('striking the crystal with the sword raises the barred door', async () => {
    const c = await inShrine(() => window.embervale.area.switches.get('northBar').group.position);
    await teleport(c.x - 1.6, c.z, Math.PI / 2, 2);
    await wait(300);
    for (let i = 0; i < 6 && !(await inShrine(() => window.embervale.area.switches.get('northBar').pressed)); i++) await press('KeyJ', 1, 300);
    await until(() => window.embervale.area.doors.get('naveNorth').opening || window.embervale.area.doors.get('naveNorth').open, 30000);
    await finishScript();
    await shot('18-shrine-crystal');
  });

  await step('the solved puzzle survives a save and Continue', async () => {
    await inShrine(() => window.embervale.save());
    await boot();
    await press('Enter');
    await wait(800);
    const ok = await inShrine(() => {
      const a = window.embervale.area;
      return a.id === 'shrine' && a.doors.get('naveNorth').open && a.doors.get('naveEast').open && a.switches.get('navePlate').pressed;
    });
    check(ok, 'the solved puzzle was not restored');
  });
}
