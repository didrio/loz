// Visual check: captures named scenes in headless Chrome so you can LOOK at what you
// changed (tests can't tell you whether something looks right). Screenshots go to
// look-output/<scene>-<shot>.png.
//
//   npm run look                    every scene
//   npm run look -- boss village    just these
//   npm run look -- --list          scene names
//   npm run look -- village --shadows         capture with sun shadows on (shots get a -shadows suffix)
//   npm run look -- village --display n64   capture in N64 mode (or performance); shots get a -n64 suffix
//   npm run look -- village --approve   accept what the scenes show now as the baselines and budgets
//
// Every shot is compared with its approved baseline (scripts/baselines/look/, shrunk 4x) and reported
// unchanged / changed / new: only the changed and new ones need a pair of eyes. Each scene's peak draw
// calls and triangles are checked against scripts/look-budgets.json. The page runs on a stepped clock
// (browser.mjs), so two runs on unchanged code give identical frames. Scenes run in parallel pages (JOBS=n), on the
// real GPU locally (GL=software for SwiftShader; browser.mjs); the full run takes about a minute.
//
// Add a scene when you add a place, a boss or a visual system.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { launch, openGame } from './browser.mjs';
import { budgetFor, compare, shrink, overBudget, readBaseline, readBudgets, readPng, writeBaseline, writeBudgets, writePng } from './lookCompare.mjs';

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
  await h.game(() => {
    const g = window.embervale;
    g.state.set('hasSword'); // unarmed, the hollow's trigger sends Wren home
    g.player.setSword(true);
    g.state.hours = 21; // it only walks at night
  });
  await h.until(() => window.embervale.enemies.list.some((e) => e.title), 10000);
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
  /**
   * The contact sheet (dev/viewer.ts, docs/pipeline.md): every registered model at one scale, the golden set marked. Compare
   * a new or changed asset with its neighbours; the sheet also changes whenever any model does.
   */
  async contact(h) {
    const url = new URL('viewer.html', h.page.url() === 'about:blank' ? env.url : h.page.url());
    url.search = `?asset=contact&panel=0&display=${['native', 'performance', 'n64'][display] ?? 'native'}`;
    await h.page.setViewportSize({ width: 1600, height: 900 });
    await h.page.goto(url.href);
    await h.until(() => window.embervale?.mode === 'viewer', 30000);
    await h.wait(400);
    await h.shot('sheet');
  },
  /**
   * The entrance vignette's buildings alone in the viewer (T51b, T51c): an east cottage, a southwest cottage, the windmill, its
   * sails, Odo's stall and a ruined home, each from the front, three-quarter and side.
   */
  async vignetteModels(h) {
    const mode = ['native', 'performance', 'n64'][display] ?? 'native';
    await h.page.setViewportSize({ width: 1000, height: 900 });
    for (const asset of ['cottage-east', 'cottage-southwest', 'mill', 'mill-sails', 'odo-stall', 'ruined-home']) {
      for (const [name, deg] of [['front', 0], ['three-quarter', 45], ['side', 90]]) {
        const url = new URL('viewer.html', h.page.url() === 'about:blank' ? env.url : h.page.url());
        url.search = `?asset=${asset}&panel=0&angle=${deg}&display=${mode}`;
        await h.page.goto(url.href);
        await h.until(() => window.embervale?.mode === 'viewer', 30000);
        await h.wait(300);
        await h.shot(`${asset}-${name}`);
      }
    }
  },
  /**
   * The Hall of Sleepers' things alone in the viewer (T56b, T56c): the wakestone (light and heavy), the tablet, the bell post and its bell,
   * a carved sleeping face and a kneeling keeper, and the dressing (relief, lintel, niche, banner, rubble, drift), each from the front, three-quarter and side. The in-game shots: `shrineHall`.
   */
  async shrineModels(h) {
    const mode = ['native', 'performance', 'n64'][display] ?? 'native';
    await h.page.setViewportSize({ width: 1000, height: 900 });
    const assets = (process.env.LOOK_SHRINE ?? 'wakestone,wakestone-heavy,dungeon-tablet,bell-post,bell,shrine-face,shrine-keeper,shrine-relief,shrine-lintel,shrine-niche,shrine-banner,shrine-rubble,shrine-drift').split(',');
    for (const asset of assets) {
      for (const [name, deg] of [['front', 0], ['three-quarter', 45], ['side', 90]]) {
        const url = new URL('viewer.html', h.page.url() === 'about:blank' ? env.url : h.page.url());
        url.search = `?asset=${asset}&panel=0&angle=${deg}&display=${mode}`;
        await h.page.goto(url.href);
        await h.until(() => window.embervale?.mode === 'viewer', 30000);
        await h.wait(300);
        await h.shot(`${asset}-${name}`);
      }
    }
  },
  /**
   * The prop set alone in the viewer (T52, golden set 4): the hinged door, the stone door, a jar and a sign, front, three-quarter
   * and side. The in-game shots are the `mill` (its door and the sign), `door` (the shrine's) and `ruins` (jars) scenes.
   */
  async props(h) {
    const mode = ['native', 'performance', 'n64'][display] ?? 'native';
    await h.page.setViewportSize({ width: 1000, height: 900 });
    const assets = (process.env.LOOK_PROPS ?? 'hinged-door,stone-door,jar,sign').split(',');
    for (const asset of assets) {
      for (const [name, deg] of [['front', 0], ['three-quarter', 45], ['side', 90]]) {
        const url = new URL('viewer.html', h.page.url() === 'about:blank' ? env.url : h.page.url());
        url.search = `?asset=${asset}&panel=0&angle=${deg}&display=${mode}`;
        await h.page.goto(url.href);
        await h.until(() => window.embervale?.mode === 'viewer', 30000);
        await h.wait(300);
        await h.shot(`${asset}-${name}`);
      }
    }
  },
  /**
   * The Thornling (the golden set's first enemy, T49; docs/art.md): in the field idle, at the end of its windup (the tell),
   * mid-lunge, staggered and dying; then the model alone in the viewer from the front, three-quarter and side.
   */
  async thornling(h) {
    await h.newGame();
    await h.game(() => {
      const g = window.embervale;
      g.player.invuln = 1e6;
      for (const e of g.enemies.list) e.alive = false; // the blight's posts, out of the shots
    });
    await h.wait(600);
    // `window.lookThornling`: the one this scene spawns, 4 m in front of Wren.
    await h.game(() => {
      const g = window.embervale, f = g.player.facing;
      window.lookThornling = g.spawn('thornling', g.player.pos.x + Math.sin(f) * 4, g.player.pos.z + Math.cos(f) * 4);
      g.setTimeScale(0.01);
    });
    // From its front-left, low: the camera `dist` ahead of it, `side` to its left.
    const view = (dist = 3.2, side = 1.8, height = 1.3) =>
      h.game(([dist, side, height]) => {
        const g = window.embervale, e = window.lookThornling, T = e.pos.constructor;
        const f = { x: Math.sin(e.yaw), z: Math.cos(e.yaw) };
        g.rig.shot(new T(e.pos.x + f.x * dist - f.z * side, e.pos.y + height, e.pos.z + f.z * dist + f.x * side), new T(e.pos.x, e.pos.y + 0.8, e.pos.z), true);
      }, [dist, side, height]);
    const until = (state, minT) =>
      h.until(([state, minT]) => window.lookThornling.state === state && window.lookThornling.t >= minT, 20000, [state, minT]);
    const at = async (state, minT, name, ...cam) => {
      await h.game(() => window.embervale.setTimeScale(1));
      await until(state, minT);
      await h.game(() => window.embervale.setTimeScale(0.01));
      await view(...cam);
      await h.wait(300);
      await h.shot(name);
    };
    await view();
    await h.wait(400);
    await h.shot('idle');
    await at('windup', 0.45, 'windup');
    await at('lunge', 0.1, 'lunge', 3, 2.6);
    await h.game(() => {
      const e = window.lookThornling;
      e.hp = 99; // a stagger, not a death
      e.hurt(1, window.embervale.player.pos);
    });
    await at('stagger', 0.22, 'stagger'); // past the 0.18 s hit flash, eyes still shut
    await h.game(() => {
      const e = window.lookThornling;
      e.hp = 1;
      e.hurt(1, window.embervale.player.pos);
      window.embervale.setTimeScale(1);
    });
    await h.until(() => window.lookThornling.deathT >= 0.2, 10000); // past the hit flash: the burst
    await h.game(() => window.embervale.setTimeScale(0.01));
    await view(3.2, 1.8, 1.3);
    await h.wait(300);
    await h.shot('death');

    const mode = ['native', 'performance', 'n64'][display] ?? 'native';
    await h.page.setViewportSize({ width: 900, height: 900 });
    for (const [name, deg] of [['front', 0], ['three-quarter', 45], ['side', 90]]) {
      const url = new URL('viewer.html', h.page.url());
      url.search = `?asset=thornling&panel=0&angle=${deg}&display=${mode}`;
      await h.page.goto(url.href);
      await h.until(() => window.embervale?.mode === 'viewer', 30000);
      await h.wait(400);
      await h.shot(`model-${name}`);
    }
  },
  /**
   * Wren (the golden set's second member, T50; docs/art.md): every state of the animation set in the field, then the model
   * alone in the viewer from the front, three-quarter and side. The player's update is swapped for its `animate` alone, so
   * each state is set by hand (state, combo, swing time, shield, surf, throw, broken guard, death) and held still while it
   * is shot: the same steps drive the rough and the final model.
   */
  async wren(h) {
    await h.newGame();
    await h.game(() => {
      const g = window.embervale, p = g.player;
      for (const e of g.enemies.list) e.alive = false; // the blight's posts, out of the shots
      g.state.set('hasSword');
      p.setSword(true);
      p.setShield(true);
      p.invuln = 0;
      p.update = (dt) => p.animate(dt); // pose only: no input, no movement, no physics
      // `lookWren(fields)`: back to standing still, then these fields set.
      window.lookWren = (fields = {}) => {
        Object.assign(p, { state: 'move', combo: 0, t: 0, shielding: false, surfing: false, throwT: 0, speedXZ: 0, invuln: 0 }, fields);
        p.guard.broken = fields.broken ?? 0;
      };
    });
    await h.wait(4000); // the area's name card fades
    const pose = async (name, fields, cam = { dist: 3.6, side: 2, height: 1.6, lookHeight: 1.1 }, ms = 500) => {
      await h.game((f) => window.lookWren(f), fields);
      await park(h, cam);
      await h.wait(ms);
      await h.shot(name);
    };
    await pose('idle', {});
    await pose('run', { speedXZ: 8.5 }, undefined, 230);
    // Mid-arc in each swing (the `t` the swing's ease is halfway through), the camera behind the right shoulder too.
    await pose('swing1', { state: 'attack', combo: 0, t: 0.13 });
    await pose('swing2', { state: 'attack', combo: 1, t: 0.13 });
    await pose('swing3', { state: 'attack', combo: 2, t: 0.18 }, { dist: 3.2, side: 3, height: 1.4, lookHeight: 1.3 });
    await pose('guard', { shielding: true });
    await pose('hurt', { state: 'hurt', t: 0.1 });
    await pose('broken', { broken: 1.2 });
    await pose('surf', { surfing: true });
    await pose('throw', { throwT: 0.3 });
    // The death: in cutscene mode, so the game's death script (the fade) never starts; half a second in, Wren lies flat.
    await h.game(() => {
      const g = window.embervale;
      window.lookWren({});
      g.mode = 'cutscene';
      g.player.health.hp = 0;
    });
    await park(h, { dist: 3.6, side: 2.4, height: 2, lookHeight: 0.4 });
    await h.wait(700);
    await h.shot('death');

    const mode = ['native', 'performance', 'n64'][display] ?? 'native';
    await h.page.setViewportSize({ width: 900, height: 900 });
    for (const [name, deg] of [['front', 0], ['three-quarter', 45], ['side', 90]]) {
      const url = new URL('viewer.html', h.page.url());
      url.search = `?asset=wren&panel=0&angle=${deg}&display=${mode}`;
      await h.page.goto(url.href);
      await h.until(() => window.embervale?.mode === 'viewer', 30000);
      await h.wait(400);
      await h.shot(`model-${name}`);
    }
  },
  async title(h) {
    await h.boot();
    await h.shot('title');
  },
  /**
   * The touch controls (ui/touch.ts): none on desktop; on a landscape phone the title, play near Lark (Jump reads
   * Talk), the stick under a thumb, dialog, the pause menu; then a tablet, and the "turn sideways" card in portrait.
   */
  async touch(h) {
    const kit = () => h.game(() => {
      const g = window.embervale;
      for (const f of ['hasSword', 'village.surfIdea']) g.state.set(f);
      g.player.setSword(true);
      g.state.items.add('tether');
      g.state.flasks.slots.splice(0, 2, 'life', 'attack');
    });
    const nearLark = async () => {
      const p = await h.game(() => {
        const it = window.embervale.area.interactables.find((i) => i.id === 'npc.lark');
        return { x: it.x, z: it.z };
      });
      await h.teleport(p.x + 1.6, p.z + 1.2, -Math.PI / 2);
    };
    await h.newGame();
    await kit();
    await nearLark();
    await h.wait(1200);
    await h.shot('desktop');
    await h.game(() => window.embervale.save());

    const url = h.page.url().split('?')[0];
    await h.page.setViewportSize({ width: 844, height: 390 });
    await h.page.goto(`${url}?touch=1`);
    await h.until(() => window.embervale?.mode === 'title', 60000);
    await h.wait(800);
    await h.shot('phone-title');
    await h.game(() => window.embervale.input.touch.tap('confirm'));
    await h.until(() => window.embervale.mode === 'play', 60000);
    await kit();
    await nearLark();
    await h.wait(1500);
    await h.shot('phone');
    // A thumb on the stick, the shield held.
    await h.game(() => {
      const t = window.embervale.input.touch;
      t.down(90, 170, 290, { kind: 'stick' });
      t.move(90, 200, 255);
      t.down(91, 700, 340, { kind: 'button', actions: ['shield'] });
    });
    await h.wait(400);
    await h.shot('phone-stick');
    await h.game(() => window.embervale.input.touch.clear());
    await nearLark();
    await h.wait(500);
    await h.game(() => window.embervale.input.touch.tap('interact'));
    await h.until(() => window.embervale.mode === 'cutscene', 10000);
    await h.wait(2500);
    await h.shot('phone-dialog');
    for (let i = 0; i < 40 && (await h.game(() => window.embervale.mode)) === 'cutscene'; i++) {
      await h.game(() => window.embervale.input.touch.tap('confirm'));
      await h.wait(300);
    }
    await h.game(() => window.embervale.input.touch.tap('pause'));
    await h.until(() => window.embervale.pauseMenu.isOpen, 5000);
    await h.wait(400);
    await h.shot('phone-pause');
    await h.game(() => window.embervale.input.touch.tap('pause'));
    await h.until(() => !window.embervale.pauseMenu.isOpen, 5000);

    await h.page.setViewportSize({ width: 1180, height: 820 });
    await h.wait(1200);
    await h.shot('tablet');
    await h.page.setViewportSize({ width: 390, height: 844 });
    await h.wait(800);
    await h.shot('portrait');
  },
  /** The blight (game/blight.ts): sick field by day and night, the village, mid-lift, and the restored valley. */
  async blight(h) {
    await h.newGame();
    const hours = (n) => h.game((n) => (window.embervale.state.hours = n), n);
    await hours(12);
    await h.wait(1500);
    await h.shot('blight-day');
    await hours(22);
    await h.wait(1500);
    await h.shot('blight-night');
    await hours(12);
    await h.teleport(-62, -40, Math.PI);
    await h.wait(1500);
    await h.shot('blight-village');
    // The seal breaks: the blight eases out over ~4 s.
    // Headless game time runs slow: wait on the level, not the clock.
    await h.game(() => window.embervale.state.set('valleyOpen'));
    await h.until(() => window.embervale.sky.blight < 0.6, 30000);
    await h.shot('blight-lifting');
    await h.until(() => window.embervale.sky.blight === 0, 60000);
    await h.wait(500);
    await h.shot('blight-lifted-village');
    await h.teleport(0, 14, Math.PI);
    await h.wait(1200);
    await h.shot('blight-lifted-field');
  },
  /** The choice window (ui/hud.ts `setChoices`, game/dialog.ts) over a dialog question, and the script menu (`choose`) with a red exit row. */
  async choice(h) {
    await h.newGame();
    await h.wait(1200);
    await h.game(() => {
      window.embervale.mode = 'cutscene'; // the dialog only runs in a cutscene
      void window.embervale.ask([{ who: 'Odo', text: 'Stoneward Tunic, 50 gems.' }], ['Stoneward Tunic (50 gems)', 'Life Potion (20 gems)', 'Not now'], 2);
    });
    await h.wait(2500);
    await h.shot('choice-ask');
    await h.game(() => window.embervale.dialog.update(false, 1));
    await h.wait(300);
    await h.shot('choice-ask-selected');
    await h.game(() => void window.embervale.choose('Follow the answer', ['Hall of Sleepers', 'Stay'], 1));
    await h.wait(300);
    await h.shot('choice-menu');
  },
  /** Text boxes (docs/world.md, the text rules): the longest keepers' note, two place signs, a sigil and its toast. */
  async text(h) {
    await h.newGame();
    await h.wait(1200);
    for (const id of ['bud.bells', 'sign.gorge', 'sign.hollow', 'sigil.hollow']) {
      await h.game((s) => window.embervale.runScript(s), id);
      await h.wait(400);
      await h.press('KeyE'); // the first press finishes the typing
      await h.wait(400);
      await h.shot(`text-${id.replace('.', '-')}`);
      await h.press('KeyE'); // the second closes the box; the script ends
      for (let i = 0; i < 30 && (await h.game(() => window.embervale.mode === 'cutscene')); i++) await h.wait(150);
    }
  },
  /** The pause menu's Gear tab (T39): icons drawn from the models, the HUD's flask and glove icons; first a bare new game, then a full kit. */
  async gear(h) {
    await h.newGame();
    await h.wait(800);
    /** Opens the pause menu on the Gear tab, whichever tab it was left on. */
    const openGear = async () => {
      await h.press('KeyP');
      for (let i = 0; i < 4 && (await h.game(() => document.querySelector('.gmenu-tab.active')?.textContent)) !== 'Gear'; i++) await h.press('KeyE');
      await h.wait(300);
    };
    await openGear();
    await h.shot('gear-first');
    await h.press('KeyP');
    await h.game(() => {
      const g = window.embervale;
      ['hasSword', 'hasShield', 'village.stonewardTunic', 'village.dollFound'].forEach((f) => g.state.set(f));
      g.state.items.add('tether');
      g.state.flasks.add('life');
      g.state.flasks.add('attack');
      g.state.flasks.drink(1);
      g.state.bells.hung.add('morrow');
      g.state.bells.carried.add('way');
      g.state.keys = 2;
    });
    await h.wait(600);
    await h.shotOf(h.page.locator('.drinks'), 'gear-hud-drinks');
    await openGear();
    await h.shot('gear-list');
    for (let i = 0; i < 3; i++) await h.press('ArrowDown');
    await h.wait(200);
    await h.shot('gear-glove');
  },
  /** The HUD's sky dial (ui/skyDial.ts) through the day, and the compass strip (ui/compass.ts) at two headings. */
  async hud(h) {
    await h.newGame();
    await h.wait(1200);
    for (const hh of [5.5, 7, 12, 17, 18, 19, 0]) {
      await h.game((n) => (window.embervale.state.hours = n), hh);
      await h.wait(400);
      await h.shotOf(h.page.locator('.hud-top-right'), `hud-dial-${String(hh).replace('.', '_')}`);
    }
    await h.game(() => (window.embervale.state.hours = 12));
    for (const [name, facing] of [['north', Math.PI], ['southwest', -Math.PI / 4]]) {
      // Models face +z, so facing PI looks north; the camera settles behind Wren.
      await h.teleport(0, 14, facing);
      await h.game((f) => (window.embervale.rig.yaw = f + Math.PI), facing);
      await h.wait(800);
      await h.shotOf(h.page.locator('.compass'), `hud-compass-${name}`);
    }
    await h.shot('hud-full');
  },
  /** The blight's thorns and scars (world/overworld/blight.ts): a thicket's ring and its gap, a lone clump, the lone oak, the veins, the grove's guards. */
  async thorns(h) {
    await h.newGame();
    await h.game(() => (window.embervale.state.hours = 11));
    await h.until(() => window.embervale.sky.blight > 0.99, 15000);
    const look = async (name, x, z, facing) => {
      await h.teleport(x, z, facing);
      await h.game((f) => (window.embervale.rig.yaw = f + Math.PI), facing);
      await h.wait(1200);
      await h.shot(name);
    };
    // The roadside ruin's thicket opens to the south-southwest: from the north road side, then at its gap.
    await look('thorns-thicket', 12, 18, 0);
    await look('thorns-gap', 12 - 0.34 * 20, 38 + 0.94 * 20, Math.PI - 0.35);
    const c = await h.game(() => {
      const all = window.embervale.area.growths.clusters;
      const lone = all.find((a) => all.every((b) => b === a || Math.hypot(a.x - b.x, a.z - b.z) > 10));
      return { x: lone.x, z: lone.z };
    });
    await look('thorns-clump', c.x, c.z + 10, Math.PI);
    await look('thorns-oak', 50, -38, Math.atan2(16, -9));
    // The scars (SCARS in layout.ts): up the spine vein toward the gate, its wide pool, the west vein, the grove's guards.
    await look('scars-spine', -2, -28, Math.PI);
    await look('scars-pool', 9, -80, Math.atan2(-6, -24));
    await look('scars-west', -84, -26, Math.atan2(-16, 12));
    await look('scars-post', 40, -48, Math.atan2(15, -12));
  },
  async field(h) {
    await h.newGame();
    await h.wait(1200);
    await h.shot('field-start');
  },
  /**
   * Each place's atmosphere (render/atmosphere.ts, T31) at dawn, noon, dusk and night, in the restored valley (the blight has
   * its own scene): the open field, Thistledown, the rim of Gloaming Hollow (a step outside its Lamplighter trigger), and a
   * shrine room (indoors there is no time of day).
   */
  async atmosphere(h) {
    await h.newGame();
    await h.game(() => {
      const g = window.embervale;
      g.state.set('valleyOpen');
      g.loadArea('overworld');
    });
    await h.wait(2500);
    const places = [
      ['valley', 0, 14, Math.PI],
      ['village', -50, -42, Math.atan2(-12, -16)],
      ['hollow', -23, 112.8, 0],
    ];
    for (const [name, x, z, facing] of places) {
      for (const [when, hours] of [['dawn', 6.3], ['noon', 12], ['dusk', 18], ['night', 22.5]]) {
        await h.game((hours) => (window.embervale.state.hours = hours), hours);
        await h.teleport(x, z, facing);
        await h.wait(3500); // the atmosphere eases across in ~2 s
        await h.shot(`atmosphere-${name}-${when}`);
      }
    }
    await h.game(() => window.embervale.loadArea('shrine'));
    await h.wait(2000);
    await h.shot('atmosphere-shrine');
  },
  /**
   * The new opening (S1): the field at the start (no shield), the crossroads sign, the ruined cottage
   * from the road in (hidden) and from the north gap (in view), the shield inside, and the scream line.
   */
  async opening(h) {
    await h.newGame({ fresh: true });
    await h.wait(1200);
    await h.shot('field-start');
    const sign = await h.game(() => window.embervale.area.interactables.find((i) => i.id === 'sign.crossroads'));
    await h.teleport(sign.x - 1.5, sign.z + 1.5, Math.PI * 0.75);
    await h.press('KeyE');
    await h.wait(1500);
    await h.shot('sign');
    await h.finishScript();
    // The road in, just outside the fence: the cottage should be out of sight behind the houses.
    await h.teleport(-37, -31, Math.atan2(-25, -27));
    await h.wait(1500);
    await h.shot('road-in');
    // Leaving through the north gap: the cottage straight ahead.
    await h.teleport(-62, -84, Math.PI);
    await h.wait(1500);
    await h.shot('north-gap');
    await h.teleport(-60, -91, Math.PI);
    await h.wait(1000);
    await h.shot('cottage-front');
    // Take it: the guard page, then the scream line.
    const p = await h.game(() => ({ x: window.embervale.area.shield.x, z: window.embervale.area.shield.z }));
    await h.teleport(p.x, p.z + 1.6, Math.PI);
    await h.wait(400);
    await h.press('KeyE');
    for (let i = 0; i < 20 && !(await h.game(() => document.querySelector('.dialog:not(.hidden)')?.textContent.includes('Ahh'))); i++) await h.press('Enter', 1, 450);
    await h.wait(800);
    await h.shot('scream');
    await h.finishScript();
    await h.shot('with-shield');
  },
  /** The ruins (S3): every ruined home from its open front, then one from the side with its jars, and Thistledown's ring from the square. */
  async ruins(h) {
    await h.newGame();
    // The blight's thornlings lie by some of the ruins: Wren stays standing (a death is a cutscene that fades to black).
    await h.game(() => {
      window.embervale.state.set('hasSword');
      window.embervale.player.invuln = 1e6;
    });
    const ruins = await h.game(async () => (await import('/src/world/overworld/layout.ts')).RUINS.map((r) => ({ id: r.id, x: r.x, z: r.z, yaw: r.yaw, r: r.r })));
    for (const r of ruins) {
      const fx = Math.sin(r.yaw), fz = Math.cos(r.yaw);
      await h.teleport(r.x + fx * (r.r + 3), r.z + fz * (r.r + 3), r.yaw + Math.PI);
      await h.wait(1500);
      await h.shot(`ruin-${r.id}`);
    }
    // The square: the two standing homes and the two ruined ones around the well.
    await h.teleport(-62, -50, Math.atan2(0, -1));
    await h.wait(1200);
    await h.shot('ring-north');
    await h.teleport(-62, -66, 0);
    await h.wait(1200);
    await h.shot('ring-south');
  },
  async village(h) {
    await h.newGame();
    await h.teleport(-50, -42, Math.atan2(-12, -16));
    await h.wait(1500);
    await h.shot('village');
  },
  /**
   * The entrance vignette (golden set 3, T51; docs/art.md): Thistledown's road in, standing where the `village` shot stands.
   * Blighted at noon (how a new game first sees it), then restored at noon, dusk and night; a close look at the grove's
   * trees and at a field rock.
   */
  async vignette(h) {
    await h.newGame();
    const hours = (n) => h.game((n) => (window.embervale.state.hours = n), n);
    const roadIn = () => h.teleport(-50, -42, Math.atan2(-12, -16));
    await h.game(() => (window.embervale.player.invuln = 1e6)); // the grove's thornlings stay off Wren
    await hours(12);
    await roadIn();
    await h.wait(3500);
    await h.shot('vignette-blight');
    await h.game(() => window.embervale.state.set('valleyOpen'));
    await h.until(() => window.embervale.sky.blight === 0, 60000);
    for (const [when, n] of [['noon', 12], ['dusk', 18], ['night', 22.5]]) {
      await hours(n);
      await roadIn();
      await h.wait(3500); // the atmosphere eases across in ~2 s, the baked light lands in a few
      await h.shot(`vignette-${when}`);
    }
    await hours(12);
    await h.teleport(76, -68, Math.atan2(6, -10));
    await h.wait(5000); // wait out the grove's name card
    await h.shot('vignette-trees');
    // The field rock nearest the road in that stands about knee high.
    const rock = await h.game(() => {
      let best = null;
      window.embervale.area.root.traverse((o) => {
        if (o.name !== 'rocks') return;
        const a = o.instanceMatrix.array;
        for (let i = 0; i < o.count; i++) {
          const e = a.subarray(i * 16, i * 16 + 16);
          const x = e[12], z = e[14], s = Math.hypot(e[0], e[1], e[2]);
          const d = Math.hypot(x + 30, z + 20);
          if (s > 0.8 && s < 1.6 && (!best || d < best.d)) best = { x, z, d };
        }
      });
      return best;
    });
    await h.teleport(rock.x + 2.5, rock.z + 2.5, Math.atan2(-1, -1));
    await h.wait(1500);
    await h.shot('vignette-rock');
  },
  /**
   * The baked light (render/bakeLight.ts, T48) on and off in each kind of place, the restored valley at noon: Thistledown,
   * the open field, a ruin, the grove, the gorge, the camp and a shrine room (the indoor profile). Prints each bake's cost.
   */
  async bake(h) {
    await h.newGame();
    await h.game(() => {
      const g = window.embervale;
      g.state.set('valleyOpen');
      g.state.hours = 12;
      g.loadArea('overworld');
    });
    await h.wait(2500);
    const both = async (name) => {
      await h.game(() => window.embervaleBake.set(true));
      await h.shot(`bake-${name}-on`);
      await h.game(() => window.embervaleBake.set(false));
      await h.shot(`bake-${name}-off`);
      await h.game(() => window.embervaleBake.set(true));
    };
    const stand = async (name, x, z, facing) => {
      await h.game(() => window.embervale.enemies.list.forEach((e) => (e.alive = false)));
      await h.teleport(x, z, facing);
      await h.wait(1500);
      await both(name);
    };
    await stand('village', -50, -42, Math.atan2(-12, -16));
    await stand('valley', 0, 14, Math.PI);
    const ruin = await h.game(async () => (await import('/src/world/overworld/layout.ts')).RUINS.map((r) => ({ x: r.x, z: r.z, yaw: r.yaw, r: r.r }))[0]);
    await stand('ruin', ruin.x + Math.sin(ruin.yaw) * (ruin.r + 3), ruin.z + Math.cos(ruin.yaw) * (ruin.r + 3), ruin.yaw + Math.PI);
    await stand('grove', 74, -70, Math.atan2(8, -8));
    const gorge = await h.game(() => window.embervale.area.gorgeAt(24, 0));
    await stand('gorge', gorge.x, gorge.z, Math.atan2(-14, -4));
    // The camp from a free camera (the Northpass streams in around it; Wren parks on the pass below, out of the shot).
    await h.game(() => window.embervale.area.streamAt(-10, -245));
    await h.teleport(-10, -226, Math.PI);
    await h.wait(1500);
    await h.game(() => {
      const g = window.embervale;
      g.rig.frozen = true;
      g.camera.position.set(-14, 16.5, -243);
      g.camera.lookAt(-10, 12.5, -258);
    });
    await h.wait(700);
    await both('camp');
    await h.game(() => {
      window.embervale.rig.frozen = false;
      window.embervale.loadArea('shrine');
    });
    await h.wait(2000);
    await both('shrine');
    const stats = await h.game(() => window.embervaleBake.stats);
    for (const s of stats) console.log(`      bake ${s.label}: ${s.points} points, ${s.occluderTris} occluder tris, prep ${s.prepMs} ms (main thread), done in ${s.totalMs} ms`);
  },
  /** After the prism: the blight gone and Thistledown with only Lark and Pip; Odo's stall unattended. */
  async emptyVillage(h) {
    await h.newGame();
    await h.game(() => {
      const g = window.embervale;
      g.state.set('valleyOpen');
      g.state.hours = 12;
      g.loadArea('overworld');
    });
    await h.wait(2500);
    await h.teleport(-50, -42, Math.atan2(-12, -16));
    await h.wait(1500);
    await h.shot('empty-village');
  },
  /** Shield surfing: Wren mid-ride on the road with dust, then Lark (the kid who gives the idea) by the well. */
  async surf(h) {
    await h.newGame();
    await h.game(() => window.embervale.state.set('village.surfIdea'));
    await h.teleport(-30, -30, Math.atan2(-12, -16));
    await h.wait(600);
    await h.page.keyboard.down('KeyW');
    await h.page.keyboard.down('ShiftLeft');
    await h.press('Space');
    await h.until(() => window.embervale.player.surfing, 10000);
    await h.wait(700);
    await h.shot('surf-ride');
    await h.page.keyboard.up('KeyW');
    await h.wait(500);
    await h.shot('surf-coast');
    await h.page.keyboard.up('ShiftLeft');
    // A few steps off, turned a little so Wren doesn't stand in front of the kid.
    await h.teleport(-62 - 3, -58 + 4.5 + 4.5, Math.PI + 0.35);
    await h.wait(1200);
    await h.shot('surf-lark');
  },
  /** Thistledown's details: the well's shaft, both cottages' fronts, the mill doorstep; then lit up at night. */
  async villageDetails(h) {
    await h.newGame();
    await h.teleport(-60, -36, 0); // Wren parked out of the shots
    const ground = await h.game(() => window.embervale.physics.groundY(-62, -61) ?? 1.2);
    const cam = async (name, from, to) => {
      await h.game(([from, to]) => {
        const g = window.embervale;
        g.rig.frozen = true;
        g.camera.position.set(...from);
        g.camera.lookAt(...to);
      }, [from, to]);
      await h.wait(700);
      await h.shot(name);
    };
    const y = ground;
    await cam('well-shaft', [-62, y + 4.5, -55.5], [-62, y, -58]);
    await cam('cottage-east', [-56.5, y + 1.8, -59], [-46, y + 1.8, -60.5]);
    await cam('cottage-southwest', [-66, y + 1.8, -53.5], [-74, y + 1.8, -46]);
    await cam('mill-doorstep', [-74.5, y + 1.6, -57], [-79.6, y + 0.6, -58]);
    await h.game(() => (window.embervale.state.hours = 22));
    await h.wait(1500);
    await cam('night-square', [-50, y + 4, -46], [-62, y + 1, -58]);
    await cam('night-mill', [-72, y + 2.5, -55], [-79.6, y + 2, -58]);
    await h.game(() => (window.embervale.rig.frozen = false));
  },
  /** Pip, the smallest villager, east of the well by the standing cottage, by day and by night. */
  async pip(h) {
    await h.newGame();
    // Looking past her (north of her), so Wren isn't between her and the camera.
    await h.teleport(-58, -50, Math.atan2(6.2, -8.4));
    await h.wait(1200);
    await h.shot('pip');
    await h.game(() => (window.embervale.state.hours = 22));
    await h.wait(1200);
    await h.shot('pip-night');
  },
  /**
   * The villagers (golden set 5, T53; docs/art.md): Pip close up with Wren far off (her idle), with Wren near (the peek),
   * holding Button (once returned), and the five of them in the square; then the models alone in the viewer
   * (`LOOK_VILLAGERS=id,id` picks which).
   */
  async villagers(h) {
    await h.newGame();
    await h.game(() => {
      window.embervale.player.invuln = 1e6;
      window.embervale.state.hours = 12;
    });
    // Pip's spot, and a camera `dist` in front of her (along her base facing toward the square), `side` to her left.
    const pip = await h.game(() => {
      const n = window.embervale.area.npcs.pip;
      return { x: n.x, y: n.y, z: n.z, yaw: n.baseYaw };
    });
    const f = { x: Math.sin(pip.yaw), z: Math.cos(pip.yaw) };
    const view = (dist, side, height, look = 0.62) =>
      h.game(([pip, f, dist, side, height, look]) => {
        const g = window.embervale, T = g.player.pos.constructor;
        g.rig.shot(new T(pip.x + f.x * dist - f.z * side, pip.y + height, pip.z + f.z * dist + f.x * side), new T(pip.x, pip.y + look, pip.z), true);
      }, [pip, f, dist, side, height, look]);
    // Wren far behind the camera: Pip keeps her base facing and her idle.
    await h.teleport(pip.x + f.x * 12, pip.z + f.z * 12, pip.yaw + Math.PI);
    await h.wait(4500); // the area's name card
    await view(3.1, 1.0, 1.0);
    await h.wait(400);
    await h.shot('pip-idle');
    // Wren close in front of her: she turns to them and peeks.
    await h.teleport(pip.x + f.x * 2.6 + f.z * 1.2, pip.z + f.z * 2.6 - f.x * 1.2, pip.yaw + Math.PI);
    await h.wait(1500);
    await view(2.8, -2.0, 1.1);
    await h.wait(300);
    await h.shot('pip-near');
    // Button returned: she hugs her doll.
    await h.game(() => {
      const g = window.embervale;
      g.state.set('village.dollFound');
      g.state.set('village.dollReturned');
      g.area.npcs.pip.hold?.(true);
    });
    await h.teleport(pip.x + f.x * 12, pip.z + f.z * 12, pip.yaw + Math.PI);
    await h.wait(1500);
    await view(3.1, 1.0, 1.0);
    await h.wait(400);
    await h.shot('pip-doll');
    // The five of them around the well, from above the square's southeast side.
    await h.teleport(-50, -45, Math.atan2(-12, -13));
    await h.wait(1200);
    await h.game(() => {
      const g = window.embervale, T = g.player.pos.constructor, y = g.player.pos.y;
      g.rig.shot(new T(-49, y + 6, -44), new T(-61, y + 0.5, -56), true);
    });
    await h.wait(400);
    await h.shot('square');

    const mode = ['native', 'performance', 'n64'][display] ?? 'native';
    await h.page.setViewportSize({ width: 900, height: 900 });
    for (const asset of (process.env.LOOK_VILLAGERS ?? 'pip,villager').split(',')) {
      for (const [name, deg] of [['front', 0], ['three-quarter', 45], ['side', 90]]) {
        const url = new URL('viewer.html', h.page.url());
        url.search = `?asset=${asset}&panel=0&angle=${deg}&display=${mode}`;
        await h.page.goto(url.href);
        await h.until(() => window.embervale?.mode === 'viewer', 30000);
        await h.wait(400);
        await h.shot(`${asset}-${name}`);
      }
    }
  },
  /** The bigger cottages from the square, Odo's stall, Wren in the Stoneward Tunic, the mill's door and its room (the ground floor). */
  async mill(h) {
    await h.newGame();
    await h.teleport(-52, -52, Math.atan2(-10, -6));
    await h.wait(1200);
    await h.shot('village-cottages');
    await h.teleport(-63, -62, -Math.PI / 2);
    await h.wait(1200);
    await h.shot('stall');
    await h.game(() => {
      const g = window.embervale;
      g.state.set('village.stonewardTunic');
      g.player.setStoneward(true);
    });
    await h.teleport(-77.5, -58, -Math.PI / 2); // facing the mill door (west), a few steps from it
    await h.wait(1200);
    await h.shot('mill-door-tunic');
    // Free camera (Wren parked out of the way) so nothing blocks the view.
    const cam = async (name, from, to) => {
      await h.game(([from, to]) => {
        const g = window.embervale;
        g.rig.frozen = true;
        g.camera.position.set(...from);
        g.camera.lookAt(...to);
      }, [from, to]);
      await h.wait(700);
      await h.shot(name);
    };
    const ground = await h.game(() => window.embervale.physics.groundY(-74, -58) ?? 1); // the square by the mill (not its roof)
    await h.teleport(-60, -40, 0);
    await cam('mill-door-close', [-75.4, ground + 1.7, -56.6], [-79.6, ground + 1.3, -58]);
    await cam('mill-sails', [-72, ground + 5, -47], [-80, ground + 8, -58]);
    const sign = await h.game(() => {
      const g = window.embervale;
      const s = g.area.interactables.find((i) => i.id === 'sign.crossroads');
      return { x: s.x, z: s.z, sx: g.area.spawn.x, sz: g.area.spawn.z, y: g.physics.groundY(s.x + 1.2, s.z + 1.2) ?? 0 }; // beside it: not its collider's top
    });
    const d = Math.hypot(sign.sx - sign.x, sign.sz - sign.z);
    await cam('sign', [sign.x + ((sign.sx - sign.x) / d) * 3, sign.y + 1.7, sign.z + ((sign.sz - sign.z) / d) * 3], [sign.x, sign.y + 1.4, sign.z]);
    // Tobin's room, the windmill's ground floor: the door swung open, looking in; inside; the bed.
    await h.game(() => window.embervale.area.millDoor.setOpen(true));
    await h.wait(800);
    await cam('mill-door-open', [-73.5, ground + 1.7, -58.4], [-84, ground + 1.1, -58]);
    await cam('mill-bed', [-82, ground + 2.6, -60.2], [-86.5, ground + 0.5, -57.1]);
    await h.game(() => (window.embervale.rig.frozen = false));
    await h.teleport(-82.5, -58, -Math.PI / 2, ground + 1.5);
    await h.wait(1500);
    console.log('mill-inside: Wren, camera', await h.game(() => {
      const g = window.embervale;
      return [g.player.pos, g.camera.position].map((v) => [v.x, v.y, v.z].map((n) => n.toFixed(1)).join(', '));
    }));
    await h.shot('mill-inside');
  },
  async grove(h) {
    await h.newGame();
    await h.teleport(74, -70, Math.atan2(8, -8));
    await h.wait(1500);
    await h.shot('grove');
  },
  async chest(h) {
    // The locked grove chest from the road, with the interact prompt floating over it.
    await h.newGame();
    const c = await h.game(() => ({ x: window.embervale.area.chest.x, z: window.embervale.area.chest.z }));
    await h.game(() => window.embervale.enemies.list.forEach((e) => (e.alive = false)));
    await h.teleport(c.x - 1.6, c.z + 1.6, Math.atan2(1.6, -1.6));
    await h.wait(1200);
    await h.shot('chest-locked');
  },
  async door(h) {
    // The shrine door asleep (dark spiral), then awake (glowing) once the lantern is relit.
    await h.newGame();
    const d = await h.game(() => ({ x: window.embervale.area.door.x, z: window.embervale.area.door.z }));
    await h.teleport(d.x - 6, d.z, Math.PI / 2);
    await h.wait(1200);
    await h.shot('door-asleep');
    await h.game(() => window.embervale.area.door.wake(true));
    await h.teleport(d.x - 2.2, d.z, Math.PI / 2);
    await h.wait(800);
    await h.shot('door-awake');
    // The end of the lantern cutscene's shot (its start is door-awake's neighbour: spiral height, 11 m back), then pulled back and up.
    const shotAt = async (name, from, at) => {
      await h.game(([f, a]) => {
        const g = window.embervale;
        const V = g.player.pos.constructor; // the page has no THREE global
        g.rig.shot(new V(...f), new V(...a), true);
      }, [from, at]);
      await h.wait(600);
      await h.shot(name);
    };
    const gy = await h.game(() => window.embervale.area.door.mesh.position.y - 3.05); // the door's base (a ray from above would land on the lintel)
    await shotAt('door-cut', [d.x - 11, gy + 2.7, d.z + 2.5], [d.x - 0.8, gy + 3.4, d.z]);
    await shotAt('door-pullback', [d.x - 15, gy + 4.9, d.z + 1.5], [d.x - 0.8, gy + 6.4, d.z]);
    await h.game(() => window.embervale.rig.release());
  },
  async dungeon(h) {
    // The Waking Shrine built from its data: a few rooms at eye level, then a top-down view
    // of each floor (ceilings hidden, daylight on so the layout reads) to compare with
    // `npm run map -- shrine`.
    await h.newGame();
    await h.game(() => {
      window.embervale.loadArea('shrine');
    });
    await h.wait(1500);
    await h.shot('dungeon-entry');
    const room = (id) => h.game((id) => window.embervale.area.def.rooms.find((r) => r.id === id), id);
    const inside = async (name, id, fx, fz, facing) => {
      const r = await room(id);
      await h.game(([r, fx, fz, facing]) => {
        const g = window.embervale;
        const y = r.floor * 8 + 0.05;
        g.player.teleport(r.x + r.w * fx, y, r.z + r.d * fz, facing);
        g.rig.snap(g.player.pos, facing);
      }, [r, fx, fz, facing]);
      await h.wait(1200);
      await h.shot(name);
    };
    await h.game(() => window.embervale.enemies.list.forEach((e) => (e.alive = false)));
    // One or two rooms from each wing: sandstone halls, marble galleries, mossy undercroft, basalt hearth.
    await inside('dungeon-nave', 'nave', 0.25, 0.85, Math.PI * 0.75);
    await inside('dungeon-statues', 'statueGallery', 0.5, 0.15, 0);
    await inside('dungeon-court', 'sunkenCourt', 0.15, 0.35, Math.PI / 2);
    await inside('dungeon-gallery', 'gallery', 0.5, 0.75, Math.PI);
    await inside('dungeon-crystals', 'crystalWalk', 0.15, 0.5, Math.PI / 2);
    await inside('dungeon-cistern', 'cistern', 0.4, 0.15, 0);
    await inside('dungeon-pithall', 'pitHall', 0.85, 0.5, -Math.PI / 2);
    await inside('dungeon-gauntlet', 'gauntlet', 0.5, 0.85, Math.PI);
    await h.game(() => window.embervale.area.hearth && (window.embervale.area.hearth.armed = false)); // no fight, just the room
    await inside('dungeon-boss', 'boss', 0.5, 0.6, Math.PI);
    for (const floor of [1, 0, -1, -2]) {
      await h.game((floor) => {
        const g = window.embervale, a = g.area;
        a.showFloor(floor);
        g.sky.setIndoor(false);
        g.state.hours = 12;
        const rooms = a.def.rooms.filter((r) => r.floor === floor);
        const minX = Math.min(...rooms.map((r) => r.x)), maxX = Math.max(...rooms.map((r) => r.x + r.w));
        const minZ = Math.min(...rooms.map((r) => r.z)), maxZ = Math.max(...rooms.map((r) => r.z + r.d));
        const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, span = Math.max(maxX - minX, (maxZ - minZ) * 1.6);
        g.player.teleport(cx, floor * 8 + 200, cz); // out of the shot
        g.rig.frozen = true;
        g.camera.position.set(cx, floor * 8 + span * 0.95, cz + 0.01);
        g.camera.lookAt(cx, floor * 8, cz);
      }, floor);
      await h.wait(700);
      await h.shot(`dungeon-floor${floor}`);
    }
  },
  async camera(h) {
    // Wren with her back to a wall in tight rooms: the camera should sit in front of the wall,
    // close, with Wren faded (dithered) when it's very close. Plus an open room for comparison.
    await h.newGame();
    await h.game(() => {
      window.embervale.loadArea('shrine');
    });
    await h.wait(1500);
    await h.game(() => window.embervale.enemies.list.forEach((e) => (e.alive = false)));
    const backTo = async (name, id, fx, fz, facing) => {
      await h.game(([id, fx, fz, facing]) => {
        const g = window.embervale, r = g.area.def.rooms.find((q) => q.id === id);
        g.player.teleport(r.x + r.w * fx, r.floor * 8 + 0.05, r.z + r.d * fz, facing);
        g.rig.snap(g.player.pos, facing);
      }, [id, fx, fz, facing]);
      await h.wait(1200);
      await h.shot(name);
    };
    await backTo('lookout', 'lookout', 0.5, 0.1, 0); // 8×12 m, back to the north wall
    await backTo('gallery', 'gallery', 0.12, 0.5, Math.PI / 2); // the 10 m wide Long Gallery, back to the west wall
    await backTo('corner', 'southCell', 0.06, 0.08, Math.PI / 4); // a corner
    await backTo('open', 'nave', 0.5, 0.5, 0); // the middle of a big room
  },
  async glove(h) {
    // The Tether Glove: the cord mid-throw and the HUD slot. (The Pit Hall's column bridge is
    // shot by the shrine-glove smoke scenario: smoke-output/shrine-glove/02-bridge.png.)
    await h.newGame();
    await h.game(() => {
      const g = window.embervale;
      g.state.items.add('tether');
      g.loadArea('shrine');
    });
    await h.wait(1500);
    await h.game(() => window.embervale.enemies.list.forEach((e) => (e.alive = false)));
    // Loft: two cells east of the heavy stone, facing it; throw, then freeze with the cord out.
    await h.game(() => {
      const g = window.embervale, r = g.area.def.rooms.find((q) => q.id === 'loft');
      const s = g.area.stones.get('loftStone').group.position;
      g.player.teleport(s.x + 4, r.floor * 8 + 0.05, s.z, -Math.PI / 2);
      g.rig.snap(g.player.pos, -Math.PI / 2);
      g.rig.yaw += Math.PI / 2; // from the side, so Wren doesn't hide the cord
    });
    await h.wait(1000);
    await h.game(() => window.embervale.combat.throwTether());
    await h.wait(120);
    await h.game(() => window.embervale.setTimeScale(0.01));
    await h.wait(300);
    await h.shot('cord');
    await h.game(() => window.embervale.setTimeScale(1));
    await h.wait(1500);
    await h.shot('hud');
  },
  async landmarks(h) {
    // The three landmark statues, each seen from the doorway Wren usually arrives by.
    await h.newGame();
    await h.game(() => {
      window.embervale.loadArea('shrine');
    });
    await h.wait(1500);
    await h.game(() => window.embervale.enemies.list.forEach((e) => (e.alive = false)));
    // Free camera at eye level (Wren parked out of the shot): `from` and `to` are [x, z, y above the floor].
    const view = async (name, floor, from, to) => {
      await h.game(([floor, from, to]) => {
        const g = window.embervale;
        g.player.teleport(from[0], floor * 8 + 0.05, from[1], 0);
        g.rig.frozen = true;
        g.camera.position.set(from[0], floor * 8 + from[2], from[1]);
        g.camera.lookAt(to[0], floor * 8 + to[2], to[1]);
      }, [floor, from, to]);
      await h.wait(900);
      await h.shot(name);
    };
    await view('landmark-nave', 0, [14.8, 7, 2.2], [22, 1, 3.2]); // just inside the nave's west doorway, from the entry hall
    await view('landmark-gallery', 1, [32.5, -0.5, 2.4], [35, -5, 3]); // top of the stairs
    await view('landmark-crypt', -1, [37.2, -2.6, 2.4], [33, 10, 1.8]); // foot of the stairs down
    await view('landmark-nave-side', 0, [18, 13, 2.2], [22, 1, 3.2]);
    await view('landmark-gallery-side', 1, [38.5, 3, 2.2], [35, -5, 3]);
    await view('landmark-crypt-side', -1, [27, 4, 2.2], [33, 10, 1.8]);
  },
  /**
   * The Hall of Sleepers, the golden set's shrine room (T56): from the way in, toward the bell post, the tablet's corner,
   * the whole room from high in a corner, a door frame and sconce close up; then the sandstone wing's shell in the Nave
   * (pillars) and the Gallery of Statues (kneeling keepers); T56c adds the dressing's shots (east, west, niche, banners, floor). The models alone: `shrineModels`.
   */
  async shrineHall(h) {
    await h.newGame();
    await h.game(() => window.embervale.loadArea('shrine'));
    await h.wait(1500);
    await h.game(() => window.embervale.enemies.list.forEach((e) => (e.alive = false)));
    // Free camera, Wren hidden: `from` and `to` are [x, z, y above the floor] (floor 0 is y = 0). Wren waits mid-room
    // (`park`): standing at a camera spot near the way out would walk them out of the shrine (its exit trigger).
    const view = async (name, from, to, park = [9, 4]) => {
      await h.game(([from, to, park]) => {
        const g = window.embervale;
        g.player.teleport(park[0], 0.05, park[1], 0);
        g.hidePlayer(true);
        g.rig.frozen = true;
        g.camera.position.set(from[0], from[2], from[1]);
        g.camera.lookAt(to[0], to[2], to[1]);
      }, [from, to, park]);
      await h.wait(900);
      await h.shot(name);
    };
    await view('hall-in', [1.2, 6, 1.7], [14, 7, 2]); // from the way in: the nave door, the stone before it
    await view('hall-bell', [12.5, 2, 2.2], [4, 10, 1.5]); // the bell post, the gallery door, the way out
    await view('hall-tablet', [8, 5, 1.8], [3, 1, 1.2]); // the tablet in its corner
    await view('hall-high', [13.2, 11.3, 5.5], [4, 2, 0.5]); // the whole room from high in a corner: walls, ceiling, floor
    await view('hall-frame', [9.5, 10.6, 2.3], [14, 7, 2.6]); // the nave door's frame, the stone before it
    await view('hall-sconce', [8.6, 2.4, 3], [7, 0.3, 3.3]); // a sconce on the north wall, close
    await view('hall-east', [1.5, 9, 2.2], [14, 3.5, 3.2]); // the east wall: the relief, the face, the doorway and its lintel, the niche beyond
    await view('hall-west', [12.5, 6, 2.2], [0, 6, 3.4]); // the west wall: the entrance's lintel, the relief, the niche and its banner
    await view('hall-niche', [4.6, 8.7, 3.0], [0.3, 8.7, 3.2]); // an offering niche close: candles and the bowl
    await view('hall-banners', [7, 8, 2.8], [7, 0, 3.6]); // the north wall: banners either side of the sconce
    await view('hall-floor', [7, 11.5, 6.5], [7, 4.5, 0]); // from high: cracked and sunken flags, drifts, rubble at the feet
    await view('hall-nave', [15.5, -2.5, 2], [26, 12, 3], [22, 6]); // the wing next door: the nave's pillars
    await view('hall-gallery', [7, 13.5, 2], [7, 24, 2.2], [4, 17]); // the Gallery of Statues: kneeling keepers along the walls
  },
  /** The Deep Shaft stairs (shaftUp): tread nosings must be clean (no flicker) and the top landing clear. */
  async stairs(h) {
    await h.newGame();
    await h.game(() => window.embervale.loadArea('shrine'));
    await h.wait(1500);
    await h.game(() => window.embervale.enemies.list.forEach((e) => (e.alive = false)));
    const view = async (name, floor, from, to) => {
      await h.game(([floor, from, to]) => {
        const g = window.embervale;
        g.player.teleport(from[0], floor * 8 + 0.05, from[1], 0);
        g.hidePlayer(true); // the camera stands where Wren does: not inside the head
        g.rig.frozen = true;
        g.camera.position.set(from[0], floor * 8 + from[2], from[1]);
        g.camera.lookAt(to[0], floor * 8 + to[2], to[1]);
      }, [floor, from, to]);
      await h.wait(900);
      await h.shot(name);
    };
    await view('stairs-foot', -1, [26.5, -4.6, 1.7], [26.5, -10, 2.2]); // up the flight from its foot
    await view('stairs-treads', -1, [27.4, -5.4, 2.6], [26.3, -9, 1.4]); // close on the nosings, from the foot's side
    await view('stairs-landing', 0, [26.5, -11, 2.6], [26.5, -19, 0.4]); // the top landing, from above the shaft
  },
  /** The shrine's entrance: an open doorway that must show only darkness beyond. */
  async entrance(h) {
    await h.newGame();
    await h.game(() => window.embervale.loadArea('shrine'));
    await h.wait(900);
    await h.shot('entrance-inside');
    // From beside the doorway, looking out and down at the threshold.
    await h.game(() => {
      const g = window.embervale;
      const t = g.area.triggers.find((x) => x.id === 'exit'), s = g.area.spawn;
      const d = { x: t.x, y: t.y, z: t.z };
      const T = g.player.pos.constructor;
      const k = new T(d.x - s.x, 0, d.z - s.z).normalize();
      g.rig.shot(new T(d.x - k.x * 1.6 - k.z * 0.9, d.y + 1.3, d.z - k.z * 1.6 + k.x * 0.9), new T(d.x + k.x * 2, d.y + 0.2, d.z + k.z * 2), true);
    });
    await h.wait(600);
    await h.shot('entrance-threshold');
  },
  /** Murmurbuds (docs/world.md): each in its nook; one asleep, growing (gauge), overloaded, open; the pause menu: settings, hints, messages. */
  async buds(h) {
    await h.newGame();
    await h.game(() => (window.embervale.state.hours = 10));
    /** Parks the camera off to the side of a bud, `dist` out and `up` high, looking at it (Wren never in line). */
    // From the bud's east-south-east (open ground at all three); Wren stands to the camera's left.
    // (The flasks bud is framed from the lake's side instead: a pine stands to its east.)
    const frame = (id, dist, up) =>
      h.game(([id, dist, up]) => {
        const g = window.embervale;
        const at = g.area.buds.get(id).center;
        const T = at.constructor;
        const [dx, dz] = id === 'bud.flasks' || id === 'bud.boss' ? [-0.87, 0.5] : [0.87, -0.5];
        g.rig.shot(new T(at.x + dist * dx, at.y + up, at.z + dist * dz), new T(at.x, at.y + 0.6, at.z), true);
      }, [id, dist, up]);
    const where = (id) => h.game((id) => {
      const bud = window.embervale.area.buds.get(id);
      return { x: bud.x, z: bud.z };
    }, id);
    for (const id of ['bud.tunic', 'bud.flasks', 'bud.bells', 'bud.boss']) {
      const b = await where(id);
      await h.teleport(b.x + 0.9, b.z + 1.6, Math.atan2(-0.9, -1.6)); // beside it, for scale
      await frame(id, 9, 3.5);
      await h.wait(1000);
      await h.shot(`nook-${id.slice(4)}`);
    }
    // Close up on the tunic bud, Wren beside it, swinging range.
    const b = await where('bud.tunic');
    await h.teleport(b.x + 0.9, b.z + 1.6, Math.atan2(-0.9, -1.6));
    await frame('bud.tunic', 6.5, 2.6);
    await h.wait(800);
    await h.shot('asleep');
    /** Sets the bud's rule (and its look) by hand, then waits for the look to catch up. */
    const set = (r) => h.game((r) => {
      const g = window.embervale;
      Object.assign(g.buds.rule('bud.tunic'), r);
      const look = g.area.buds.get('bud.tunic');
      if (r.sulk) look.sulk();
      if (r.opened) look.open();
    }, r);
    await set({ gauge: 0.62, growth: 0.55 });
    await h.wait(500);
    await h.shot('growing');
    await set({ gauge: 1, growth: 0, sulk: 1.2 });
    await h.wait(200);
    await h.shot('overloaded');
    await h.wait(1500);
    await set({ gauge: 0, growth: 1, opened: true });
    await h.wait(1500);
    await h.shot('open');
    await h.press('KeyP');
    await h.wait(300);
    await h.shot('pause-settings');
    await h.press('KeyP');
    await h.game(() => ['hint.tunic', 'hint.bells'].forEach((f) => window.embervale.state.set(f)));
    await h.press('KeyP');
    await h.press('KeyE');
    await h.wait(300);
    await h.shot('pause-hints');
    await h.press('ArrowDown');
    await h.game(() => window.embervale.state.set('sigil.cell'));
    await h.press('KeyP'); // closes
    await h.press('KeyP');
    await h.press('KeyE');
    await h.wait(300);
    await h.shot('pause-messages');
  },
  /** The keepers' bell posts (docs/bells.md): empty, hung, ringing; the travel menu; the shrine's post in its hall. */
  async bells(h) {
    /** Camera in front of a post and off to one side, looking at its hook. */
    const closeUp = (bell, dist = 4.2, side = 1.6) =>
      h.game(([bell, dist, side]) => {
        const g = window.embervale;
        const post = g.area.bellPosts.get(bell);
        const at = post.bellWorld();
        const T = at.constructor;
        const out = new T(post.front.x - post.x, 0, post.front.z - post.z).normalize();
        g.rig.shot(new T(at.x + out.x * dist - out.z * side, at.y + 0.6, at.z + out.z * dist + out.x * side), at, true);
      }, [bell, dist, side]);
    await h.newGame();
    const p = await h.game(() => {
      const post = window.embervale.area.bellPosts.get('morrow');
      return { x: post.x, z: post.z, fx: post.front.x, fz: post.front.z };
    });
    // From the well's side of the square, facing the post.
    const dx = p.fx - p.x, dz = p.fz - p.z, len = Math.hypot(dx, dz);
    await h.teleport(p.x + (dx / len) * 6, p.z + (dz / len) * 6, Math.atan2(-dx, -dz));
    await h.wait(1200);
    await h.shot('village-empty');
    await closeUp('morrow');
    await h.wait(500);
    await h.shot('village-empty-close');
    await h.game(() => window.embervale.area.bellPosts.get('morrow').setHung());
    await h.wait(400);
    await h.shot('village-hung');
    await h.game(() => window.embervale.area.bellPosts.get('morrow').ring());
    await h.wait(450);
    await h.shot('village-ringing');
    await h.game(() => void window.embervale.choose('Follow the answer', ['Hall of Sleepers', 'Stay'])); // never answered: just drawn
    await h.wait(300);
    await h.shot('menu');
    await h.game(() => window.embervale.choice.driver.close());

    await h.game(() => {
      const g = window.embervale;
      g.rig.release();
      g.loadArea('shrine');
    });
    await h.wait(1200);
    await h.shot('shrine-entry');
    await closeUp('lull', 4.6, 1.8);
    await h.wait(500);
    await h.shot('shrine-empty-close');
    await h.game(() => {
      const post = window.embervale.area.bellPosts.get('lull');
      post.setHung();
      post.ring();
    });
    await h.wait(450);
    await h.shot('shrine-ringing');
  },
  /** The Morrowbell after Gravelheart falls (docs/bells.md): the empty post on the square, the bell behind the windmill, and what the player sees walking up to it. */
  async lostBell(h) {
    await h.newGame();
    await h.game(() => {
      const g = window.embervale;
      g.state.set('village.bellMoved');
      g.area.morrowLost.show();
    });
    const at = await h.game(() => {
      const a = window.embervale.area;
      return { x: a.morrowLost.x, y: a.morrowLost.y, z: a.morrowLost.z };
    });
    // From the square it sits behind the mill's flank; the other shots are a walker coming round the tower, and up close.
    await h.teleport(at.x + 12, at.z + 7, -Math.PI / 2 - 0.4);
    await h.wait(1200);
    await h.shot('lost-far');
    await h.teleport(at.x + 3, at.z + 4, Math.PI);
    await h.wait(800);
    await h.shot('lost-near');
    await h.game(([x, y, z]) => {
      const g = window.embervale, T = g.player.pos.constructor;
      g.rig.shot(new T(x - 2.2, y + 1.2, z - 1.2), new T(x, y + 0.4, z), true);
    }, [at.x, at.y, at.z]);
    await h.wait(500);
    await h.shot('lost-close');
    await h.game(() => window.embervale.rig.release());
    await h.teleport(at.x + 8, at.z, -Math.PI / 2);
    await h.wait(800);
    await h.shot('from-mill-door');
  },

  /** The Bell Shaft (the Lullbell's trial): the climb from the door, the pit from above with the bell up top, the top ledges, and the game camera on a ledge. */
  async bellShaft(h) {
    await h.newGame();
    await h.game(() => window.embervale.loadArea('shrine'));
    await h.wait(3000);
    const at = (x, z, y, facing) => h.game(([x, z, y, facing]) => {
      const g = window.embervale;
      const r = g.area.def.rooms.find((r) => r.id === 'bellShaft');
      g.player.teleport(r.x + x, r.floor * 8 + y + 0.05, r.z + z, facing);
      g.rig.snap(g.player.pos, facing);
    }, [x, z, y, facing]);
    /** A fixed camera: room-relative eye and target (y above the room floor). */
    const cam = (eye, target) => h.game(([eye, target]) => {
      const g = window.embervale;
      const r = g.area.def.rooms.find((r) => r.id === 'bellShaft');
      const T = g.player.pos.constructor;
      g.rig.shot(new T(r.x + eye[0], r.floor * 8 + eye[1], r.z + eye[2]), new T(r.x + target[0], r.floor * 8 + target[1], r.z + target[2]), true);
    }, [eye, target]);
    await at(1.5, 19, 0, Math.PI / 2);
    await h.wait(1200);
    await h.shot('shaft-door');
    await h.game(() => window.embervale.hidePlayer(true)); // the camera stands where Wren does: not inside the head
    await cam([1.2, 1.7, 19], [12, 6, 17]);
    await h.wait(1200);
    await h.shot('shaft-climb');
    await h.game(() => window.embervale.hidePlayer(false));
    await cam([4, 17, 27], [13, 9, 13]);
    await h.wait(1200);
    await h.shot('shaft-from-above');
    await h.game(() => window.embervale.rig.release());
    await at(16.5, 23.4, 3.7, Math.PI / 2);
    await h.wait(1500);
    await h.shot('shaft-wide-ledge');
    await at(8.7, 9, 15.7, Math.PI / 2);
    await cam([14, 19, 14], [6.5, 16, 9]);
    await h.wait(1500);
    await h.shot('shaft-top');
  },
  /** The Hushing Gorge (the Morrowbell's trial): the mouth and its sign, the corridor, the pit and climb from above, the bell's pillar, and the game camera on the climb. */
  async gorge(h) {
    await h.newGame();
    await h.game(() => window.embervale.enemies.list.forEach((e) => (e.alive = false)));
    /** A point on the gorge floor `s` m in and `lat` m left of the centerline (via the world's own layout). */
    const spot = (s, lat) => h.game(([s, lat]) => window.embervale.area.gorgeAt(s, lat), [s, lat]);
    const stand = async (s, lat, yaw) => {
      const p = await spot(s, lat);
      await h.teleport(p.x, p.z, yaw);
      await h.wait(1500);
    };
    const cam = (eye, target) => h.game(([eye, target]) => {
      const g = window.embervale;
      const T = g.player.pos.constructor;
      g.rig.shot(new T(...eye), new T(...target), true);
    }, [eye, target]);
    await stand(-6, 0, Math.atan2(-14, -4));
    await h.shot('gorge-mouth');
    await stand(24, 0, Math.atan2(-14, -4));
    await h.shot('gorge-ramp');
    await stand(45, 0, Math.atan2(-14, 10));
    await h.shot('gorge-corridor');
    const a = await spot(55, 0), b = await spot(84, 0);
    await cam([a.x, 22, a.z], [b.x, 9, b.z]);
    await h.wait(1200);
    await h.shot('gorge-pit-from-above');
    await h.game(() => window.embervale.rig.release());
    const c = await h.game(() => window.embervale.area.gorgeCourse.platforms.filter((p) => p.checkpoint)[1]);
    await h.teleport(c.x, c.z, 0, c.top + 0.1);
    await h.wait(1800);
    await h.shot('gorge-climb');
    const bell = await h.game(() => window.embervale.area.gorgeCourse.platforms.at(-1));
    await h.teleport(bell.x, bell.z + 1.5, 0, bell.top + 0.1);
    await h.wait(1800);
    await h.shot('gorge-bell');
  },
  /** A chest with its lid open: the underside of the lid must be solid. */
  async chestOpen(h) {
    await h.newGame();
    const c = await h.game(() => ({ x: window.embervale.area.chest.x, z: window.embervale.area.chest.z }));
    await h.game(() => window.embervale.enemies.list.forEach((e) => (e.alive = false)));
    await h.teleport(c.x - 1.6, c.z + 1.6, Math.atan2(1.6, -1.6));
    await h.wait(800);
    await h.game(() => {
      const g = window.embervale;
      const ch = g.area.chest;
      ch.open(true);
      const T = g.player.pos.constructor, p = ch.group.position, y = ch.group.rotation.y;
      // Wren out of the way: standing where the camera goes, their hood fills the foreground.
      g.player.teleport(p.x - Math.sin(y) * 4, p.y, p.z - Math.cos(y) * 4, y);
      g.rig.shot(new T(p.x + Math.sin(y) * 2.2, p.y + 1.7, p.z + Math.cos(y) * 2.2), new T(p.x, p.y + 1.0, p.z), true);
    });
    await h.wait(600);
    await h.shot('chest-open');
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
  /** The guard gauge beside Wren: one slot down (shield up: red, paused), lowered (green, refilling), then broken. */
  async guard(h) {
    await h.newGame();
    const hit = (guard) =>
      h.game((guard) => {
        const g = window.embervale, p = g.player, f = p.forward;
        return g.combat.hitPlayer(p.pos.clone().set(p.pos.x + f.x * 3, p.pos.y, p.pos.z + f.z * 3), { damage: 2, guard });
      }, guard);
    await h.page.keyboard.down('ShiftLeft');
    await h.until(() => window.embervale.player.shielding, 5000);
    await hit(1);
    await h.wait(500);
    await h.shot('guard-one-down');
    await h.page.keyboard.up('ShiftLeft');
    await h.wait(500);
    await h.shot('guard-refilling');
    await h.page.keyboard.down('ShiftLeft');
    await h.until(() => window.embervale.player.shielding, 5000);
    await hit(3);
    await h.wait(400);
    await h.shot('guard-broken');
    await h.page.keyboard.up('ShiftLeft');
  },
  /** Wren's shield, lowered (on the outside of the left arm, face out to the side) and raised (square in front, facing ahead). */
  async shield(h) {
    await h.newGame();
    await h.game(() => window.embervale.setTimeScale(0.02)); // a still pose
    const views = { front: { dist: 3.2, side: 1.2, height: 1.6, lookHeight: 1.2 }, left: { dist: 0.3, side: -3.2, height: 1.5, lookHeight: 1.2 } };
    for (const [name, o] of Object.entries(views)) {
      await park(h, o);
      await h.wait(600);
      await h.shot(`shield-lowered-${name}`);
    }
    await h.page.keyboard.down('ShiftLeft');
    await h.until(() => window.embervale.player.shielding, 5000);
    for (const [name, o] of Object.entries(views)) {
      await park(h, o);
      await h.wait(600);
      await h.shot(`shield-raised-${name}`);
    }
    await h.page.keyboard.up('ShiftLeft');
  },
  /** Orbs hanging at three heights over open ground at dusk: each blob shadow should be smaller and fainter the higher its orb. */
  async orbs(h) {
    await h.newGame();
    await h.game(() => (window.embervale.state.hours = 19));
    await h.teleport(-40, -30, 0);
    await h.wait(800);
    await h.game(() => {
      const g = window.embervale, p = g.player.pos, T = p.constructor;
      g.player.invuln = 1e6;
      for (const [i, up] of [[0, 1.2], [1, 3], [2, 6]]) {
        g.hazards.orb(new T(p.x - 3 + i * 3, p.y + up, p.z + 6), new T(0, 0, 1), { speed: 0.01, homing: 0, life: 60 });
      }
    });
    await h.wait(300);
    await park(h, { dist: 13, side: 6, height: 3, lookHeight: 1.5 });
    await h.wait(800);
    await h.shot('orbs-heights');
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
  /**
   * The Hollow Lamplighter alone in the viewer (T54, golden set 6): front, three-quarter and side by day, then the front at
   * night in the hollow (its flame, eyes and caged wisps). The in-game shots are the `boss` and `boss-moves` scenes.
   */
  async lamplighter(h) {
    const mode = ['native', 'performance', 'n64'][display] ?? 'native';
    await h.page.setViewportSize({ width: 1000, height: 900 });
    for (const [name, query] of [['front', 'angle=0'], ['three-quarter', 'angle=45'], ['side', 'angle=90'], ['night', 'angle=20&place=hollow&hour=23']]) {
      const url = new URL('viewer.html', h.page.url() === 'about:blank' ? env.url : h.page.url());
      url.search = `?asset=hollow-lamplighter&panel=0&${query}&display=${mode}`;
      await h.page.goto(url.href);
      await h.until(() => window.embervale?.mode === 'viewer', 30000);
      await h.wait(300);
      await h.shot(`lamplighter-model-${name}`);
    }
  },
  /** Gravelheart the model in the viewer (T55): front, three-quarter, side and back (the keystone), in the shrine's light. */
  async gravelheartModel(h) {
    const mode = ['native', 'performance', 'n64'][display] ?? 'native';
    await h.page.setViewportSize({ width: 1000, height: 900 });
    for (const [name, query] of [['front', 'angle=0'], ['three-quarter', 'angle=45'], ['side', 'angle=90'], ['back', 'angle=180']]) {
      const url = new URL('viewer.html', h.page.url() === 'about:blank' ? env.url : h.page.url());
      url.search = `?asset=gravelheart&panel=0&place=shrine&${query}&display=${mode}`;
      await h.page.goto(url.href);
      await h.until(() => window.embervale?.mode === 'viewer', 30000);
      await h.wait(300);
      await h.shot(`gravelheart-model-${name}`);
    }
  },
  /** Gravelheart: asleep in its hall, waking, posed from four sides, Hammerfall's windup and stuck slam, the wall stones and the risen ring. */
  async gravelheart(h) {
    await h.newGame();
    await h.game(() => window.embervale.loadArea('shrine'));
    await h.wait(1500);
    const r = await h.game(() => window.embervale.area.def.rooms.find((r) => r.id === 'boss'));
    const door = await h.game(() => window.embervale.area.doors.get('bossDoor').group.position);
    const y = r.floor * 8 + 0.05;
    // Just inside the door, looking across the hall at the heap (outside the trigger).
    await h.game(([x, y, z]) => {
      const g = window.embervale;
      g.area.doors.get('bossDoor').setOpen();
      g.player.teleport(x, y, z, Math.PI);
      g.rig.snap(g.player.pos, Math.PI);
    }, [door.x, y, door.z - 1.5]);
    await h.wait(1500);
    await h.shot('gravelheart-asleep');
    // Walk in: the door shuts, it wakes, the fight starts.
    await h.game(([x, y, z]) => window.embervale.player.teleport(x, y, z, Math.PI), [door.x, y, door.z - 5]);
    await h.until(() => window.embervale.mode === 'play' && !!window.embervale.activeBoss, 60000);
    await h.game(() => (window.embervale.player.invuln = 1e6));
    await h.until(() => !document.querySelector('.boss-title.show'), 15000);
    await h.shot('gravelheart-fight');
    await h.game(() => window.embervale.setTimeScale(0.03));
    for (const [name, o] of Object.entries({
      front: { dist: 9, side: 3, height: 2.6, lookHeight: 3 },
      face: { dist: 4, side: 1, height: 5.2, lookHeight: 4.8 },
      side: { dist: 0.5, side: 8, height: 2.4, lookHeight: 2.8 },
      back: { dist: -8, side: 2.5, height: 3, lookHeight: 2.8 },
    })) {
      await park(h, { ...o, boss: true });
      await h.wait(1200);
      await h.shot(`gravelheart-${name}`);
    }
    // Hammerfall: fists overhead with red eyes, then stuck in the floor with the chest low.
    await h.game(() => window.embervale.setTimeScale(0.5));
    await h.until(() => !window.embervale.activeBoss.move, 20000);
    await h.game(() => window.embervale.activeBoss.forceMove('hammerfall'));
    await waitStep(h, 'hammerfall', 'windup', 0.85);
    await h.game(() => window.embervale.setTimeScale(0.02));
    await park(h, { dist: 9, side: 4, height: 2.6, lookHeight: 3.5, boss: true });
    await h.wait(1200);
    await h.shot('gravelheart-hammer-windup');
    await h.game(() => window.embervale.setTimeScale(0.5));
    await waitStep(h, 'hammerfall', 'recover', 0.4);
    await h.game(() => window.embervale.setTimeScale(0.02));
    await park(h, { dist: 6, side: 4, height: 2.2, lookHeight: 1.6, boss: true });
    await h.wait(1200);
    await h.shot('gravelheart-hammer-stuck');
    // Session B moves: Sweep's windup, the stone volley (stones hovering, then flying), a staggered ember.
    await h.game(() => window.embervale.setTimeScale(0.5));
    await h.until(() => !window.embervale.activeBoss.move, 20000);
    await h.game(() => window.embervale.activeBoss.forceMove('sweep'));
    await waitStep(h, 'sweep', 'windup', 0.8);
    await h.game(() => window.embervale.setTimeScale(0.02));
    await park(h, { dist: 7, side: 4, height: 2.6, lookHeight: 2.6, boss: true });
    await h.wait(1200);
    await h.shot('gravelheart-sweep-windup');
    await h.game(() => window.embervale.setTimeScale(0.5));
    await h.until(() => !window.embervale.activeBoss.move, 20000);
    await h.game(() => window.embervale.activeBoss.forceMove('volley'));
    await waitStep(h, 'volley', 'windup', 0.9);
    await h.game(() => window.embervale.setTimeScale(0.02));
    await park(h, { dist: 9, side: 4, height: 3.2, lookHeight: 3.4, boss: true });
    await h.wait(1200);
    await h.shot('gravelheart-volley-windup');
    await h.game(() => window.embervale.setTimeScale(0.5));
    await h.until(() => !window.embervale.activeBoss.move, 20000);
    await h.game(() => window.embervale.activeBoss.interruptWith('staggered'));
    await waitStep(h, 'staggered', 'active', 0.3);
    await h.game(() => window.embervale.setTimeScale(0.02));
    await park(h, { dist: 6, side: 3, height: 2.4, lookHeight: 2.2, boss: true });
    await h.wait(1200);
    await h.shot('gravelheart-staggered');
    // The hall: wall stones all round, then the ring risen (phase two's wall).
    await h.game(([cx, cz, fy]) => {
      const g = window.embervale, T = g.player.pos.constructor;
      g.rig.shot(new T(cx + 2, fy + 10.5, cz + 19), new T(cx, fy + 1, cz - 2), true);
    }, [r.x + r.w / 2, r.z + r.d / 2, y]);
    await h.wait(1200);
    await h.shot('gravelheart-hall');
    // The drops: the west edge and a hole in the floor, from the ledge.
    await h.game(([cx, cz, fy]) => {
      const g = window.embervale, T = g.player.pos.constructor;
      g.rig.shot(new T(cx - 8, fy + 5, cz + 12), new T(cx - 20, fy - 1, cz - 4), true);
    }, [r.x + r.w / 2, r.z + r.d / 2, y]);
    await h.wait(1200);
    await h.shot('gravelheart-ledge');
    await h.game(() => {
      window.embervale.setTimeScale(1);
      window.embervale.area.hearth.raiseRing();
    });
    await h.wait(3000);
    await h.game(([cx, cz, fy]) => {
      const g = window.embervale, T = g.player.pos.constructor;
      g.setTimeScale(0.02);
      g.rig.shot(new T(cx + 2, fy + 10.5, cz + 19), new T(cx, fy + 1, cz - 2), true);
    }, [r.x + r.w / 2, r.z + r.d / 2, y]);
    await h.wait(1200);
    await h.shot('gravelheart-ring');
  },
  /** Gravelheart phase 2: the howl and the risen ring, Cairn Roll's tell and roll, the daze with the keystone glowing, the kneel. */
  async gravelheart2(h) {
    await h.newGame();
    await h.game(() => window.embervale.loadArea('shrine'));
    await h.wait(1500);
    const r = await h.game(() => window.embervale.area.def.rooms.find((r) => r.id === 'boss'));
    const door = await h.game(() => window.embervale.area.doors.get('bossDoor').group.position);
    const y = r.floor * 8 + 0.05;
    await h.game(([x, y, z]) => {
      const g = window.embervale;
      g.area.doors.get('bossDoor').setOpen();
      g.player.teleport(x, y, z, Math.PI);
      g.rig.snap(g.player.pos, Math.PI);
    }, [door.x, y, door.z - 5]);
    await h.until(() => window.embervale.mode === 'play' && !!window.embervale.activeBoss, 60000);
    await h.game(() => (window.embervale.player.invuln = 1e6));
    await h.until(() => !document.querySelector('.boss-title.show'), 15000);
    // Half health: the howl plays on its own.
    await h.game(() => {
      const b = window.embervale.activeBoss;
      b.hp = 21;
      b.hurt(2, b.pos, 'chest');
    });
    await waitStep(h, 'howl', 'windup', 0.8);
    await h.game(() => window.embervale.setTimeScale(0.02));
    await park(h, { dist: 9, side: 4, height: 2.6, lookHeight: 3.5, boss: true });
    await h.wait(1200);
    await h.shot('gravelheart2-howl');
    await h.game(() => window.embervale.setTimeScale(1));
    await h.until(() => !window.embervale.activeBoss.move, 20000);
    await h.game(() => window.embervale.setTimeScale(0.02));
    await park(h, { dist: 9, side: 3, height: 2.6, lookHeight: 3, boss: true });
    await h.wait(1200);
    await h.shot('gravelheart2-head');
    await h.game(([cx, cz, fy]) => {
      const g = window.embervale, T = g.player.pos.constructor;
      g.rig.shot(new T(cx + 2, fy + 10.5, cz + 19), new T(cx, fy + 1, cz - 2), true);
    }, [r.x + r.w / 2, r.z + r.d / 2, y]);
    await h.wait(1200);
    await h.shot('gravelheart2-ring');
    // Cairn Roll: the rocking tell, the boulder, then dazed against the wall.
    await h.game(() => {
      window.embervale.setTimeScale(0.5);
      window.embervale.activeBoss.forceMove('cairnRoll');
    });
    await waitStep(h, 'cairnRoll', 'windup', 0.9);
    await h.game(() => window.embervale.setTimeScale(0.02));
    await park(h, { dist: 9, side: 4, height: 2.6, lookHeight: 2.4, boss: true });
    await h.wait(1200);
    await h.shot('gravelheart2-roll-windup');
    await h.game(() => window.embervale.setTimeScale(0.5));
    await waitStep(h, 'cairnRoll', 'active', 0.2);
    await h.game(() => window.embervale.setTimeScale(0.02));
    await park(h, { dist: 7, side: 5, height: 2.4, lookHeight: 2, boss: true });
    await h.wait(1200);
    await h.shot('gravelheart2-rolling');
    await h.game(() => window.embervale.setTimeScale(0.5));
    await h.until(() => window.embervale.activeBoss.keyT > 0, 20000);
    await h.game(() => window.embervale.setTimeScale(0.02));
    await park(h, { dist: -8, side: 2.5, height: 3, lookHeight: 2.8, boss: true });
    await h.wait(1200);
    await h.shot('gravelheart2-dazed-keystone');
    // The glove pulls the keystone: it kneels, head bowed to Wren.
    await h.game(() => {
      const g = window.embervale, b = g.activeBoss;
      g.setTimeScale(0.5);
      b.tetherAt(b.pos.clone().addScaledVector(b.forward, -6), b.forward.clone());
    });
    await h.until(() => window.embervale.activeBoss.chestOpen, 20000);
    await h.wait(1500);
    await h.game(() => window.embervale.setTimeScale(0.02));
    await park(h, { dist: 6, side: 3, height: 2.4, lookHeight: 2.2, boss: true });
    await h.wait(1200);
    await h.shot('gravelheart2-kneel');
  },
  /** The magic gate at the valley's north edge: shut (the veil, the floating stones), mid-collapse, and broken. */
  async gate(h) {
    await h.newGame();
    const gc = await h.game(() => { const c = window.embervale.area.gate.center; return { x: c.x, y: c.y, z: c.z }; });
    const view = (dx, dy, dz, ly = 0) => h.game(([gc, dx, dy, dz, ly]) => {
      const g = window.embervale, T = g.player.pos.constructor;
      g.player.teleport(gc.x, g.physics.groundY(gc.x, gc.z + 12) ?? 0, gc.z + 12, Math.PI);
      g.rig.shot(new T(gc.x + dx, gc.y + dy, gc.z + dz), new T(gc.x, gc.y + ly, gc.z), true);
    }, [gc, dx, dy, dz, ly]);
    await view(-14, -0.5, 20);
    await h.wait(1200);
    await h.shot('gate-closed');
    await view(5, -2.5, 7, 0.5);
    await h.wait(800);
    await h.shot('gate-closeup');
    await h.game(() => { window.embervale.area.gate.open(); });
    await h.game(() => window.embervale.setTimeScale(0.3));
    await h.wait(2200);
    await view(-12, -0.5, 17);
    await h.wait(600);
    await h.shot('gate-breaking');
    await h.game(() => window.embervale.setTimeScale(1));
    await h.until(() => window.embervale.area.gate.settled, 20000);
    await view(-12, -0.5, 17);
    await h.wait(600);
    await h.shot('gate-open');
  },
  /** The Northpass (shrine D2): the cut behind the gate, the corridor, the camp bowl and the ridge from above; the region streams in as Wren walks. */
  async northpass(h) {
    await h.newGame();
    await h.game(() => { window.embervale.enemies.list.forEach((e) => (e.alive = false)); window.embervale.area.gate.setOpen(); });
    /** Loads the region around (x, z) as the game would, then stands Wren there. */
    const stand = async (x, z, yaw) => {
      await h.game(([x, z]) => window.embervale.area.streamAt(x, z), [x, z]);
      await h.teleport(x, z, yaw);
      await h.wait(1500);
    };
    const cam = (eye, target) => h.game(([eye, target]) => {
      const g = window.embervale, T = g.player.pos.constructor;
      g.rig.shot(new T(...eye), new T(...target), true);
    }, [eye, target]);
    await stand(8, -105, Math.PI);
    await h.shot('northpass-gate-approach');
    await stand(9, -140, Math.PI);
    await h.shot('northpass-first-stretch');
    await stand(-5, -195, Math.PI);
    await h.shot('northpass-middle');
    await stand(-10, -235, Math.PI);
    await h.shot('northpass-camp-approach');
    await stand(-10, -255, Math.PI);
    await h.wait(500);
    await h.shot('northpass-camp');
    await cam([-10, 60, -215], [-4, 10, -150]);
    await h.wait(1200);
    await h.shot('northpass-from-above');
    await cam([8, 40, -85], [8, 12, -150]);
    await h.wait(1200);
    await h.shot('northpass-seam-from-valley');
  },
  /** Wayfarers' Camp and the canyon beyond (shrine D3): the camp from its entrance, the post, the chasm and crossing from both sides, the Cragstalker and the bell behind it. */
  async camp(h) {
    await h.newGame();
    // The Cragstalker stays (it is 85 m from Wren's parking spot, out of its sight): the shots should show it.
    await h.game(() => { window.embervale.enemies.list.filter((e) => e.constructor.name !== 'Cragstalker').forEach((e) => (e.alive = false)); window.embervale.area.gate.setOpen(); });
    await h.game(() => window.embervale.area.streamAt(-10, -245));
    await h.teleport(-10, -226, Math.PI); // Wren parks on the pass below the camp, out of every shot
    await h.wait(1500);
    /** A free camera (the rig frozen), `eye` and `target` as [x, y, z] in the world. */
    const view = async (name, eye, target) => {
      await h.game(([eye, target]) => {
        const g = window.embervale;
        g.rig.frozen = true;
        g.camera.position.set(...eye);
        g.camera.lookAt(...target);
      }, [eye, target]);
      await h.wait(700);
      await h.shot(name);
    };
    await view('camp-entrance', [-10, 20, -236], [-12, 12, -256]);
    await view('camp-post', [-14, 16.5, -243], [-10, 12.5, -258]);
    await view('canyon-mouth', [-10, 15, -262], [-10, 11, -300]);
    await view('canyon-crossing-from-camp', [-5, 22, -272], [-10, 10, -296]);
    await view('canyon-crossing-from-far-side', [-6, 16.5, -318], [-10, 11, -280]);
    await view('canyon-cragstalker-and-bell', [-10, 16, -296], [-10, 12.5, -314]);
    await view('canyon-cragstalker-eyes', [-10, 13.6, -322], [-10, 12.6, -311]); // from behind the bell, looking at its face
    await view('canyon-from-above', [-10, 115, -245], [-10, 12, -295]);
  },
  /** Sallowmere (T8): the first view from the canyon's mouth by day and night, the switchbacks, the causeway, the town (T9: from the causeway, plaza, market, a house, the pier, above, at night) and the Weir's footprint, the Cut, the farm and trial pool, the whole mere from above. */
  async sallowmere(h) {
    await h.newGame();
    await h.game(() => {
      const g = window.embervale;
      g.state.set('valleyOpen'); // the blight is long gone by the time Wren gets here
      g.sky.blight = 0;
      g.enemies.list.forEach((e) => (e.alive = false));
      g.area.gate.setOpen();
      g.area.streamAt(-10, -343); // builds it now (it would build over a few frames on the way)
    });
    await h.teleport(-10, -255, Math.PI); // Wren parks at the camp, out of every shot, near enough to keep both regions
    await h.wait(1500);
    // The canyon's Cragstalkers spawn once the Northpass is built: clear them too, and keep Wren safe through the scene.
    await h.game(() => { const g = window.embervale; g.enemies.list.forEach((e) => (e.alive = false)); g.state.invincible = true; });
    console.log('sallowmere build:', JSON.stringify(await h.game(() => window.embervale.area.regionBuildStats.sallowmere)));
    const view = async (name, eye, target) => {
      await h.game(([eye, target]) => {
        const g = window.embervale;
        g.rig.frozen = true;
        g.camera.position.set(...eye);
        g.camera.lookAt(...target);
      }, [eye, target]);
      await h.wait(700);
      await h.shot(name);
    };
    const hours = (n) => h.game((n) => (window.embervale.state.hours = n), n);
    await hours(11);
    await view('mere-overlook', [-10, 30, -328], [4, -2, -462]);
    await view('mere-switchbacks', [48, 18, -338], [-10, 5, -360]);
    await view('mere-descent-foot', [-8, 3.6, -388], [-42, 1, -428]);
    await view('mere-stiltwick-footprint', [-22, 9, -398], [-60, 0, -432]);
    await view('mere-channel-and-weir', [22, 5, -460], [22, 7, -522]);
    await view('mere-lightless-cut', [-98, 7, -482], [-130, 3, -514]);
    await view('mere-farm-and-trial', [55, 8, -392], [115, 0, -415]);
    await view('mere-canyon-mouth-from-below', [-8, 4, -392], [-10, 12, -335]);
    await view('mere-from-above', [0, 75, -350], [0, 0, -462]);
    await view('mere-stiltwick-from-causeway', [-14, 4, -404], [-58, 2, -425]);
    await view('mere-stiltwick-plaza', [-50, 4.5, -418], [-62, 1.5, -430]);
    await view('mere-stiltwick-market', [-50, 3, -420], [-38, 2, -432]);
    await view('mere-stiltwick-house', [-62, 3.2, -420], [-54, 3, -402]);
    await view('mere-stiltwick-pier', [-58, 4, -418], [-70, 1, -396]);
    await view('mere-stiltwick-from-above', [-60, 70, -405], [-60, 0, -426]);
    await hours(22);
    await h.wait(1500);
    await view('mere-overlook-night', [-10, 30, -328], [4, -2, -462]);
    await view('mere-weir-from-town-night', [-32, 4, -430], [22, 7, -522]);
    await view('mere-stiltwick-night', [-50, 4.5, -418], [-62, 1.5, -430]);
  },
  /** Gravelheart's intro, first shots: the camera looking back past Wren as the door rises (it must not sit inside her), then over the shoulder. */
  async wardenIntro(h) {
    await h.newGame();
    await h.game(() => window.embervale.loadArea('shrine'));
    await h.wait(1500);
    const r = await h.game(() => window.embervale.area.def.rooms.find((r) => r.id === 'boss'));
    const door = await h.game(() => window.embervale.area.doors.get('bossDoor').group.position);
    const y = r.floor * 8 + 0.05;
    // Outside the doorway, the door open; then one step in (the trigger starts 1 m inside the door).
    await h.game(([x, y, z]) => {
      const g = window.embervale;
      g.area.doors.get('bossDoor').setOpen();
      g.player.teleport(x, y, z + 4, Math.PI);
      g.rig.snap(g.player.pos, Math.PI);
    }, [door.x, y, door.z]);
    await h.wait(1500);
    await h.game(() => {
      const g = window.embervale;
      const orig = g.rig.shot.bind(g.rig);
      window.__shots = [];
      g.rig.shot = (f, l, cut) => {
        orig(f, l, cut);
        const p = g.player.pos;
        window.__shots.push({ from: [f.x - p.x, f.y - p.y, f.z - p.z].map((v) => +v.toFixed(1)), look: [l.x - p.x, l.y - p.y, l.z - p.z].map((v) => +v.toFixed(1)), cut });
      };
    });
    await h.game(([x, y, z]) => window.embervale.player.teleport(x, y, z, Math.PI), [door.x, y, door.z - 1.2]);
    await h.until(() => window.__shots.length > 0, 20000);
    // Two frames into the first shot: where the camera really is, against where it was asked to be.
    await h.wait(400);
    console.log('shots asked', JSON.stringify(await h.game(() => window.__shots)));
    console.log('camera vs Wren', JSON.stringify(await h.game(() => { const g = window.embervale, c = g.camera.position, p = g.player.pos; return { cam: [c.x - p.x, c.y - p.y, c.z - p.z].map((v) => +v.toFixed(1)), opacity: g.rig.playerOpacity }; })));
    await h.shot('warden-intro-1');
    await h.until(() => window.__shots.length > 1, 20000);
    await h.wait(400);
    await h.shot('warden-intro-2');
  },
  /** After the boss: the Hearth's north wall with the causeway up and the hidden door open, the Heart Vessel, and the Keepers' Seal. */
  async seal(h) {
    await h.newGame();
    await h.game(() => window.embervale.loadArea('shrine'));
    await h.wait(1500);
    const info = await h.game(() => {
      const a = window.embervale.area;
      const r = a.def.rooms.find((r) => r.id === 'boss'), s = a.def.rooms.find((r) => r.id === 'sealRoom');
      return { r, s, door: { x: a.hearth.sealDoor.x, z: a.hearth.sealDoor.z }, vessel: { x: a.hearth.vessel.x, z: a.hearth.vessel.z } };
    });
    const y = info.r.floor * 8;
    const shot = (name, from, at) => h.game(([from, at]) => {
      const g = window.embervale, T = g.player.pos.constructor;
      g.rig.shot(new T(...from), new T(...at), true);
    }, [from, at]).then(() => h.wait(900)).then(() => h.shot(name));
    // Before the win: the north wall is plain, the pit open.
    await h.game(([x, y, z]) => { const g = window.embervale; g.player.teleport(x, y, z, Math.PI); }, [info.door.x, y + 0.05, info.r.z + 10]);
    await shot('seal-before', [info.door.x - 6, y + 6.5, info.door.z + 16], [info.door.x, y + 1.2, info.door.z + 1]);
    await h.game(() => {
      const a = window.embervale.area;
      a.hearth.clear(true);
      a.doors.get('sealDoor').setOpen();
      a.hearth.vessel.show();
    });
    await shot('seal-causeway', [info.door.x - 6, y + 6.5, info.door.z + 16], [info.door.x, y + 1.2, info.door.z + 1]);
    await shot('seal-vessel', [info.vessel.x - 5, y + 3.5, info.vessel.z + 6], [info.vessel.x, y + 1.3, info.vessel.z]);
    // Inside the Keepers' Seal, looking at the stone from the door.
    const door = await h.game(() => { const p = window.embervale.area.doors.get('sealDoor').group.position; return { x: p.x, z: p.z }; });
    await h.game(([x, y, z]) => { const g = window.embervale; g.player.teleport(x, y, z, Math.PI); }, [door.x, y + 0.05, door.z - 2.5]);
    await shot('seal-room', [door.x - 3, y + 3.2, door.z - 1], [info.s.x + info.s.w / 2, y + 1.2, info.s.z + info.s.d / 2]);
    await shot('seal-room-door', [info.s.x + info.s.w / 2, y + 2.4, info.s.z + 2], [door.x, y + 1.6, door.z + 1]);
    // The prism after one hit (a beam cut, shards orbiting) and just after the shatter.
    const pc = await h.game(() => { const p = window.embervale.area.switches.get('sealStone').group.position; return { x: p.x, z: p.z }; });
    await h.game(() => { window.embervale.area.switches.get('sealStone').prism.hit(); });
    await h.wait(900);
    await shot('seal-prism-hit', [pc.x - 5, y + 3.4, pc.z + 8], [pc.x, y + 2.4, pc.z]);
    await h.game(() => { window.embervale.area.switches.get('sealStone').prism.hit(); });
    for (let i = 0; i < 2; i++) {
      await h.wait(700);
      await h.game(() => { window.embervale.area.switches.get('sealStone').prism.hit(); });
    }
    await h.wait(700);
    await h.game(() => { window.embervale.area.switches.get('sealStone').prism.hit(); });
    await h.wait(1500);
    await shot('seal-prism-broken', [pc.x - 5, y + 3.4, pc.z + 8], [pc.x, y + 2.4, pc.z]);
  },
  /** The shrine's enemies: a Dozing Sentinel asleep, winding up and stuck after its swing; a Shellback from front and back, and tucked to charge. */
  async enemies(h) {
    await h.newGame();
    await h.game(() => {
      window.embervale.loadArea('shrine');
    });
    await h.game(() => {
      const g = window.embervale;
      g.player.invuln = 1e6;
      // Only the first sentinel and shellback stay, so nothing else crowds the shots.
      const keep = [g.enemies.list.find((e) => 'asleep' in e), g.enemies.list.find((e) => 'exposed' in e)];
      for (const e of g.enemies.list) if (!keep.includes(e)) e.alive = false;
    });
    // Each room that empties plays its short "cleared" script (chests appear); enemies stay
    // frozen until the queue is done, which takes a while at headless speed.
    await h.until(() => window.embervale.mode === 'play', 120000);
    await h.wait(1500);
    await h.game(() => document.querySelector('.area')?.classList.remove('show')); // the area's name card, out of the shots
    await h.wait(800);
    // Wren `dist` in front of the enemy (`which`: 'asleep' marks sentinels, 'exposed' shellbacks).
    const place = (which, dist) =>
      h.game(([which, dist]) => {
        const g = window.embervale, e = g.enemies.list.find((e) => which in e && e.alive);
        const x = e.pos.x + Math.sin(e.facing) * dist, z = e.pos.z + Math.cos(e.facing) * dist;
        g.player.teleport(x, (g.physics.groundY(x, z, e.pos.y + 2) ?? e.pos.y) + 0.05, z, e.facing + Math.PI);
      }, [which, dist]);
    // The camera `dist` ahead of the enemy (negative: behind), `side` to its left.
    const view = (which, dist, side, height, lookHeight) =>
      h.game(([which, dist, side, height, lookHeight]) => {
        const g = window.embervale, e = g.enemies.list.find((e) => which in e && e.alive);
        const f = { x: Math.sin(e.facing), z: Math.cos(e.facing) }, T = e.pos.constructor;
        const at = new T(e.pos.x, e.pos.y + lookHeight, e.pos.z);
        const cam = (side) => new T(e.pos.x + f.x * dist - f.z * side, e.pos.y + height, e.pos.z + f.z * dist + f.x * side);
        // Near a wall the camera can end up inside it (a blank shot): then take the other side.
        const clear = (c) => {
          const d = c.clone().sub(at), len = d.length();
          return g.physics.rayDistance(at, d.divideScalar(len), len) >= len - 0.3;
        };
        g.rig.shot(clear(cam(side)) || !clear(cam(-side)) ? cam(side) : cam(-side), at, true);
      }, [which, dist, side, height, lookHeight]);
    const until = (which, state, minT) =>
      h.until(([which, state, minT]) => {
        const e = window.embervale.enemies.list.find((e) => which in e && e.alive);
        return e.state === state && e.t >= minT;
      }, 20000, [which, state, minT]);
    const freeze = (s = 0.01) => h.game((s) => window.embervale.setTimeScale(s), s);

    await place('asleep', 9); // in its room, but too far to wake it
    await h.wait(2500);
    await view('asleep', 5, 2.5, 2, 1.6);
    await h.wait(800);
    await h.shot('sentinel-asleep');
    await place('asleep', 2.5);
    await until('asleep', 'windup', 0.8);
    await freeze();
    await view('asleep', 4.5, 4, 2.2, 1.8);
    await h.wait(500);
    await h.shot('sentinel-windup');
    await freeze(1);
    await until('asleep', 'recover', 0.3);
    await freeze();
    await view('asleep', 3, 4.5, 1.8, 1);
    await h.wait(500);
    await h.shot('sentinel-recover');
    await freeze(1);

    await h.game(() => {
      const g = window.embervale, s = g.area.spawn; // back at the entrance, out of its sight
      g.player.teleport(s.x, s.y, s.z, 0);
    });
    await h.wait(300);
    await freeze();
    await view('exposed', 3.5, 1.5, 1.6, 0.4);
    await h.wait(500);
    await h.shot('shellback-front');
    await view('exposed', -3.5, 1.5, 1.6, 0.4);
    await h.wait(500);
    await h.shot('shellback-back');
    await freeze(1);
    // 4.5 m ahead of the shellback can be outside its territory or behind a wall (then it never spots Wren and just
    // wanders on): try spots round its front until one is in its territory with a clear line from its eyes.
    await h.game(() => {
      const g = window.embervale, e = g.enemies.list.find((e) => 'exposed' in e && e.alive);
      for (const [dist, turn] of [[4.5, 0], [4.5, 0.5], [4.5, -0.5], [3.5, 0.9], [3.5, -0.9], [3, 0]]) {
        const a = e.facing + turn, x = e.pos.x + Math.sin(a) * dist, z = e.pos.z + Math.cos(a) * dist;
        const y = (g.physics.groundY(x, z, e.pos.y + 2) ?? e.pos.y) + 0.05;
        if (e.territory && !e.territory({ x, y, z })) continue;
        const eye = e.pos.clone().setY(e.pos.y + 0.5), to = eye.clone().set(x, y + 1, z).sub(eye), len = to.length();
        if (g.physics.rayDistance(eye, to.divideScalar(len), len) < len - 0.05) continue;
        g.player.teleport(x, y, z, a + Math.PI);
        return;
      }
    });
    await until('exposed', 'tuck', 0.4);
    await freeze();
    await view('exposed', 3, 2.5, 1.4, 0.4);
    await h.wait(500);
    await h.shot('shellback-tuck');
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
const approve = args.includes('--approve');
// --display n64 (or performance): capture in that Display mode. Shots are named <shot>-n64, so they never meet the Native
// baselines; draw-call budgets only apply to Native.
const displayArg = args.indexOf('--display');
const DISPLAYS = ['native', 'performance', 'n64'];
const displayName = displayArg >= 0 ? String(args[displayArg + 1]).toLowerCase() : 'native';
if (!DISPLAYS.includes(displayName)) {
  console.error(`--display takes one of: ${DISPLAYS.join(', ')}.`);
  process.exit(1);
}
const display = DISPLAYS.indexOf(displayName);
// --shadows: capture with the Shadows setting On (T46). Off otherwise, so baselines and budgets stay what they were; shadow shots
// are named <shot>-shadows (then -n64), and, like the other Display modes, are not checked against a draw-call budget.
const shadows = args.includes('--shadows');
const suffix = (shadows ? '-shadows' : '') + (display === 0 ? '' : `-${displayName}`);
const budgeted = display === 0 && !shadows;
const requested = args.filter((a, i) => !a.startsWith('--') && !(displayArg >= 0 && i === displayArg + 1));
const names = requested.length ? requested : Object.keys(SCENES);
const unknown = names.filter((n) => !SCENES[n]);
if (unknown.length) {
  console.error(`Unknown scene(s): ${unknown.join(', ')}. Try --list.`);
  process.exit(1);
}

await rm(`${OUT}diff/`, { recursive: true, force: true });
await mkdir(`${OUT}diff/`, { recursive: true });
const budgets = await readBudgets();
const needLook = []; // changed and new shots, for whoever looks
const overBudgets = [];
const fmtShare = (share) => `${(share * 100).toFixed(2)}%`;

const env = await launch();
let failed = false;

/** Scenes at once: each is its own page on the one dev server (stepped, so parallel runs draw the same frames). */
const JOBS = Math.max(1, Number(process.env.JOBS) || (env.gl === 'gpu' ? 4 : 3));

/** Runs one scene; its report is buffered and printed whole, so parallel scenes don't interleave. */
async function runScene(name) {
  const t0 = Date.now();
  const log = [];
  const h = await openGame(env, OUT, { stepped: true, display: display === 0 ? undefined : display, shadows });
  const prefixed = (n) => (n.startsWith(name) ? n : `${name}-${n}`) + suffix;
  const shots = []; // { name, status, share }
  const peak = { calls: 0, triangles: 0 };

  /** Saves the shot, compares it with its baseline, and notes the frame's draw calls and triangles. */
  const record = async (shotName, buffer, stats) => {
    await writeFile(`${OUT}${shotName}.png`, buffer);
    peak.calls = Math.max(peak.calls, stats.calls);
    peak.triangles = Math.max(peak.triangles, stats.triangles);
    const current = shrink(readPng(buffer));
    const base = await readBaseline(shotName);
    if (!base) {
      shots.push({ name: shotName, status: 'new' });
    } else {
      const r = compare(base, current);
      if (r.diff) await writeFile(`${OUT}diff/${shotName}.png`, writePng(r.diff));
      shots.push({ name: shotName, status: r.changed ? 'changed' : 'unchanged', share: r.share });
    }
    if (approve && shots.at(-1).status !== 'unchanged') shots.at(-1).pending = current;
  };
  const stats = () =>
    h.game(() => {
      const i = window.embervale.renderer.info.render;
      return { calls: i.calls, triangles: i.triangles };
    });
  /**
   * The light bake runs in background workers (render/bakeLight.ts), so its colours land at a real-time moment: wait
   * for every bake out, then always step one frame (always, so the frame count doesn't depend on the machine).
   */
  const settle = async () => {
    await h.game(() => window.embervaleBake?.settled());
    await h.wait(50);
  };
  h.shot = async (n) => {
    await settle();
    const s = await stats();
    await record(prefixed(n), await h.page.screenshot({ animations: 'disabled', caret: 'hide' }), s);
  };
  h.shotOf = async (locator, n) => {
    await settle();
    const s = await stats();
    await record(prefixed(n), await locator.screenshot({ animations: 'disabled', caret: 'hide' }), s);
  };

  let ok = true;
  try {
    await SCENES[name](h);
  } catch (e) {
    ok = false;
    failed = true;
    log.push(`  ✗ ${name}: ${e.message}`);
  }
  if (h.errors.length) {
    ok = false;
    failed = true;
    log.push(`    console errors: ${h.errors.join(' | ')}`);
  }

  const count = (status) => shots.filter((x) => x.status === status).length;
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  if (ok) {
    const over = budgeted ? overBudget(budgets, name, peak) : [];
    overBudgets.push(...over);
    if (over.length) failed = true;
    const mark = over.length ? '✗' : '✓';
    log.push(`  ${mark} ${name}: ${shots.length} shots, ${count('unchanged')} unchanged, ${count('changed')} changed, ${count('new')} new (${secs}s)`);
    const b = budgets[name];
    log.push(`      draw calls ${peak.calls}${b ? ` / ${b.calls}` : ''}, triangles ${peak.triangles}${b ? ` / ${b.triangles}` : ' (no budget yet)'}`);
    for (const o of over) log.push(`      OVER BUDGET: ${o.what} ${o.value} > ${o.limit}`);
  }
  for (const x of shots) {
    if (x.status === 'unchanged') continue;
    log.push(`      ${x.status}: ${x.name}${x.share === undefined ? '' : ` (${fmtShare(x.share)} of pixels)`}`);
    needLook.push(x);
  }
  if (approve && ok) {
    for (const x of shots) if (x.pending) await writeBaseline(x.name, x.pending);
    if (budgeted) budgets[name] = budgetFor(peak);
  }
  await h.page.close();
  console.log(log.join('\n'));
}

const t0 = Date.now();
const queue = [...names];
const worker = async () => {
  for (let name = queue.shift(); name; name = queue.shift()) await runScene(name);
};
await Promise.all(Array.from({ length: Math.min(JOBS, names.length) }, worker));
console.log(`\n${names.length} scene(s) in ${((Date.now() - t0) / 1000).toFixed(0)}s (${env.gl} renderer, ${Math.min(JOBS, names.length)} at a time)`);
await env.close();

if (approve) await writeBudgets(budgets);
console.log('');
if (needLook.length) {
  console.log(`${approve ? 'Approved' : 'Open'} these ${needLook.length} (full size in look-output/, differences in look-output/diff/):`);
  for (const x of needLook) console.log(`  ${OUT}${x.name}.png`);
} else {
  console.log('Every shot is unchanged: nothing to look at.');
}
if (approve) console.log('Baselines and budgets saved: commit scripts/baselines/ and scripts/look-budgets.json.');
process.exit(failed ? 1 : 0);
