// Leaving the shrine: the entrance is always open.
export const fixture = 'shrine-entry';

export default async function run(t) {
  const { page, game, until, state, finishScript, teleport, continueGame, step, check } = t;
    const inShrine = (fn, arg) => game(fn, arg);
  
    await continueGame();

  await step('the way out is always open, and leads to the shrine door', async () => {
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
