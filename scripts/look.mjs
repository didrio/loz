// Visual check: captures named scenes in headless Chrome so you can LOOK at what you
// changed (tests can't tell you whether something looks right). Screenshots go to
// look-output/<scene>-<shot>.png.
//
//   npm run look                    every scene
//   npm run look -- boss village    just these
//   npm run look -- --list          scene names
//
// Add a scene when you add a place, a boss or a visual system.
import { launch, openGame } from './browser.mjs';

const OUT = new URL('../look-output/', import.meta.url).pathname;

/** Parks the camera relative to a target's facing: `dist` ahead, `side` to its left, `h` up. */
const park = (h, opts) =>
  h.game(({ dist, side, height, lookHeight, boss }) => {
    const g = window.embervale;
    const t = boss ? g.activeBoss : g.player;
    const f = boss ? t.forward : t.forward;
    const T = t.pos.constructor;
    const from = new T(t.pos.x + f.x * dist - f.z * side, t.pos.y + height, t.pos.z + f.z * dist + f.x * side);
    g.rig.shot(from, new T(t.pos.x, t.pos.y + lookHeight, t.pos.z), true);
  }, opts);

/** Walks into Gloaming Hollow and waits until the Lamplighter fight is on. */
const startBossFight = async (h) => {
  await h.game(() => (window.embervale.state.hours = 16.5));
  await h.teleport(-23, 116.5, 0);
  await h.until(() => window.embervale.mode === 'play' && !!window.embervale.activeBoss, 60000);
  await h.game(() => (window.embervale.player.invuln = 1e6)); // even value keeps Wren visible
  await h.until(() => !document.querySelector('.boss-title.show'), 15000); // let the name card fade
};

const waitStep = (h, name, step, minT) =>
  h.until(
    ([name, step, minT]) => {
      const b = window.embervale.activeBoss;
      return b?.move?.name === name && b.step === step && b.stepProgress >= minT;
    },
    60000,
    [name, step, minT],
  );

