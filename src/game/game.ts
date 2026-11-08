import * as THREE from 'three';
import { createArea, isAreaId, type AreaId } from '../content/areas';
import { findDevState, type DevState } from '../content/devStates';
import { ENEMY_SPAWNERS } from './spawn';
import type { AreaContent } from '../content/overworld';
import { death, intro } from '../content/story';
import { Sfx } from '../core/audio';
import { Director } from '../core/director';
import { Input, type Action } from '../core/input';
import type { Physics } from '../core/physics';
import { DEFAULT_SETTINGS, decodeSettings, localStore, SaveSlot, type KeyValueStore, type Settings } from '../core/save';
import { Motes } from '../render/motes';
import { Particles } from '../render/particles';
import { ShadowRig } from '../render/shadows';
import { RetroPipeline, renderStill, internalSize, pixelRatioFor, DISPLAY_NATIVE, DISPLAY_PERFORMANCE, DISPLAY_N64 } from '../render/retro';
import type { AtmosphereId } from '../render/atmosphere';
import { Sky } from '../render/sky';
import { Hud } from '../ui/hud';
import { nearestInteractable, sameLevel, type Area } from '../world/area';
import { Boss } from './boss';
import { CameraRig } from './camera';
import { dungeonQuiet } from './dungeonQuiet';
import { blighted, blightMood, fieldPopulation, stepBlight } from './blight';
import { Combat } from './combat';
import { Debug } from './debug';
import { BudSystem } from './buds';
import { ChoiceMenu } from './menuDriver';
import { Dialog } from './dialog';
import { EnemyManager, type Enemy } from './enemies';
import { Hazards } from './hazards';
import { ATTACK_BOOST_SECONDS, MAX_FLASKS } from './flasks';
import { PauseMenu } from './pauseMenu';
import { Pickups } from './pickups';
import { NO_CONTROLS, Player, type Controls } from './player';
import type { Page, Script, ScriptApi } from './script';
import { GameState, dayTurn } from './state';
import { TitleMenu } from './title';
import { TouchControls, wantsTouch, type TouchContext } from '../ui/touch';
import { pal } from '../render/palette';

/**
 * - title: the menu over a slow camera orbit
 * - play: the player has control
 * - cutscene: a script is running (dialog, item get, cutscene); no player control
 */
export type Mode = 'title' | 'play' | 'cutscene';

const SETTINGS_KEY = 'embervale:settings';
const AUTOSAVE_SECONDS = 30;
/** A full day passes in about five minutes. */
const HOURS_PER_SECOND = 1 / 24; // a day and night take 10 minutes
const WARP_HOURS_PER_SECOND = 6;

/**
 * Owns every system and runs the frame loop. Also implements `ScriptApi`, the surface that
 * story scripts in `src/content/` use. Holds wiring, not rules: rules live in the systems.
 */
