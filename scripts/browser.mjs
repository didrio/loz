// Shared helpers for the headless-browser scripts (smoke.mjs, look.mjs): start a dev
// server, drive the game through `window.embervale`, and take screenshots.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

export const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');

/** Starts a dev server and a headless Chrome. Call `close()` when done. */
export async function launch() {
  const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
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
export async function openGame(env, outDir) {
  await mkdir(outDir, { recursive: true });
  const page = await env.browser.newPage({ viewport: { width: 1280, height: 720 } });
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
        songs: [...g.state.songs],
        hp: g.state.hp,
        pos: { x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z },
        enemies: g.enemies.list.filter((e) => e.alive).length,
        lock: !!g.lock,
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
  /** Puts Wren on the ground at (x, z), facing `facing` (0 = south/+z), camera behind. */
  const teleport = (x, z, facing) =>
    game(([x, z, facing]) => {
      const g = window.embervale;
      const y = g.physics.groundY(x, z) ?? 0;
      g.player.teleport(x, y + 0.05, z, facing);
      g.rig.snap(g.player.pos, facing);
    }, [x, z, facing]);
  /** Loads the page and waits for the title menu. */
  const boot = async () => {
    await page.goto(env.url);
    await until(() => window.embervale?.mode === 'title', 30000);
    await wait(800);
  };
  /** Boots, starts a new game and skips the intro. */
  const newGame = async () => {
    await boot();
    await press('Enter');
    await until(() => window.embervale.mode === 'cutscene', 10000);
    await finishScript();
  };

  return { page, errors, wait, game, until, shot, press, state, finishScript, teleport, boot, newGame };
}
