// Shared helpers for the headless-browser scripts (smoke.mjs, look.mjs): start a dev
// server, drive the game through `window.embervale`, and take screenshots.
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

export const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');

/** Starts a dev server and a headless Chrome. Call `close()` when done. */
export async function launch() {
  const server = await createServer({ server: { port: 0, hmr: false, watch: null }, logLevel: 'error' }); // no reloads while files change mid-run
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  return {
    url,
    browser,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

/**
 * A page plus helpers for driving the game. Headless rendering is slow and game time runs
 * slower than real time there, so helpers wait on game state, never on fixed delays.
 */
export async function openGame(env, outDir, { fixture, touch = false } = {}) {
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
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  const wait = (ms) => page.waitForTimeout(ms);
  const game = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, timeout = 45000, arg) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
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
