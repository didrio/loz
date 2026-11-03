// Jars in the ruins: a sword swing breaks the jar in front of Wren and not the ones behind, the break
// is saved as a flag, a blue gem jar drops a pickup, and an empty jar drops nothing.
export const fixture = 'field-sword';

export default async function run(t) {
  const { wait, game, until, press, state, teleport, continueGame, step, check } = t;
  await continueGame();
  await until(() => window.embervale.mode === 'play');
  await wait(800);
  const jar = (id) => game((id) => {
    const j = window.embervale.area.jars.items.find((i) => i.id === id);
    return j && { x: j.x, z: j.z, broken: j.broken, drop: j.drop };
  }, id);
  const pickups = () => game(() => window.embervale.pickups.items.length);
  /** Stands 1.3 m from a jar (on the side away from the others) and swings at it. */
  const swingAt = async (id) => {
    const j = await jar(id);
    await teleport(j.x, j.z + 1.3, Math.PI);
    await wait(500);
    await press('KeyJ');
    await wait(600);
  };

  await step('a swing breaks an empty jar: flag saved, no pickup', async () => {
    check((await jar('lakeHome.1')).drop === 'empty', 'lakeHome.1 should be an empty jar');
    const before = await pickups();
    await swingAt('lakeHome.1');
    check((await jar('lakeHome.1')).broken, 'the jar did not break');
    check((await state()).flags.includes('jar.lakeHome.1'), 'jar.lakeHome.1 not saved');
    check((await pickups()) === before, 'an empty jar dropped something');
  });

  await step('the blue gem jar drops a gem', async () => {
    check((await jar('lakeHome.2')).drop === 'bluegem', 'lakeHome.2 should hold the blue gem');
    await swingAt('lakeHome.2');
    check((await jar('lakeHome.2')).broken, 'the blue gem jar did not break');
    check((await state()).flags.includes('jar.lakeHome.2'), 'jar.lakeHome.2 not saved');
    await until(() => window.embervale.state.gems >= 5, 5000).catch(() => {});
    check((await game(() => window.embervale.state.gems)) >= 5, 'the blue gem was not collected (5 gems)');
  });
}
