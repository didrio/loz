// End-to-end smoke test: runs named scenarios in parallel headless Chrome pages against one
// dev server. Each scenario starts from a save fixture (scripts/fixtures/<name>.json) or from
// a new game, checks game state at each step and saves screenshots to smoke-output/<scenario>/.
//
//   npm run smoke                      all scenarios, up to 3 at a time
//   npm run smoke -- full combat       only those
//   CHROME_PATH=/path/to/chrome npm run smoke
//
// A scenario that fails is run once more, alone, once the rest are done: headless rendering
// is CPU-bound, and a busy machine makes timing steps fail that pass on a quiet one. If the
// retry passes it's reported as FLAKY (not a failure); if it fails again, it's real.
//
// Exits non-zero if a step fails or a page logs an error. See docs/testing.md.
import { launch, openGame } from './browser.mjs';

const SCENARIOS = ['full', 'combat', 'shrine-puzzle', 'shrine-keys', 'shrine-exit', 'shrine-enemies', 'shrine-glove', 'village', 'dev-menu', 'bells'];
const CONCURRENCY = 3;

const wanted = process.argv.slice(2);
for (const n of wanted) {
  if (!SCENARIOS.includes(n)) {
    console.error(`Unknown scenario "${n}". Scenarios: ${SCENARIOS.join(', ')}`);
    process.exit(2);
  }
}
const names = wanted.length ? wanted : SCENARIOS;

/** Runs one scenario; returns its buffered log (printed whole, so parallel runs don't interleave). */
async function runScenario(env, name) {
  const t0 = Date.now();
  const lines = [];
  let failed = false;
  const mod = await import(`./smoke/${name}.mjs`);
  const outDir = new URL(`../smoke-output/${name}/`, import.meta.url).pathname;
  const g = await openGame(env, outDir, { fixture: mod.fixture ?? undefined });
  const step = async (title, fn) => {
    try {
      await fn();
      lines.push(`  ✓ ${title}`);
    } catch (e) {
      failed = true;
      lines.push(`  ✗ ${title}: ${e.message}`);
    }
  };
  const check = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  // The closing check every scenario ends with.
  const noErrors = () => step('no errors in the console', async () => check(g.errors.length === 0, g.errors.join(' | ')));
  try {
    await mod.default({ ...g, step, check });
    await noErrors();
  } catch (e) {
    failed = true;
    lines.push(`  ✗ scenario crashed: ${e.message}`);
  }
  await g.page.close().catch(() => {});
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  return { name, failed, secs, lines };
}

const t0 = Date.now();
const env = await launch();
const queue = [...names];
const results = [];
const worker = async () => {
  for (let name = queue.shift(); name; name = queue.shift()) {
    const r = await runScenario(env, name);
    results.push(r);
    console.log(`${r.failed ? 'FAIL' : 'ok  '} ${r.name} (${r.secs}s)`);
    if (r.failed) console.log(r.lines.join('\n'));
  }
};
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, names.length) }, worker));

const flaky = [];
for (const first of results.filter((r) => r.failed)) {
  console.log(`retry ${first.name} alone...`);
  const r = await runScenario(env, first.name);
  console.log(`${r.failed ? 'FAIL' : 'FLAKY'} ${r.name} (${r.secs}s)${r.failed ? '' : ': passed alone; the first run failed under load'}`);
  if (r.failed) console.log(r.lines.join('\n'));
  else flaky.push(r.name);
  results[results.indexOf(first)] = r;
}
await env.close();

const failed = results.filter((r) => r.failed);
if (!failed.length && flaky.length) console.log(`Flaky under load (passed on retry): ${flaky.join(', ')}`);
const total = ((Date.now() - t0) / 1000).toFixed(0);
console.log(failed.length ? `SMOKE FAILED: ${failed.map((r) => r.name).join(', ')} (${total}s)` : `Smoke passed: ${results.length} scenarios in ${total}s. Screenshots in smoke-output/<scenario>/`);
process.exit(failed.length ? 1 : 0);
