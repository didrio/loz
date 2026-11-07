// Shared helpers for the headless-browser scripts (smoke.mjs, look.mjs): start a dev
// server, drive the game through `window.embervale`, and take screenshots.
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

export const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');

/**
 * Which renderer headless Chrome draws with: `gpu` (the real graphics card: ANGLE on Metal on a Mac) or `software`
 * (SwiftShader, on the CPU). The GPU is the default on a Mac outside CI; everywhere else (CI's Linux has no GPU) it is
 * software. `GL=software` or `GL=gpu` overrides. Look baselines are GPU renders; see docs/testing.md.
 */
export const GL = process.env.GL ?? (process.platform === 'darwin' && !process.env.CI ? 'gpu' : 'software');
const GL_ARGS = {
  software: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  gpu: ['--ignore-gpu-blocklist'], // Chrome's own pick: Metal on a Mac, a measured 0.4 s to start vs 1.4 s for SwiftShader
};

/** Starts a dev server and a headless Chrome. Call `close()` when done. */
export async function launch() {
  const server = await createServer({ server: { port: 0, hmr: false, watch: null }, logLevel: 'error' }); // no reloads while files change mid-run
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ executablePath: CHROME, args: GL_ARGS[GL] ?? GL_ARGS.software });
  return {
    url,
    browser,
    gl: GL,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

/** `stepped` pages: game time per frame, and the frames per `wait` second. The game caps a frame at 0.05 s anyway. */
export const STEP_MS = 50;

/**
 * Installed before the page's scripts when `stepped`: a clock that only moves when the script says so.
 * requestAnimationFrame callbacks queue up and run `__step(n)` times, each frame STEP_MS later on
 * performance.now (and the audio clock), and Math.random is seeded. Two runs of the same steps then draw the same frames
 * (the look scenes compare screenshots with baselines).
 */
const steppedClock = (stepMs) => {
  let t = 0;
  let id = 0;
  let queue = [];
  window.requestAnimationFrame = (cb) => {
    queue.push([++id, cb]);
    return id;
  };
  window.cancelAnimationFrame = (n) => {
    queue = queue.filter(([i]) => i !== n);
  };
  performance.now = () => t;
  // The music scheduler reads the audio clock (core/synth.ts) and draws random numbers as it goes: on the real clock
  // its draws would land differently every run and shift every other random number after them.
  const RealAudio = window.AudioContext;
  if (RealAudio) {
    window.AudioContext = class extends RealAudio {
      get currentTime() {
        return t / 1000;
      }
    };
  }
  let seed = 0x2f6e2b1;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0; // mulberry32
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  window.__step = (n) => {
    let ran = 0;
    for (let i = 0; i < n; i++) {
      t += stepMs;
      const run = queue;
      queue = [];
      for (const [, cb] of run) cb(t);
      ran += run.length;
    }
    return ran; // 0: nothing is animating yet (the game is still loading)
  };
};

/**
 * A page plus helpers for driving the game. Headless rendering is slow and game time runs
 * slower than real time there, so helpers wait on game state, never on fixed delays.
 */
export async function openGame(env, outDir, { fixture, touch = false, stepped = false } = {}) {
  await mkdir(outDir, { recursive: true });
  // `touch`: a landscape phone with the on-screen controls (ui/touch.ts, forced on with ?touch=1).
  const page = await env.browser.newPage(
    touch ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } },
  ); // its own storage
  if (fixture) {
    // Plant the save (scripts/fixtures/<name>.json) before the game boots, so the title menu
    // offers Continue. Only if the slot is empty: later reloads keep what the game saved.
    const save = await readFile(new URL(`./fixtures/${fixture}.json`, import.meta.url), 'utf8');
    await page.addInitScript(([key, raw]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
    }, ['embervale:save:0', save]);
  }
  if (stepped) await page.addInitScript(steppedClock, STEP_MS);
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  // Stepped: waits run frames (STEP_MS of game time each) instead of sleeping, and `until` checks after every frame,
  // so a script reaches the same frame on every run however slow the machine is.
  const step = async (frames) => {
    const ran = await page.evaluate((n) => window.__step(n), frames);
    if (!ran) await page.waitForTimeout(25); // nothing is animating yet (the game is still loading)
    return ran;
  };
  const wait = stepped ? (ms) => step(Math.max(1, Math.round(ms / STEP_MS))) : (ms) => page.waitForTimeout(ms);
  const game = (fn, arg) => page.evaluate(fn, arg);
  // Stepped: `timeout` is game time (STEP_MS per frame), so a slow machine takes longer but doesn't fail; real time only
  // bounds a game that never loads.
  const until = stepped
    ? async (fn, timeout = 45000, arg) => {
        const realEnd = Date.now() + timeout * 10;
        for (let t = 0; ; ) {
          const value = await page.evaluate(fn, arg);
          if (value) return value;
          if (t > timeout || Date.now() > realEnd) throw new Error(`Timeout ${timeout}ms exceeded waiting for ${fn}`);
          // Loading takes real time: no frames until the game exists, or the number of frames before the title would vary
          // with the machine's load (and so would everything that animates from then on, like the windmill).
          if (!(await page.evaluate(() => !!window.embervale))) await page.waitForTimeout(25);
          else if (await step(1)) t += STEP_MS;
        }
      }
    : (fn, timeout = 45000, arg) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
  const shot = (name) => page.screenshot({ path: `${outDir}${name}.png` });
  const press = async (key, times = 1, gap = 160) => {
    for (let i = 0; i < times; i++) {
      await page.keyboard.press(key);
      await wait(gap);
    }
  };
  const state = () =>
    game(() => {
      const g = window.embervale;
      return {
        mode: g.mode,
        flags: [...g.state.flags],
        keys: g.state.keys,
        hp: g.state.hp,
        pos: { x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z },
        enemies: g.enemies.list.filter((e) => e.alive).length,
        lock: !!g.combat.lock,
      };
    });
  /** Advances dialog until the running script ends. */
  const finishScript = async (timeoutMs = 45000) => {
    const end = Date.now() + timeoutMs;
    while ((await state()).mode === 'cutscene') {
      if (Date.now() > end) throw new Error('script never finished');
      await press('Enter', 1, 200);
    }
  };
  /**
   * Puts Wren on the ground at (x, z), facing `facing` (0 = south/+z), camera behind.
   * Indoors, pass `fromY` (just above the floor you want): from the default height the
   * ray would land on the roof.
   */
  const teleport = (x, z, facing, fromY = 400) =>
    game(([x, z, facing, fromY]) => {
      const g = window.embervale;
      const y = g.physics.groundY(x, z, fromY) ?? 0;
      g.player.teleport(x, y + 0.05, z, facing);
      g.rig.snap(g.player.pos, facing);
    }, [x, z, facing, fromY]);
  /** Loads the page and waits for the title menu. */
  const boot = async () => {
    await page.goto(touch ? `${env.url}?touch=1` : env.url);
    await until(() => window.embervale?.mode === 'title', 60000);
    await wait(800);
  };
  /**
   * Boots, starts a new game and skips the intro. Unless `fresh`, it also skips the opening (the
   * shield and the scare), so Wren has the shield as scenes used to assume.
   */
  const newGame = async ({ fresh = false } = {}) => {
    await boot();
    await press('Enter');
    await until(() => window.embervale.mode !== 'title', 10000);
    await finishScript();
    if (fresh) return;
    await game(() => {
      const g = window.embervale;
      for (const f of ['hasShield', 'village.scare']) g.state.set(f);
      g.area.shield.take();
      g.player.setShield(true);
    });
  };

  /** Boots and presses Continue: from the fixture the page was opened with, or the game's own save. */
  const continueGame = async () => {
    await boot();
    await press('Enter');
    await until(() => window.embervale.mode === 'play', 60000);
    await wait(500);
  };

  return { page, errors, wait, game, until, shot, press, state, finishScript, teleport, boot, newGame, continueGame };
}
