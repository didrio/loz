import * as THREE from 'three';
import { createArea, isAreaId, type AreaId } from '../content/areas';
import type { AreaContent } from '../content/overworld';
import { death, intro } from '../content/story';
import { Sfx } from '../core/audio';
import { Director } from '../core/director';
import { Input, type Action } from '../core/input';
import type { Physics } from '../core/physics';
import { decodeSettings, localStore, SaveSlot, type KeyValueStore, type Settings } from '../core/save';
import { Particles } from '../render/particles';
import { Sky } from '../render/sky';
import { Hud } from '../ui/hud';
import { sameLevel, type Area, type Interactable } from '../world/area';
import { Boss } from './boss';
import { CameraRig } from './camera';
import { Debug } from './debug';
import { Dialog } from './dialog';
import { EnemyManager, Gloomwisp, type Enemy, type EnemyEnv, type HurtResult } from './enemies';
import { Hazards, type HazardEnv } from './hazards';
import { ATTACK_BOOST_SECONDS, DRINK_ORDER } from './drinks';
import { pickLockTarget } from './lockon';
import type { DrinkId } from '../world/dungeon/format';
import { Pickups } from './pickups';
import { NO_CONTROLS, Player, type Controls, type PlayerEnv } from './player';
import type { Page, Script, ScriptApi } from './script';
import { GameState } from './state';

/**
 * - title: the menu over a slow camera orbit
 * - play: the player has control
 * - cutscene: a script is running (dialog, item get, cutscene); no player control
 */
export type Mode = 'title' | 'play' | 'cutscene';

type MenuItem = 'continue' | 'new' | 'confirmNew';
const MENU_LABELS: Record<MenuItem, string> = { continue: 'Continue', new: 'New Game', confirmNew: 'Start over? This erases your save' };

const SETTINGS_KEY = 'embervale:settings';
const AUTOSAVE_SECONDS = 30;
/** A full day passes in about five minutes. */
const HOURS_PER_SECOND = 1 / 12;
const WARP_HOURS_PER_SECOND = 6;

/**
 * Owns every system and runs the frame loop. Also implements `ScriptApi`, the surface that
 * story scripts in `src/content/` use. Holds wiring, not rules: rules live in the systems.
 */
