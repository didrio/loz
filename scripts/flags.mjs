// Who sets and who reads each quest flag (FLAGS in src/game/state.ts). `npm run flags` prints the table;
// src/game/flags.test.ts imports scan() and fails on a flag nothing sets or nothing reads.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = join(root, 'src/game/state.ts');

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== 'imported') walk(p, out);
    } else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/** The names in FLAGS. */
export function flagNames() {
  const line = readFileSync(STATE, 'utf8').split('\n').find((l) => l.startsWith('export const FLAGS'));
  return [...line.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/**
 * For each flag: `sets` and `reads` as 'file:line' lists, plus `lists` (mentions that are neither, e.g. a save
 * state's flag list: the game applies them as sets). Test files don't count; neither does the FLAGS line itself.
 */
export function scan() {
  const names = flagNames();
  const res = Object.fromEntries(names.map((n) => [n, { sets: [], reads: [], lists: [] }]));
  for (const file of walk(join(root, 'src'))) {
    const rel = relative(root, file);
    readFileSync(file, 'utf8').split('\n').forEach((text, i) => {
      if (file === STATE && text.startsWith('export const FLAGS')) return;
      for (const m of text.matchAll(/'([^']+)'/g)) {
        const r = res[m[1]];
        if (!r) continue;
        const before = text.slice(0, m.index);
        const where = `${rel}:${i + 1}`;
        if (/\bset\(\s*$/.test(before)) r.sets.push(where);
        else if (/\bhas\(\s*$/.test(before)) r.reads.push(where);
        else r.lists.push(where);
      }
    });
  }
  return res;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = scan();
  for (const [name, r] of Object.entries(res)) {
    const warn = !r.sets.length && !r.lists.length ? '  !! never set' : !r.reads.length ? '  !! never read' : '';
    console.log(`${name}${warn}`);
    console.log(`  set:   ${r.sets.join(', ') || '-'}`);
    console.log(`  read:  ${r.reads.join(', ') || '-'}`);
    if (r.lists.length) console.log(`  other: ${r.lists.join(', ')}`);
  }
}
