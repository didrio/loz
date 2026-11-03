// The shrine's own enemies: a Dozing Sentinel and a Shellback, fought with the real sword.
export const fixture = 'shrine-entry';

export default async function run(t) {
  const { wait, game, until, shot, press, state, teleport, continueGame, step, check } = t;
  await continueGame();

  /**
   * The enemy this step fights: the first of a kind ('asleep' marks sentinels, 'exposed'
   * shellbacks) in `room`, tagged so later calls follow that same one. Null once it's dead.
   */
  const find = (which, room) =>
    game(([which, room]) => {
      const g = window.embervale;
      const tag = `smoke-${which}`;
      const e = g.enemies.list.find((e) => e[tag]) ?? g.enemies.list.find((e) => which in e && e.alive && g.area.roomAt(e.pos)?.id === room);
      if (!e || !e.alive) return null;
      e[tag] = true;
      return { x: e.pos.x, y: e.pos.y, z: e.pos.z, facing: e.facing, hp: e.hp, state: e.state, asleep: e.asleep };
    }, [which, room]);
  /** Wren `dist` in front of the enemy (negative: behind it), facing it. */
  const stand = async (e, dist) => {
    const fx = Math.sin(e.facing), fz = Math.cos(e.facing);
    await teleport(e.x + fx * dist, e.z + fz * dist, dist > 0 ? e.facing + Math.PI : e.facing, e.y + 2);
  };

  await step('the shrine spawns sentinels and shellbacks where its data says, not thornlings', async () => {
    const n = await game(() => {
      const g = window.embervale, count = (k) => g.enemies.list.filter((e) => k in e).length;
      return { sentinels: count('asleep'), shells: count('exposed'), wantS: g.area.spawns.filter((s) => s.type === 'sentinel').length, wantB: g.area.spawns.filter((s) => s.type === 'shellback').length };
    });
    check(n.sentinels === n.wantS && n.sentinels > 0, `${n.sentinels} sentinels, data has ${n.wantS}`);
    check(n.shells === n.wantB && n.shells > 0, `${n.shells} shellbacks, data has ${n.wantB}`);
  });

  await step('a Dozing Sentinel sleeps, wakes as Wren comes close, swings, and falls to hits in its recovery', async () => {
    let s = await find('asleep', 'statueGallery');
    check(s?.asleep, 'no sleeping sentinel in the Gallery of Statues');
    await stand(s, 9);
    await wait(1500);
    check((await find('asleep', 'statueGallery')).asleep, 'woke with Wren 9 m away');
    for (let i = 0; i < 4; i++) await press('KeyQ', 1, 300);
    check(!(await state()).lock, 'lock-on picked a sleeping statue');
    const hp = (await state()).hp;
    await stand(s, 2.4);
    await until((hp) => window.embervale.state.hp < hp, 30000, hp);
    check((await state()).hp === hp - 2, `its swing took ${hp - (await state()).hp} half-hearts, not 2`);
    await game(() => (window.embervale.player.invuln = 1e6)); // the rest is about hitting it
    await shot('01-sentinel-awake');
    // Each recovery (maul in the floor), step in front and swing: front hits land only then.
    const end = Date.now() + 120000;
    while ((s = await find('asleep', 'statueGallery')) && !s.asleep && s.hp === 6 && Date.now() < end) {
      if (s.state !== 'recover') {
        await wait(100);
        continue;
      }
      await stand(s, 1.8);
      await press('KeyJ', 3, 150);
    }
    check(s && s.hp < 6, 'no sword hit landed in its recovery');
    // Finish it from behind.
    while ((s = await find('asleep', 'statueGallery')) && Date.now() < end) {
      await stand(s, -1.8);
      await press('KeyJ', 1, 150);
    }
    check(!s, 'the sentinel survived');
  });

  await step('a Shellback\'s shell turns the sword from the front; from behind it falls', async () => {
    let b = await find('exposed', 'crypt');
    check(b, 'no shellback in the crypt');
    await game(() => window.embervale.setTimeScale(0.05)); // hold it still while Wren lines up
    await stand(b, 1.9);
    await game(() => window.embervale.setTimeScale(1));
    await press('KeyJ', 1, 300);
    check((await find('exposed', 'crypt')).hp === b.hp, 'a frontal hit went through the shell');
    const end = Date.now() + 60000;
    const start = b.hp;
    while ((b = await find('exposed', 'crypt')) && b.hp === start && Date.now() < end) {
      await stand(b, -1.6);
      await press('KeyJ', 1, 150);
    }
    check(!b || b.hp < start, 'no hit from behind landed');
    while ((b = await find('exposed', 'crypt')) && Date.now() < end) {
      await stand(b, -1.6);
      await press('KeyJ', 1, 150);
    }
    check(!b, 'the shellback survived');
    await shot('02-shellback');
  });
}
