// Prints a dungeon's text map plus any structural or logic problems (softlocks, dead
// content). The fastest way to "see" a dungeon layout while writing it.
//
//   npm run map                  every dungeon in the game (DUNGEONS)
//   npm run map -- shrine        just these ids
//   npm run map -- example       the reference example (world/dungeon/example.ts)
//
// Exits non-zero if any printed dungeon has problems.
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { DUNGEONS, dungeonReport, checkDungeon } = await server.ssrLoadModule('/src/world/dungeon/index.ts');
  const { EXAMPLE_DUNGEON } = await server.ssrLoadModule('/src/world/dungeon/example.ts');
  const all = [...DUNGEONS, EXAMPLE_DUNGEON];
  const ids = process.argv.slice(2);
  const pick = ids.length ? ids.map((id) => all.find((d) => d.id === id) ?? id) : DUNGEONS;
  if (!pick.length) console.log('No dungeons in DUNGEONS yet. Try: npm run map -- example');
  let bad = false;
  for (const d of pick) {
    if (typeof d === 'string') {
      console.log(`Unknown dungeon "${d}". Known: ${all.map((x) => x.id).join(', ')}`);
      bad = true;
      continue;
    }
    console.log(dungeonReport(d), '\n');
    if (checkDungeon(d).length) bad = true;
  }
  process.exitCode = bad ? 1 : 0;
} finally {
  await server.close();
}
