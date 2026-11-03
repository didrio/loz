import * as THREE from 'three';
import { createArea, isAreaId, type AreaId } from '../content/areas';
import type { DevState } from '../content/devStates';
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
import { nearestInteractable, sameLevel, type Area } from '../world/area';
import { Boss } from './boss';
import { CameraRig } from './camera';
import { Combat } from './combat';
import { Debug } from './debug';
import { DevMenu } from './devMenu';
import { ChoiceMenu } from './menuDriver';
import { Dialog } from './dialog';
import { EnemyManager, type Enemy } from './enemies';
import { Hazards } from './hazards';
import { ATTACK_BOOST_SECONDS, MAX_FLASKS } from './flasks';
import { Pickups } from './pickups';
import { NO_CONTROLS, Player, type Controls } from './player';
import type { Page, Script, ScriptApi } from './script';
import { GameState } from './state';
import { TitleMenu } from './title';

/**
 * - title: the menu over a slow camera orbit
 * - play: the player has control
 * - cutscene: a script is running (dialog, item get, cutscene); no player control
 */
export type Mode = 'title' | 'play' | 'cutscene';

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
  readonly combat: Combat;
  area!: Area;
  enemies!: EnemyManager;
  mode: Mode = 'title';
  private content!: AreaContent;
  private readonly dialog: Dialog;
  private readonly saveSlot: SaveSlot;
  private readonly settings: Settings;
  private readonly timer = new THREE.Timer();
  private readonly debug: Debug | null;
  private areaName = '';
  private warpTo: number | null = null;
  private fadeValue = 0;
  private autosaveT = AUTOSAVE_SECONDS;
  private readonly title: TitleMenu;
  readonly devMenu: DevMenu;
  /** Script menus (`choose`): the bells' travel menu. */
  private readonly choice: ChoiceMenu;
  /** Slow motion for cutscenes (1 = normal). */
  private timeScale = 1;
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
    this.combat = new Combat(this);

    this.saveSlot = new SaveSlot(store);
    this.settings = decodeSettings(store.get(SETTINGS_KEY));
    this.sfx.musicOn = this.settings.music;
    this.loadArea('overworld');

    this.title = new TitleMenu(this.hud, this.sfx, !!this.saveSlot.load());

    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => document.hidden && this.save());
    this.debug = new URLSearchParams(location.search).has('debug') ? new Debug(this) : null;
    this.devMenu = new DevMenu(this, () => !!(import.meta.env.DEV || import.meta.env.VITE_DEV_SPRINT || this.debug));
    this.choice = new ChoiceMenu(this);
    // The mouse works whichever menu is open.
    const openMenu = () => (this.devMenu.isOpen ? this.devMenu.menu : this.choice.isOpen ? this.choice.driver : null);
    this.hud.onMenuHover = (i) => openMenu()?.hover(i);
    this.hud.onMenuClick = (i) => openMenu()?.click(i);
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
    this.combat.lock = null;
  }

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------

  private frame = (now: number) => {
    this.timer.update(now);
    const rawDt = Math.min(this.timer.getDelta(), 0.05);
    const frozen = this.combat.hitStop > 0;
    this.combat.hitStop -= rawDt;
    this.input.poll();
    this.hud.setDevice(this.input.device);
    const paused = this.devMenu.update();
    const dt = frozen || paused ? 0 : rawDt * this.timeScale;
    this.director.update(dt);
    // Platforms move before the player updates, so a rider takes the step along (core/physics.ts carryDelta).
    this.area.movePlatforms?.(dt);

    switch (paused ? 'paused' : this.mode) {
      case 'paused':
        break;
      case 'title':
        this.updateTitle(dt);
        break;
      case 'play':
        this.updatePlay(dt);
        break;
      case 'cutscene':
        if (this.warpTo !== null) this.advanceClock(dt); // sleeping: a script warps the clock
        this.player.update(dt, NO_CONTROLS, this.combat.playerEnv);
        this.enemies.update(dt, this.combat.enemyEnv, true);
        if (this.choice.isOpen) this.choice.update();
        else this.dialog.update(this.input.pressed('confirm'), this.menuStep());
        break;
    }

    this.updateWorld(dt, rawDt);
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.frame);
  };

  private updateTitle(dt: number) {
    const choice = this.title.update(dt, this.input, this.camera, this.state);
    if (choice === 'continue') {
      const save = this.saveSlot.load();
      if (save) this.state.load(save);
      // Resume in the area the game was saved in (at its entrance).
      const where = isAreaId(this.state.area) ? this.state.area : 'overworld';
      if (where !== this.area.id) this.loadArea(where);
      this.state.area = where;
      this.content.restore(this.state);
      this.begin(false);
    } else if (choice === 'new') {
      this.state.reset();
      this.saveSlot.clear();
      if (this.area.id !== 'overworld') this.loadArea('overworld');
      this.begin(true);
    }
  }

  private begin(newGame: boolean) {
    this.hud.hideTitle();
    this.player.setSword(this.state.has('hasSword'));
    this.player.setStoneward(this.state.has('village.stonewardTunic'));
    this.placeAtSpawn();
    this.areaName = this.area.nameAt(this.player.pos.x, this.player.pos.z);
    this.mode = 'play';
    this.content.start?.(this);
    if (newGame) this.run(intro);
    else this.showAreaName(this.areaName);
  }

  private updatePlay(dt: number) {
    // Indoors the clock stands still, except while Wren sleeps (a warp).
    if (!this.area.indoor || this.warpTo !== null) this.advanceClock(dt);
    if (this.input.clicked() && !this.input.locked) this.input.requestLock();

    this.combat.updateLock(this.input.pressed('lock'));

    // "Interact" comes before "jump" because they share a gamepad button.
    const near = nearestInteractable(this.area.interactables, this.player.pos);
    if (near && this.input.pressed('interact')) {
      const script = this.content.scripts[near.id];
      if (script) this.run(script);
      return;
    }

    if (this.input.pressed('item') && this.state.items.has('tether')) this.combat.throwTether();
    this.player.update(dt, this.controls(), this.combat.playerEnv);
    this.combat.update(dt);

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

    for (let i = 0; i < MAX_FLASKS; i++) if (this.input.pressed(i === 0 ? 'flask1' : 'flask2')) this.drink(i);

    // What you can interact with gets its prompt floating over it, not in the corner.
    const actions: [Action, string][] = [];
    if (this.state.has('hasSword')) actions.push(['attack', 'Sword']);
    if (this.state.items.has('tether')) actions.push(['item', 'Glove']);
    actions.push(['lock', this.combat.lock ? 'Release' : 'Lock on']);
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
    const near = this.mode === 'play' ? nearestInteractable(this.area.interactables, this.player.pos) : null;
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

  /** -1 / 1 when the menu keys step up / down this frame. */
  private menuStep() {
    return this.input.pressed('menuUp') ? -1 : this.input.pressed('menuDown') ? 1 : 0;
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
    hud.setFlasks(state.flasks.slots, player.attackBoost / ATTACK_BOOST_SECONDS, state.items.has('tether'));
    hud.setKeys(state.keysHere, state.dungeonKeysHere, !!state.dungeons.get(state.area)?.bossKey);
    hud.setClock(state.hours, state.day);
    if (this.mode !== 'play') hud.setActions([]);
    const mood = boss ? boss.music : this.area.music ?? this.area.musicAt?.(player.pos.x, player.pos.z, state.isNight) ?? (state.isNight ? 'night' : 'day');
    this.sfx.updateMusic(mood, this.mode !== 'title' && !this.musicSilenced);
    if (input.pressed('music')) {
      this.sfx.musicOn = this.settings.music = !this.settings.music;
      this.store.set(SETTINGS_KEY, JSON.stringify(this.settings));
      hud.showToast(this.settings.music ? 'Music on' : 'Music off ([music] to turn it back on)');
    }

    this.combat.updateMarker(dt);

    if (this.mode !== 'title') {
      const canLook = this.mode === 'play';
      this.rig.update(dt, canLook ? input.look(dt) : { yaw: 0, pitch: 0 }, player.pos, this.combat.lockAt);
      player.setOpacity(this.rig.playerOpacity);
    }
    hud.setGuard(player.guard.fills(), player.guard.broken, player.guard.paused, this.guardGaugePosition());
    hud.setPrompt(this.interactPrompt());
    this.physics.step(dt);
    this.sky.update(state.hours, this.mode === 'title' ? new THREE.Vector3() : player.pos, this.camera.position);
    this.debug?.update(dt);
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
    this.combat.lock = null;
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
    this.combat.forget(e);
  }

  async say(pages: Page[]) {
    await this.dialog.show(pages);
  }

  ask(pages: Page[], options: string[]) {
    return this.dialog.show(pages, options);
  }

  choose(title: string, options: string[]) {
    return this.choice.ask(title, options);
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

  /**
   * Drinks flask `i`, if it holds anything. A life potion at full hearts is refused, not
   * wasted: flasks don't refill on their own.
   */
  drink(i: number) {
    const potion = this.state.flasks.slots[i];
    if (!potion || (potion === 'life' && this.state.hp >= this.state.maxHp)) {
      this.sfx.denied();
      return;
    }
    this.state.flasks.drink(i);
    this.sfx.drink();
    const at = this.player.pos.clone().setY(this.player.pos.y + 1.2);
    if (potion === 'life') {
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
    // The checkpoint rule: any attack potion wears off. Empty flasks stay empty.
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
  async travel(id: AreaId, entrance?: string, quiet = false) {
    await this.fade(1, 0.5);
    this.loadArea(id, entrance);
    this.areaName = this.area.nameAt(this.player.pos.x, this.player.pos.z);
    await this.wait(0.2);
    if (!quiet) this.showAreaName(this.areaName);
    await this.fade(0, 0.5);
  }

  giveSword() {
    this.state.set('hasSword');
    this.player.setSword(true);
  }

  /** Dev menu: jumps to a ready-made point in the game, replacing the current save. */
  loadDevState(s: DevState) {
    if (s.save) this.state.load(s.save);
    else this.state.reset();
    this.loadArea(isAreaId(this.state.area) ? this.state.area : 'overworld');
    this.player.revive();
    this.player.invuln = 0; // no respawn blink: a state should look like a clean cut
    this.player.attackBoost = 0;
    this.player.setSword(this.state.has('hasSword'));
    this.player.setStoneward(this.state.has('village.stonewardTunic'));
    if (s.at) {
      const y = s.at.y ?? this.physics.groundY(s.at.x, s.at.z) ?? 0;
      this.player.teleport(s.at.x, y, s.at.z, s.at.facing);
      this.rig.snap(this.player.pos, s.at.facing);
    }
    this.musicSilenced = false;
    this.areaName = this.area.nameAt(this.player.pos.x, this.player.pos.z);
    this.save();
    if (!s.save) this.run(intro);
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
