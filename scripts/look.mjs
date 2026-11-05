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
  await h.game(() => (window.embervale.state.hours = 21)); // it only walks at night
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
  async title(h) {
    await h.boot();
    await h.shot('title');
  },
  /** The blight (game/blight.ts): sick field by day and night, the village, mid-lift, and the restored valley. */
  async blight(h) {
    await h.newGame();
    const hours = (n) => h.game((n) => (window.embervale.state.hours = n), n);
    await hours(12);
    await h.wait(1500);
    await h.shot('blight-day');
    await hours(0);
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
  /** The HUD's sky dial (ui/skyDial.ts) through the day, and the compass strip (ui/compass.ts) at two headings. */
  async hud(h) {
    await h.newGame();
    await h.wait(1200);
    for (const hh of [5.5, 7, 12, 17, 18, 19, 0]) {
      await h.game((n) => (window.embervale.state.hours = n), hh);
      await h.wait(400);
      await h.page.locator('.hud-top-right').screenshot({ path: `${OUT}hud-dial-${String(hh).replace('.', '_')}.png` });
    }
    await h.game(() => (window.embervale.state.hours = 12));
    for (const [name, facing] of [['north', Math.PI], ['southwest', -Math.PI / 4]]) {
      // Models face +z, so facing PI looks north; the camera settles behind Wren.
      await h.teleport(0, 14, facing);
      await h.game((f) => (window.embervale.rig.yaw = f + Math.PI), facing);
      await h.wait(800);
      await h.page.locator('.compass').screenshot({ path: `${OUT}hud-compass-${name}.png` });
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
    await h.game(() => window.embervale.state.set('hasSword'));
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
    // From the square's side the mill hides it; from the far side, standing where a player looks around.
    await h.teleport(at.x - 9, at.z - 2, Math.PI / 2 + 0.3);
    await h.wait(1200);
    await h.shot('lost-far');
    await h.teleport(at.x - 3.5, at.z - 0.5, Math.PI / 2);
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
    await cam([1.2, 1.7, 19], [12, 6, 17]);
    await h.wait(1200);
    await h.shot('shaft-climb');
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
    await place('exposed', 4.5);
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