const SCENES = {
  async title(h) {
    await h.boot();
    await h.shot('title');
  },
  async field(h) {
    await h.newGame();
    await h.wait(1200);
    await h.shot('field-start');
  },
  async village(h) {
    await h.newGame();
    await h.teleport(-50, -42, Math.atan2(-12, -16));
    await h.wait(1500);
    await h.shot('village');
  },
  async grove(h) {
    await h.newGame();
    await h.teleport(74, -70, Math.atan2(8, -8));
    await h.wait(1500);
    await h.shot('grove');
  },
  async shrine(h) {
    await h.newGame();
    await h.teleport(90, 28, Math.PI / 2);
    await h.wait(1500);
    await h.shot('shrine');
  },
  async hollow(h) {
    await h.newGame();
    await h.teleport(-22, 106, 0);
    await h.wait(1500);
    await h.shot('hollow-approach');
  },
  async night(h) {
    await h.newGame();
    await h.game(() => (window.embervale.state.hours = 21));
    await h.teleport(-40, -30, Math.atan2(-22, -28));
    await h.wait(1500);
    await h.shot('night-village-road');
  },
  /** The guard gauge beside Wren: one slot down, then broken. */
  async guard(h) {
    await h.newGame();
    const hit = (guard) =>
      h.game((guard) => {
        const g = window.embervale, p = g.player, f = p.forward;
        return g.hitPlayer(p.pos.clone().set(p.pos.x + f.x * 3, p.pos.y, p.pos.z + f.z * 3), { damage: 2, guard });
      }, guard);
    await h.page.keyboard.down('ShiftLeft');
    await h.until(() => window.embervale.player.shielding, 5000);
    await hit(1);
    await h.wait(500);
    await h.shot('guard-one-down');
    await hit(3);
    await h.wait(400);
    await h.shot('guard-broken');
    await h.page.keyboard.up('ShiftLeft');
  },
  /** The Lamplighter up close: front, face, side, back, and phase two. */
  async boss(h) {
    await h.newGame();
    await startBossFight(h);
    await h.game(() => window.embervale.setTimeScale(0.03)); // nearly frozen, for posing
    for (const [name, o] of Object.entries({
      front: { dist: 6, side: 2.5, height: 2.4, lookHeight: 2.6 },
      face: { dist: 3.2, side: 1, height: 3.6, lookHeight: 3.9 },
      side: { dist: 0.5, side: 6, height: 1.8, lookHeight: 2.4 },
      back: { dist: -6, side: 2, height: 2.5, lookHeight: 2.4 },
    })) {
      await park(h, { ...o, boss: true });
      await h.wait(1200);
      await h.shot(`boss-${name}`);
    }
    // Phase two: knock it past half health from behind and let the howl play out.
    await h.game(() => window.embervale.setTimeScale(0.4));
    await h.until(() => !window.embervale.activeBoss.move, 20000);
    await h.game(() => {
      const b = window.embervale.activeBoss, f = b.forward;
      b.hurt(16, b.pos.clone().set(b.pos.x - f.x * 3, b.pos.y, b.pos.z - f.z * 3), 'body');
    });
    await waitStep(h, 'howl', 'active', 0.4);
    await h.game(() => window.embervale.setTimeScale(0.02));
    await park(h, { dist: 7, side: 3, height: 2.6, lookHeight: 2.6, boss: true });
    await h.wait(1200);
    await h.shot('boss-howl');
  },
  /** Each Lamplighter move caught at the end of its windup (the telegraph) and in action. */
  async 'boss-moves'(h) {
    await h.newGame();
    await startBossFight(h);
    await h.game(() => {
      const g = window.embervale, b = g.activeBoss;
      const y = g.physics.groundY(b.pos.x, b.pos.z - 4.5) ?? b.pos.y;
      g.player.teleport(b.pos.x, y + 0.05, b.pos.z - 4.5, 0);
    });
    for (const [move, shots] of Object.entries({
      sweep: [['windup', 0.85], ['active', 0.6]],
      slam: [['windup', 0.9], ['recover', 0.05], ['recover', 0.4]],
      volley: [['windup', 0.9], ['active', 0.5]],
    })) {
      await h.game(() => window.embervale.setTimeScale(0.3));
      await h.until(() => !window.embervale.activeBoss.move, 30000);
      await park(h, { dist: 7, side: 4, height: 2.5, lookHeight: 2.2, boss: true });
      await h.game((m) => window.embervale.activeBoss.forceMove(m), move);
      for (const [step, t] of shots) {
        await h.game(() => window.embervale.setTimeScale(0.2));
        await waitStep(h, move, step, t);
        await h.game(() => window.embervale.setTimeScale(0.01));
        await h.wait(400);
        await h.shot(`move-${move}-${step}-${Math.round(t * 100)}`);
      }
    }
  },
};

const args = process.argv.slice(2);
if (args.includes('--list')) {
  console.log(Object.keys(SCENES).join('\n'));
  process.exit(0);
}
const names = args.length ? args : Object.keys(SCENES);
const unknown = names.filter((n) => !SCENES[n]);
if (unknown.length) {
  console.error(`Unknown scene(s): ${unknown.join(', ')}. Try --list.`);
  process.exit(1);
}

const env = await launch();
let failed = false;
for (const name of names) {
  const h = await openGame(env, OUT);
  const shot = h.shot;
  h.shot = (n) => shot(n.startsWith(name) ? n : `${name}-${n}`);
  try {
    await SCENES[name](h);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed = true;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
  if (h.errors.length) {
    failed = true;
    console.log(`    console errors: ${h.errors.join(' | ')}`);
  }
  await h.page.close();
}
await env.close();
console.log(`Screenshots in look-output/. Open them and check they look right.`);
process.exit(failed ? 1 : 0);