export class Game implements ScriptApi {
  readonly renderer: THREE.WebGLRenderer;
  /** The retro look's render targets and passes (render/retro.ts); inactive when the setting is Off. */
  private readonly retro = new RetroPipeline();
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1500);
  private lookDir = new THREE.Vector3();
  readonly input: Input;
  readonly sfx = new Sfx();
  readonly hud = new Hud();
  readonly director = new Director();
  readonly state = new GameState();
  readonly particles: Particles;
  readonly pickups: Pickups;
  readonly sky: Sky;
  /** The sun's shadow map (render/shadows.ts): on by the Shadows setting, outdoors only. */
  readonly shadows: ShadowRig;
  private readonly motes: Motes;
  readonly player: Player;
  readonly rig: CameraRig;
  readonly hazards: Hazards;
  readonly combat: Combat;
  area!: Area;
  enemies!: EnemyManager;
  mode: Mode = 'title';
  /** The loaded area's content (scripts by id). */
  content!: AreaContent;
  private readonly dialog: Dialog;
  private readonly saveSlot: SaveSlot;
  /** Player-chosen options (the pause menu's Settings tab); change them through `changeSettings`. */
  readonly settings: Settings;
  private readonly timer = new THREE.Timer();
  private readonly debug: Debug | null;
  private areaName = '';
  /** The dungeon's corner picture (a data URL), rendered when it loads; null outside dungeons. */
  private portrait: string | null = null;
  private warpTo: number | null = null;
  private fadeValue = 0;
  private autosaveT = AUTOSAVE_SECONDS;
  private readonly title: TitleMenu;
  /** The on-screen controls (phones and tablets only; ui/touch.ts). */
  private readonly touch: TouchControls;
  readonly pauseMenu: PauseMenu;
  readonly buds: BudSystem;
  /** Script menus (`choose`): the bells' travel menu. */
  private readonly choice: ChoiceMenu;
  /** Slow motion for cutscenes (1 = normal). */
  private timeScale = 1;
  /** The music is off (Wren just died). */
  private musicSilenced = false;
  /** Wren is hidden (a vision) while this area is loaded; leaving it shows her again. */
  private hiddenIn: string | null = null;
  /** Set when a script is waiting to run after the current one. */
  private pendingScripts: Script[] = [];

  constructor(canvas: HTMLCanvasElement, readonly physics: Physics, private readonly store: KeyValueStore = localStore) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(pixelRatioFor(DISPLAY_NATIVE, window.devicePixelRatio));
    this.scene.fog = new THREE.Fog(0xbfe0f2, 50, 215);
    window.addEventListener('resize', () => this.resize()); // sized for real by applySettings, once the settings are read
    this.watchPixelRatio();

    this.input = new Input(canvas);
    this.touch = new TouchControls(this.input, document.getElementById('hud')!, () => this.sfx.init());
    this.dialog = new Dialog(this.hud, this.sfx, () => this.area.voiceRoom ?? 'outdoors');
    this.sky = new Sky(this.scene);
    this.shadows = new ShadowRig(this.renderer, this.scene, this.sky.sun);
    this.motes = new Motes(this.scene);
    this.particles = new Particles(this.scene);
    this.pickups = new Pickups(this.scene);
    this.player = new Player(this.scene, physics, this.state);
    this.rig = new CameraRig(this.camera, physics);
    this.hazards = new Hazards(this.scene);
    this.combat = new Combat(this);

    this.saveSlot = new SaveSlot(store);
    this.settings = decodeSettings(store.get(SETTINGS_KEY), { ...DEFAULT_SETTINGS, display: wantsTouch() ? DISPLAY_PERFORMANCE : DISPLAY_NATIVE, shadows: !wantsTouch() });
    this.applySettings();
    this.loadArea('overworld');

    this.title = new TitleMenu(this.hud, this.sfx, !!this.saveSlot.load());

    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => document.hidden && this.save());
    this.debug = new URLSearchParams(location.search).has('debug') ? new Debug(this) : null;
    this.pauseMenu = new PauseMenu(this);
    this.buds = new BudSystem(this);
    this.choice = new ChoiceMenu(this);
    // The mouse works whichever menu is open.
    const openMenu = () => (this.pauseMenu.isOpen ? this.pauseMenu.menu : this.choice.isOpen ? this.choice.driver : null);
    this.hud.onMenuHover = (i) => openMenu()?.hover(i);
    this.hud.onMenuClick = (i) => openMenu()?.click(i);
    this.hud.onChoiceClick = (i) => this.dialog.click(i);
    this.hud.onChoiceHover = (i) => this.dialog.hover(i);
    this.hud.onMenuAdjust = (i, dir) => openMenu()?.adjust(i, dir);
    this.hud.onMenuSlide = (i, fraction) => openMenu()?.slide(i, fraction);
    this.hud.onMenuTab = (i) => this.pauseMenu.setTab(i);
    this.hud.onTitleClick = (i) => this.title.click(i);
    this.hud.onTap = (a) => this.input.touch?.tap(a);
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
    if (this.hiddenIn !== id) this.hiddenIn = null;
    const { area, content } = createArea(id, this.physics);
    this.area = area;
    this.content = content;
    this.scene.add(area.root);
    this.shadows.mark();
    this.physics.refreshQueries();
    this.sky.setIndoor(!!area.indoor);
    this.sfx.setRoom(area.voiceRoom ?? 'outdoors');
    this.rig.dist = area.indoor ? 7 : 9;
    const valleyOpen = this.state.has('valleyOpen');
    this.enemies = new EnemyManager(area.root, this.physics, area, fieldPopulation(area, valleyOpen));
    // A loaded area starts at its blight level; only a lift in front of the player eases.
    this.sky.blight = blighted(area, valleyOpen) ? 1 : 0;
    this.area.setBlight?.(this.sky.blight);
    this.state.area = id;
    this.placeAtSpawn(entrance);
    this.portrait = this.capturePortrait();
    if (this.mode !== 'title') {
      this.content.restore(this.state);
      this.content.start?.(this);
    }
  }

  /**
   * Renders the area's `portrait` view once: a fresh camera, the area's own light and fog, no Wren and no enemies (none exist yet).
   * Cached for the visit by the caller.
   */
  private capturePortrait(): string | null {
    const view = this.area.portrait;
    if (!view) return null;
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    cam.position.copy(view.eye);
    cam.lookAt(view.target);
    cam.updateMatrixWorld();
    const wasOpacity = this.rig.playerOpacity;
    this.player.setOpacity(0);
    this.sky.setIndoor(true); // the next update snaps the fog instead of easing
    if (this.area.fogAt) this.sky.indoorFogTarget = this.area.fogAt(view.eye);
    this.sky.update(this.state.hours, view.eye, view.eye, 0);
    this.area.update(0, { night: 0, playerPos: view.eye }); // the lights nearest the view, not the doorway
    const url = renderStill(this.renderer, this.scene, cam, this.settings.display === DISPLAY_N64 ? 64 : 128, this.settings.display);
    this.area.update(0, { night: 0, playerPos: this.player.pos });
    this.player.setOpacity(wasOpacity);
    this.sky.setIndoor(true);
    return url || null;
  }

  /** The atmosphere (render/atmosphere.ts) of the ground at `p`: the area's say, else the valley's outdoors or the shrine's indoors. */
  private atmosphereAt(p: THREE.Vector3): AtmosphereId {
    return this.area.atmosphereAt?.(p.x, p.z) ?? (this.area.indoor ? 'shrine' : 'valley');
  }

  private placeAtSpawn(entrance?: string) {
    const s = (entrance && this.area.entrances?.[entrance]) || this.area.spawn;
    this.area.streamAt?.(s.x, s.z);
    const y = s.y ?? this.physics.groundY(s.x, s.z) ?? 0;
    this.player.teleport(s.x, y, s.z, s.facing);
    this.rig.snap(this.player.pos, s.facing);
    this.sky.setAtmosphere(this.atmosphereAt(this.player.pos), true);
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
    const paused = this.touch.blocked || this.pauseMenu.update();
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
        else this.dialog.update(this.input.pressed('confirm'), this.menuStep(), this.input.pressed('cancel'));
        break;
    }

    this.updateWorld(dt, rawDt);
    this.input.endFrame();
    if (this.retro.active) this.retro.render(this.renderer, this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
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
    this.player.setShield(this.state.has('hasShield'));
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

    const touch = this.input.device === 'touch';
    this.combat.updateLock(this.input.pressed('lock'), touch);

    // "Interact" comes before "jump" because they share a gamepad button (touch has a button of its own).
    const near = this.nearInteractable();
    if (near && this.input.pressed('interact')) {
      const script = this.content.scripts[near.id];
      if (script) this.run(script);
      return;
    }

    if (this.input.pressed('item') && this.state.items.has('tether')) this.combat.throwTether();
    if (touch && this.input.pressed('attack') && this.state.has('hasSword')) this.combat.aimSwing();
    this.player.update(dt, this.controls(), this.combat.playerEnv);
    this.combat.update(dt);
    this.buds.update(dt);

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
      this.dialog.cutVoice();
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

  /** What interact would use: the nearest in reach; on touch the one most in front (the button can't aim). */
  private nearInteractable() {
    return nearestInteractable(this.area.interactables, this.player.pos, this.input.device === 'touch' ? this.player.facing : undefined);
  }

  /** The interact prompt floating over whatever is in reach (null when nothing is, or not in play). */
  private interactPrompt() {
    const near = this.mode === 'play' ? this.nearInteractable() : null;
    if (!near) return null;
    const at = this.toScreen(new THREE.Vector3(near.x, near.promptY ?? this.player.pos.y + 2.4, near.z));
    return at && { ...at, label: near.label };
  }

  /** What the touch controls show: which buttons, and whether a tap reads on or the stick moves Wren. */
  private touchContext(): TouchContext {
    const { mode, state } = this;
    const menu = this.pauseMenu.isOpen || this.choice.isOpen || this.dialog.asking;
    const near = mode === 'play' ? this.nearInteractable() : null;
    return {
      mode: mode === 'title' ? 'title' : menu ? 'menu' : mode === 'cutscene' ? 'dialog' : 'play',
      use: near?.label ?? null, sword: state.has('hasSword'), shield: state.has('hasShield'), tether: state.items.has('tether'), locked: !!this.combat.lock,
    };
  }

  /** A world point in screen pixels, or null if it's behind the camera. */
  toScreen(p: THREE.Vector3) {
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
    const wasNight = this.state.isNight;
    if (this.warpTo === null) this.state.advance(dt * HOURS_PER_SECOND);
    else {
      const left = (this.warpTo - this.state.hours + 24) % 24;
      const step = dt * WARP_HOURS_PER_SECOND;
      if (step >= left) {
        this.state.advance(left);
        this.warpTo = null;
      } else this.state.advance(step);
    }
    const turn = dayTurn(wasNight, this.state.isNight);
    if (turn) this.hud.showArea(turn);
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
    this.area.streamAt?.(player.pos.x, player.pos.z);
    this.area.update(dt, { night: this.sky.night, playerPos: player.pos });
    this.particles.update(dt);
    hud.update(rawDt, (from, to) => this.dialog.typed(from, to));
    const boss = this.activeBoss;
    hud.setBoss(boss && this.mode !== 'title' ? { name: boss.title, hp: boss.hp, maxHp: boss.maxHp, marks: [0.5] } : null);
    const gloomTarget = Math.max(0, ...this.enemies.list.map((e) => (e instanceof Boss ? e.gloom : 0)));
    this.sky.gloom += (gloomTarget - this.sky.gloom) * Math.min(1, rawDt * 1.5);
    const isBlighted = blighted(this.area, state.has('valleyOpen'));
    this.sky.blight = stepBlight(this.sky.blight, isBlighted ? 1 : 0, rawDt);
    this.area.setBlight?.(this.sky.blight);
    this.motes.update(rawDt, player.pos, this.sky.moteLook());
    hud.setHearts(state.hp, state.maxHp);
    hud.setGems(state.gems);
    hud.setFlasks(state.flasks.slots, player.attackBoost / ATTACK_BOOST_SECONDS, state.items.has('tether'));
    hud.setKeys(state.keysHere, state.dungeonKeysHere, !!state.dungeons.get(state.area)?.bossKey);
    hud.setCorner(state.hours, this.mode === 'title' ? '' : this.areaName, this.mode === 'title' ? null : this.portrait);
    if (this.mode !== 'play') hud.setActions([]);
    const mood = boss ? boss.music : blightMood(this.area.music ?? this.area.musicAt?.(player.pos.x, player.pos.z, state.isNight) ?? (state.isNight ? 'night' : 'day'), isBlighted);
    this.sfx.updateMusic(mood, this.mode !== 'title' && !this.musicSilenced && !dungeonQuiet(state.area, state));

    this.combat.updateMarker(dt);
    if (this.input.touch) this.input.touch.buttonLooks = player.surfing;
    this.touch.setContext(this.touchContext());

    if (this.mode !== 'title') {
      const canLook = this.mode === 'play';
      this.rig.update(dt, canLook ? input.look(dt) : { yaw: 0, pitch: 0 }, player.pos, this.combat.lockAt);
      player.setOpacity(this.hiddenIn ? 0 : this.rig.playerOpacity);
    }
    const look = this.camera.getWorldDirection(this.lookDir);
    hud.setHeading(look.x, look.z);
    hud.setGuard(player.guard.fills(), player.guard.broken, player.guard.paused, this.guardGaugePosition());
    hud.setBudGauge(this.buds.gauge());
    hud.setPrompt(this.interactPrompt());
    this.physics.step(dt);
    if (this.area.fogAt) this.sky.indoorFogTarget = this.area.fogAt(player.pos);
    this.sky.setAtmosphere(this.atmosphereAt(player.pos));
    this.sky.update(state.hours, this.mode === 'title' ? new THREE.Vector3() : player.pos, this.camera.position, dt);
    this.shadows.update(dt, !!this.area.indoor);
    this.debug?.update(dt);
  }

  // ---------------------------------------------------------------------------
  // Scripts (ScriptApi)
  // ---------------------------------------------------------------------------

  /** Runs the loaded area's script with this id, if it has one (e.g. `jar.doll`, from combat). */
  runScript(id: string) {
    const script = this.content.scripts[id];
    if (script) this.run(script);
  }

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

  /** Cuts off an NPC's voice (the pause menu opening). */
  cutVoice() {
    this.dialog.cutVoice();
  }

  async say(pages: Page[]) {
    await this.dialog.show(pages);
  }

  ask(pages: Page[], options: string[], exit?: number) {
    return this.dialog.show(pages, options, exit);
  }

  choose(title: string, options: string[], exit?: number) {
    this.dialog.cutVoice();
    return this.choice.ask(title, options, exit);
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

  hidePlayer(hidden: boolean) {
    this.hiddenIn = hidden ? this.area.id : null;
  }

  releaseCamera(snap = false) {
    this.rig.release();
    if (snap) this.rig.snap(this.player.pos, this.player.facing);
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
      this.particles.fx('itemSparkle', at, { color: pal('rose', 3), count: 20, life: 0.9 });
    } else {
      this.player.attackBoost = ATTACK_BOOST_SECONDS;
      this.particles.fx('itemSparkle', at, { color: pal('amber', 2), count: 20, life: 0.9 });
    }
  }

  respawn() {
    this.hiddenIn = null;
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
  async travel(id: AreaId, entrance?: string, quiet = false, arrive?: () => void) {
    await this.fade(1, 0.5);
    this.loadArea(id, entrance);
    arrive?.(); // set the camera (or hide Wren) before the screen fades back in
    this.areaName = this.area.nameAt(this.player.pos.x, this.player.pos.z);
    await this.wait(0.2);
    if (!quiet) this.showAreaName(this.areaName);
    await this.fade(0, 0.5);
  }

  giveSword() {
    this.state.set('hasSword');
    this.player.setSword(true);
  }

  giveShield() {
    this.state.set('hasShield');
    this.player.setShield(true);
  }

  /** Dev: `?state=<id>` boots straight into a Dev tab save state (no title menu). Returns false for an unknown state. */
  bootToState(key: string): boolean {
    const s = findDevState(key);
    if (!s) return false;
    this.hud.hideTitle();
    this.mode = 'play';
    this.content.start?.(this);
    this.loadDevState(s);
    return true;
  }

  /** Dev: puts a registered enemy (render/models/registry.ts id) at (x, z), or 3 m in front of Wren. */
  spawn(id: string, x?: number, z?: number) {
    const make = ENEMY_SPAWNERS[id];
    if (!make) throw new Error(`No spawnable enemy "${id}". Try: ${Object.keys(ENEMY_SPAWNERS).join(', ')}`);
    const f = this.player.facing;
    const at = { x: x ?? this.player.pos.x + Math.sin(f) * 3, z: z ?? this.player.pos.z + Math.cos(f) * 3 };
    const e = make(this.scene, this.physics, at.x, at.z);
    this.enemies.add(e);
    return e;
  }

  /** Dev tab: jumps to a ready-made point in the game, replacing the current save. */
  loadDevState(s: DevState) {
    this.hiddenIn = null;
    if (s.save) this.state.load(s.save);
    else this.state.reset();
    this.loadArea(isAreaId(this.state.area) ? this.state.area : 'overworld');
    this.player.revive();
    this.player.invuln = 0; // no respawn blink: a state should look like a clean cut
    this.player.attackBoost = 0;
    this.player.setSword(this.state.has('hasSword'));
    this.player.setShield(this.state.has('hasShield'));
    this.player.setStoneward(this.state.has('village.stonewardTunic'));
    if (s.at) {
      this.area.streamAt?.(s.at.x, s.at.z); // a region there must have its ground before we look for it
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

  /** Changes some settings, applies them and saves them. */
  changeSettings(patch: Partial<Settings>) {
    Object.assign(this.settings, patch);
    this.applySettings();
    this.store.set(SETTINGS_KEY, JSON.stringify(this.settings));
  }

  private applySettings() {
    const s = this.settings;
    this.sfx.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume, s.voiceVolume);
    this.input.mouseSensitivity = s.mouseSensitivity;
    this.input.stickSensitivity = s.stickSensitivity;
    this.input.invertY = s.invertY;
    this.shadows.configure(s.shadows, s.display);
    this.resize();
  }

  /** The pause menu's Dev tab (sprint, invincible, save states). On for everyone for now; the Steam build sets `VITE_DISABLE_DEV_TAB=1` to drop it. */
  readonly devTab = import.meta.env.VITE_DISABLE_DEV_TAB !== '1';

  /** Whether the browser lets the page go fullscreen (not iPhones, not inside some frames). */
  get canFullscreen() {
    return !!document.fullscreenEnabled;
  }

  get isFullscreen() {
    return !!document.fullscreenElement;
  }

  /** Browsers only allow this from a key press or click, so a gamepad button may be refused: say so. */
  setFullscreen(on: boolean) {
    const done = on ? document.documentElement.requestFullscreen() : document.fullscreenElement ? document.exitFullscreen() : Promise.resolve();
    done.catch(() => this.hud.showToast('The browser refused fullscreen (press F11, or click the toggle)'));
  }

  /** Moving the window to a screen of another density (or zooming the page) changes the ratio: resize to match. */
  private watchPixelRatio() {
    if (typeof matchMedia !== 'function') return;
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => {
      this.resize();
      this.watchPixelRatio();
    }, { once: true });
  }

  private resize() {
    const { display } = this.settings;
    const ratio = pixelRatioFor(display, window.devicePixelRatio);
    // N64: the scene's rows are counted in device pixels (up to the canvas's own), then scaled up softly.
    const size = internalSize(display, window.innerWidth * ratio, window.innerHeight * ratio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.retro.setSize(size);
    this.renderer.info.autoReset = !size;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