export class Game implements ScriptApi {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1500);
  readonly input: Input;
  readonly sfx = new Sfx();
  readonly hud = new Hud();
  readonly director = new Director();
  readonly state = new GameState();
  readonly particles: Particles;
  readonly pickups: Pickups;
  readonly sky: Sky;
  readonly player: Player;
  readonly rig: CameraRig;
  readonly hazards: Hazards;
  area!: Area;
  enemies!: EnemyManager;
  mode: Mode = 'title';
  lock: Enemy | null = null;
  private content!: AreaContent;
  private readonly dialog: Dialog;
  private readonly saveSlot: SaveSlot;
  private readonly settings: Settings;
  private readonly marker = new THREE.Group();
  private readonly timer = new THREE.Timer();
  private readonly debug: Debug | null;
  private areaName = '';
  private warpTo: number | null = null;
  private fadeValue = 0;
  private autosaveT = AUTOSAVE_SECONDS;
  private titleT = 0;
  private menu: { items: MenuItem[]; selected: number };
  /** Slow motion for cutscenes (1 = normal). */
  private timeScale = 1;
  /** Real seconds left of hit-stop: a few frozen frames that make hits land with weight. */
  private hitStop = 0;
  /** The music is off (Wren just died). */
  private musicSilenced = false;
  /** Set when a script is waiting to run after the current one. */
  private pendingScripts: Script[] = [];

  constructor(canvas: HTMLCanvasElement, readonly physics: Physics, private readonly store: KeyValueStore = localStore) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.fog = new THREE.Fog(0xbfe0f2, 70, 290);
    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.input = new Input(canvas);
    this.dialog = new Dialog(this.hud, this.sfx);
    this.sky = new Sky(this.scene);
    this.particles = new Particles(this.scene);
    this.pickups = new Pickups(this.scene);
    this.player = new Player(this.scene, physics, this.state);
    this.rig = new CameraRig(this.camera, physics);
    this.hazards = new Hazards(this.scene);
    this.buildMarker();

    this.saveSlot = new SaveSlot(store);
    this.settings = decodeSettings(store.get(SETTINGS_KEY));
    this.sfx.musicOn = this.settings.music;
    this.loadArea('overworld');

    this.menu = { items: this.saveSlot.load() ? ['continue', 'new'] : ['new'], selected: 0 };
    this.renderMenu();

    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => document.hidden && this.save());
    this.debug = new URLSearchParams(location.search).has('debug') ? new Debug(this) : null;
  }

  start() {
    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------------------
  // Areas
  // ---------------------------------------------------------------------------

  /**
   * Unloads the current area (if any) and builds another; the player starts at its spawn
   * or at a named `entrance`. During play the area's content restores its saved state and
   * starts (bosses, enemies, cutscenes on arrival); on the title screen that waits for
   * New Game / Continue.
   */
  loadArea(id: AreaId, entrance?: string) {
    if (this.area) {
      this.enemies.clear();
      this.pickups.clear();
      this.hazards.clear();
      this.area.dispose();
    }
    const { area, content } = createArea(id, this.physics);
    this.area = area;
    this.content = content;
    this.scene.add(area.root);
    this.physics.refreshQueries();
    this.sky.setIndoor(!!area.indoor);
    this.rig.dist = area.indoor ? 7 : 9;
    this.enemies = new EnemyManager(area.root, this.physics, area);
    this.state.area = id;
    this.placeAtSpawn(entrance);
    if (this.mode !== 'title') {
      this.content.restore(this.state);
      this.content.start?.(this);
    }
  }

  private placeAtSpawn(entrance?: string) {
    const s = (entrance && this.area.entrances?.[entrance]) || this.area.spawn;
    const y = s.y ?? this.physics.groundY(s.x, s.z) ?? 0;
    this.player.teleport(s.x, y, s.z, s.facing);
    this.rig.snap(this.player.pos, s.facing);
    this.lock = null;
  }

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------

  private frame = (now: number) => {
    this.timer.update(now);
    const rawDt = Math.min(this.timer.getDelta(), 0.05);
    const frozen = this.hitStop > 0;
    this.hitStop -= rawDt;
    const dt = frozen ? 0 : rawDt * this.timeScale;
    this.input.poll();
    this.hud.setDevice(this.input.device);
    this.director.update(dt);

    switch (this.mode) {
      case 'title':
        this.updateTitle(dt);
        break;
      case 'play':
        this.updatePlay(dt);
        break;
      case 'cutscene':
        this.player.update(dt, NO_CONTROLS, this.playerEnv);
        this.enemies.update(dt, this.enemyEnv, true);
        this.dialog.update(this.input.pressed('confirm'));
        break;
    }

    this.updateWorld(dt, rawDt);
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.frame);
  };

  private updateTitle(dt: number) {
    this.titleT += dt;
    this.state.hours = 7.5 + Math.sin(this.titleT * 0.05) * 1.5;
    const a = this.titleT * 0.04;
    this.camera.position.set(Math.cos(a) * 70, 32, Math.sin(a) * 70);
    this.camera.lookAt(0, 4, 0);

    const m = this.menu;
    if (this.input.pressed('menuUp') || this.input.pressed('menuDown')) {
      m.selected = (m.selected + (this.input.pressed('menuUp') ? -1 : 1) + m.items.length) % m.items.length;
      if (m.items.includes('confirmNew')) m.items = m.items.map((i) => (i === 'confirmNew' ? 'new' : i));
      this.sfx.init();
      this.sfx.select();
      this.renderMenu();
    }
    if (!this.input.pressed('confirm')) return;
    this.sfx.init();
    const choice = m.items[m.selected];
    if (choice === 'continue') {
      const save = this.saveSlot.load();
      if (save) this.state.load(save);
      // Resume in the area the game was saved in (at its entrance).
      const where = isAreaId(this.state.area) ? this.state.area : 'overworld';
      if (where !== this.area.id) this.loadArea(where);
      this.state.area = where;
      this.content.restore(this.state);
      this.begin(false);
    } else if (choice === 'new' && m.items.includes('continue')) {
      m.items[m.selected] = 'confirmNew';
      this.sfx.select();
      this.renderMenu();
    } else {
      this.state.reset();
      this.saveSlot.clear();
      if (this.area.id !== 'overworld') this.loadArea('overworld');
      this.begin(true);
    }
  }

  private renderMenu() {
    this.hud.setTitleMenu(this.menu.items.map((i) => MENU_LABELS[i]), this.menu.selected);
  }

  private begin(newGame: boolean) {
    this.hud.hideTitle();
    this.player.setSword(this.state.has('hasSword'));
    this.placeAtSpawn();
    this.areaName = this.area.nameAt(this.player.pos.x, this.player.pos.z);
    this.mode = 'play';
    this.content.start?.(this);
    if (newGame) this.run(intro);
    else this.showAreaName(this.areaName);
  }

  private updatePlay(dt: number) {
    if (!this.area.indoor) this.advanceClock(dt);
    if (this.input.clicked() && !this.input.locked) this.input.requestLock();

    // Lock-on: toggles; with nothing to lock onto it recenters the camera instead.
    // Let go when the target dies, gets far away, or ends up on another floor.
    if (this.lock && (!this.lock.alive || this.lock.pos.distanceTo(this.player.pos) > 25 || Math.abs(this.lock.pos.y - this.player.pos.y) > 4)) this.lock = null;
    if (this.input.pressed('lock')) {
      if (this.lock) this.lock = null;
      else {
        this.lock = this.findLockTarget();
        if (this.lock) this.sfx.lockOn();
        else this.rig.recenter(this.player.facing);
      }
    }

    // "Interact" comes before "jump" because they share a gamepad button.
    const near = this.nearestInteractable();
    if (near && this.input.pressed('interact')) {
      const script = this.content.scripts[near.id];
      if (script) this.run(script);
      return;
    }

    this.player.update(dt, this.controls(), this.playerEnv);
    this.updateCombat(dt);

    for (const t of this.area.triggers) {
      if (!t.enabled() || !sameLevel(t.y, this.player.pos.y) || Math.hypot(this.player.pos.x - t.x, this.player.pos.z - t.z) > t.r) continue;
      const script = this.content.scripts[t.id];
      if (script) this.run(script);
      return;
    }

    const name = this.area.nameAt(this.player.pos.x, this.player.pos.z);
    if (name !== this.areaName) this.showAreaName(name);
    this.content.update?.(this, dt);

    if (!this.player.alive) {
      this.run(death);
      return;
    }

    for (const id of DRINK_ORDER) if (this.input.pressed(id === 'restore' ? 'drinkRestore' : 'drinkAttack')) this.drink(id);

    // What you can interact with gets its prompt floating over it, not in the corner.
    const actions: [Action, string][] = [];
    if (this.state.has('hasSword')) actions.push(['attack', 'Sword']);
    actions.push(['lock', this.lock ? 'Release' : 'Lock on']);
    this.hud.setActions(actions);

    this.autosaveT -= dt;
    if (this.autosaveT <= 0) this.save();
  }

  /**
   * Where the guard gauge floats on screen: beside Wren's shoulder, on the camera's right,
   * like a stamina wheel. Null when it shouldn't show.
   */
  private guardGaugePosition() {
    if (!this.player.guard.gaugeVisible || this.mode !== 'play') return null;
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    return this.toScreen(this.player.pos.clone().add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(right, 1.1));
  }

  /** The interact prompt floating over whatever is in reach (null when nothing is, or not in play). */
  private interactPrompt() {
    const near = this.mode === 'play' ? this.nearestInteractable() : null;
    if (!near) return null;
    const at = this.toScreen(new THREE.Vector3(near.x, near.promptY ?? this.player.pos.y + 2.4, near.z));
    return at && { ...at, label: near.label };
  }

  /** A world point in screen pixels, or null if it's behind the camera. */
  private toScreen(p: THREE.Vector3) {
    this.camera.updateMatrixWorld();
    const v = p.clone().project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
  }

  /** Enemies, their attacks and the things they drop. */
  private updateCombat(dt: number) {
    this.enemies.update(dt, this.enemyEnv);
    this.hazards.update(dt, this.hazardEnv);
    this.pickups.update(dt, this.player.pos, (x, z, fromY) => this.physics.groundY(x, z, fromY) ?? fromY - 1, (k) => {
      if (k === 'heart') {
        this.state.heal(2);
        this.sfx.heart();
      } else {
        this.state.addGems(k === 'bluegem' ? 5 : 1);
        this.sfx.gem();
      }
    });
  }

  private advanceClock(dt: number) {
    if (this.warpTo === null) {
      this.state.advance(dt * HOURS_PER_SECOND);
      return;
    }
    const left = (this.warpTo - this.state.hours + 24) % 24;
    const step = dt * WARP_HOURS_PER_SECOND;
    if (step >= left) {
      this.state.advance(left);
      this.warpTo = null;
    } else this.state.advance(step);
  }

  /** Turns stick/WASD input into a world-space direction relative to the camera. */
  private controls(): Controls {
    const m = this.input.move();
    const yaw = this.rig.yaw;
    const move = new THREE.Vector3(
      -Math.sin(yaw) * m.y + Math.cos(yaw) * m.x,
      0,
      -Math.cos(yaw) * m.y - Math.sin(yaw) * m.x,
    );
    return {
      move,
      attack: this.input.pressed('attack'),
      shield: this.input.held('shield'),
      jump: this.input.pressed('jump'),
    };
  }

  /** The boss currently fighting, if any. */
  get activeBoss() {
    return (this.enemies.list.find((e) => e instanceof Boss && e.engaged) as Boss | undefined) ?? null;
  }

  private updateWorld(dt: number, rawDt: number) {
    const { input, hud, state, player } = this;
    this.area.update(dt, { night: this.sky.night, playerPos: player.pos });
    this.particles.update(dt);
    hud.update(rawDt, () => this.sfx.blip());
    const boss = this.activeBoss;
    hud.setBoss(boss && this.mode !== 'title' ? { name: boss.title, hp: boss.hp, maxHp: boss.maxHp, marks: [0.5] } : null);
    const gloomTarget = Math.max(0, ...this.enemies.list.map((e) => (e instanceof Boss ? e.gloom : 0)));
    this.sky.gloom += (gloomTarget - this.sky.gloom) * Math.min(1, rawDt * 1.5);
    hud.setHearts(state.hp, state.maxHp);
    hud.setGems(state.gems);
    hud.setDrinks(DRINK_ORDER.filter((id) => (state.drinks.found.get(id) ?? 0) > 0).map((id) => ({ id, left: state.drinks.left.get(id) ?? 0 })), player.attackBoost / ATTACK_BOOST_SECONDS);
    hud.setKeys(state.keysHere, !!state.dungeons.get(state.area)?.bossKey);
    hud.setClock(state.hours, state.day);
    if (this.mode !== 'play') hud.setActions([]);
    const mood = boss ? 'boss' : this.area.music ?? this.area.musicAt?.(player.pos.x, player.pos.z, state.isNight) ?? (state.isNight ? 'night' : 'day');
    this.sfx.updateMusic(mood, this.mode !== 'title' && !this.musicSilenced);
    if (input.pressed('music')) {
      this.sfx.musicOn = this.settings.music = !this.settings.music;
      this.store.set(SETTINGS_KEY, JSON.stringify(this.settings));
    }

    if (this.lock?.alive) {
      this.marker.visible = true;
      this.marker.position.copy(this.lock.pos).setY(this.lock.pos.y + this.lock.lockHeight + 1.4 + Math.sin(performance.now() / 150) * 0.1);
      this.marker.rotation.y += dt * 3;
    } else this.marker.visible = false;

    if (this.mode !== 'title') {
      const canLook = this.mode === 'play';
      const lockAt = this.lock?.alive ? this.lock.pos.clone().setY(this.lock.pos.y + this.lock.lockHeight) : null;
      this.rig.update(dt, canLook ? input.look(dt) : { yaw: 0, pitch: 0 }, player.pos, lockAt);
    }
    hud.setGuard(player.guard.fills(), player.guard.broken, this.guardGaugePosition());
    hud.setPrompt(this.interactPrompt());
    this.physics.step(dt);
    this.sky.update(state.hours, this.mode === 'title' ? new THREE.Vector3() : player.pos, this.camera.position);
    this.debug?.update(dt);
  }

  // ---------------------------------------------------------------------------
  // Interaction, lock-on, combat callbacks
  // ---------------------------------------------------------------------------

  private nearestInteractable() {
    let best: Interactable | null = null, bestD = Infinity;
    for (const it of this.area.interactables) {
      if (!it.enabled() || !sameLevel(it.y, this.player.pos.y)) continue;
      const d = Math.hypot(this.player.pos.x - it.x, this.player.pos.z - it.z);
      if (d < it.r && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    return best;
  }

  private findLockTarget() {
    const camFwd = new THREE.Vector3(-Math.sin(this.rig.yaw), 0, -Math.cos(this.rig.yaw));
    return pickLockTarget(this.player.pos, camFwd, this.enemies.list, this.physics);
  }

  private buildMarker() {
    for (let i = 0; i < 3; i++) {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 4), new THREE.MeshBasicMaterial({ color: 0xffcf3a, depthTest: false }));
      arrow.rotation.x = Math.PI;
      arrow.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.5, 0, Math.sin((i / 3) * Math.PI * 2) * 0.5);
      arrow.renderOrder = 10;
      this.marker.add(arrow);
    }
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  private get playerEnv(): PlayerEnv {
    return {
      area: this.area,
      lockTarget: this.lock,
      enemies: this.enemies.list,
      hasSword: this.state.has('hasSword'),
      onSwing: () => this.sfx.swing(),
      onJump: () => this.sfx.jump(),
      onHitEnemy: (e, result, at) => this.onSwordHit(e, result, at),
      onCutBush: (at) => {
        this.sfx.cut();
        this.particles.burst(at, 0x4f9a35, 14, 5, 0.6);
        this.pickups.drop(at, 0.3, 0.1);
      },
    };
  }

  /** Feedback for every sword contact: sounds, sparks, hit-stop, drops. */
  private onSwordHit(e: Enemy, result: HurtResult, at: THREE.Vector3) {
    if (result === 'ignored') return;
    if (result === 'guarded') {
      this.sfx.clank();
      this.particles.burst(at, 0xffe28a, 10, 6, 0.35);
      this.hitStop = 0.05;
      return;
    }
    const isBoss = e instanceof Boss;
    if (result === 'weak') {
      this.sfx.weakHit();
      this.particles.burst(at, 0x9ff0ff, 14, 7, 0.45);
      this.hitStop = 0.11;
      this.rig.shake(0.25);
    } else {
      this.sfx.hit();
      this.particles.burst(at, 0xffffff, 6, 6, 0.3);
      if (isBoss) this.hitStop = 0.06;
    }
    if (e.alive || isBoss) return;
    this.sfx.enemyDie();
    this.particles.burst(at, e instanceof Gloomwisp ? 0xb06aff : 0x7a2f4a, 18, 6, 0.7);
    this.pickups.drop(e.pos.clone(), 0.65, 0.2);
    if (this.lock === e) this.lock = null;
  }

  /** Every enemy attack on Wren goes through here: the result, plus how it feels. */
  private hitPlayer: EnemyEnv['hitPlayer'] = (from, attack) => {
    const r = this.player.receiveHit(from, attack);
    const at = this.player.pos.clone().setY(this.player.pos.y + 1.2);
    const shieldAt = at.clone().add(this.player.forward.multiplyScalar(0.7));
    if (r === 'hit') {
      this.sfx.hurt();
      this.particles.burst(at, 0xff4d4d, 8, 4);
      this.hitStop = Math.max(this.hitStop, 0.07);
      this.rig.shake(0.2);
    } else if (r === 'blocked') {
      // Heavier attacks clang harder: the cost should be felt, not just seen in the HUD.
      if (attack.guard >= 2) this.sfx.heavyBlock();
      else this.sfx.clank();
      this.particles.burst(shieldAt, 0xffe28a, 4 + attack.guard * 4, 5, 0.3);
      if (attack.guard >= 2) this.rig.shake(0.12 * attack.guard);
    } else if (r === 'broken') {
      this.sfx.guardBreak();
      this.particles.burst(shieldAt, 0x8b5a2b, 14, 6, 0.6);
      this.particles.burst(shieldAt, 0xffe28a, 10, 7, 0.35);
      this.hitStop = Math.max(this.hitStop, 0.09);
      this.rig.shake(0.4);
      this.hud.flashGuard();
    }
    return r;
  };

  private get enemyEnv(): EnemyEnv {
    return {
      playerPos: this.player.pos,
      playerAlive: this.player.alive,
      night: this.state.isNight && !this.area.indoor,
      physics: this.physics,
      hazards: this.hazards,
      sfx: this.sfx,
      particles: this.particles,
      hitPlayer: this.hitPlayer,
      pushPlayer: (from, strength) => this.player.push(from, strength),
      spawn: (e) => this.enemies.add(e),
      drop: (kind, at) => this.pickups.spawn(kind, at),
      shake: (s) => this.rig.shake(s),
    };
  }

  private get hazardEnv(): HazardEnv {
    return {
      playerPos: this.player.pos,
      physics: this.physics,
      particles: this.particles,
      hitPlayer: this.hitPlayer,
      onPop: () => this.sfx.orbPop(),
    };
  }

  // ---------------------------------------------------------------------------
  // Scripts (ScriptApi)
  // ---------------------------------------------------------------------------

  /** Runs a story script. The player has no control until it finishes; then the game saves. */
  run(script: Script) {
    if (this.mode === 'cutscene') {
      this.pendingScripts.push(script);
      return;
    }
    this.mode = 'cutscene';
    this.lock = null;
    script(this)
      .catch((e: unknown) => console.error('Script failed:', e))
      .finally(() => {
        this.rig.release();
        this.timeScale = 1;
        this.mode = 'play';
        this.save();
        const next = this.pendingScripts.shift();
        if (next) this.run(next);
      });
  }

  tween(seconds: number, fn: (p: number) => void) {
    return this.director.tween(seconds, fn);
  }

  setTimeScale(scale: number) {
    this.timeScale = scale;
  }

  showBossTitle(name: string, epithet: string) {
    this.hud.showBossTitle(name, epithet);
  }

  addEnemy(e: Enemy) {
    this.enemies.add(e);
  }

  removeEnemy(e: Enemy) {
    this.enemies.remove(e);
    if (this.lock === e) this.lock = null;
  }

  say(pages: Page[]) {
    return this.dialog.show(pages);
  }

  wait(seconds: number) {
    return this.director.wait(seconds);
  }

  until(test: () => boolean) {
    return this.director.until(test);
  }

  fade(to: number, seconds: number) {
    const from = this.fadeValue;
    return this.director.tween(seconds, (p) => {
      this.fadeValue = from + (to - from) * p;
      this.hud.setFade(this.fadeValue);
    });
  }

  async card(title: string, subtitle: string) {
    this.hud.showCard(title, subtitle);
    await this.director.until(() => this.input.pressed('confirm'));
    this.hud.hideCard();
  }

  shot(from: THREE.Vector3, lookAt: THREE.Vector3, cut = false) {
    this.rig.shot(from, lookAt, cut);
  }

  releaseCamera() {
    this.rig.release();
  }

  showAreaName(name: string) {
    this.areaName = name;
    this.hud.showArea(name);
  }

  toast(text: string) {
    this.hud.showToast(text);
  }

  warpTime(toHour: number) {
    this.warpTo = toHour;
  }

  /** Drinks one of the single-use draughts, if there's one left. */
  drink(id: DrinkId) {
    if (!this.state.drinks.use(id)) {
      this.sfx.denied();
      return;
    }
    this.sfx.drink();
    const at = this.player.pos.clone().setY(this.player.pos.y + 1.2);
    if (id === 'restore') {
      this.state.hp = this.state.maxHp;
      this.sfx.heart();
      this.particles.burst(at, 0xff6080, 20, 3, 0.9, false);
    } else {
      this.player.attackBoost = ATTACK_BOOST_SECONDS;
      this.particles.burst(at, 0xffa030, 20, 3, 0.9, false);
    }
  }

  respawn() {
    this.player.revive();
    // The checkpoint rule: every drink found is back, and any tonic has worn off.
    this.state.drinks.refill();
    this.player.attackBoost = 0;
    this.placeAtSpawn();
    this.hazards.clear();
    for (const e of this.enemies.list) e.onPlayerRespawn();
    this.content.onRespawn?.(this);
  }

  silenceMusic(on: boolean) {
    this.musicSilenced = on;
  }

  /** Fades out, moves to another area (at a named entrance), names it, fades back in. */
  async travel(id: AreaId, entrance?: string) {
    await this.fade(1, 0.5);
    this.loadArea(id, entrance);
    this.areaName = this.area.nameAt(this.player.pos.x, this.player.pos.z);
    await this.wait(0.2);
    this.showAreaName(this.areaName);
    await this.fade(0, 0.5);
  }

  giveSword() {
    this.state.set('hasSword');
    this.player.setSword(true);
  }

  // ---------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------

  save() {
    if (this.mode === 'title') return;
    this.saveSlot.write(this.state.toSave());
    this.autosaveT = AUTOSAVE_SECONDS;
  }

  private resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
