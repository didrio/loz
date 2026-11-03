// Leaving the shrine once its keeper is beaten.
export const fixture = 'shrine-entry';

export default async function run(t) {
  const { page, wait, game, until, state, finishScript, teleport, continueGame, step, check } = t;
    const inShrine = (fn, arg) => game(fn, arg);
  
    await continueGame();

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
}
