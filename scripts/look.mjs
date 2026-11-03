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
  /** The bigger cottages from the square, Odo's stall, Wren in the Stoneward Tunic, and the mill inside. */
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
    await h.game(() => window.embervale.loadArea('mill'));
    await h.wait(1500);
    await h.shot('mill-inside');
    await h.teleport(4, 3, Math.PI * 0.9);
    await h.wait(900);
    await h.shot('mill-bed');
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
