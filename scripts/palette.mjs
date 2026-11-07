// npm run palette: the hex colour literals still in the code, by file (docs/art.md "Palette").
// The materials snap every colour to the palette at runtime; this lists what final passes should replace with names
// (`pal('grass', 1)`), plus colours that never pass through `mat`/`surf`/`uniqueMat` and so aren't snapped at all.
//
//   npm run palette                 every file, each off-palette literal with its nearest swatch and how far it is
//   npm run palette -- --summary    one line per file: literals, how many are already exact swatches
//   npm run palette -- <path part>  only files whose path contains it (e.g. village, world/dungeon)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SWATCHES, nearest, swatchName } from '../src/render/palette.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['labs', 'imported', 'dev']);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(f)) walk(p, out);
    } else if (f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'palette.ts') out.push(p);
  }
  return out;
}

/** Every 6-digit hex literal in a file: `0xrrggbb` and CSS `#rrggbb`, with its line. */
export function literals(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/0x([0-9a-fA-F]{6})\b|'#([0-9a-fA-F]{6})'/g)) out.push({ hex: parseInt(m[1] ?? m[2], 16), line: i + 1 });
  });
  return out;
}

const exact = new Set(SWATCHES.map((s) => s.hex));
const hex6 = (n) => `0x${n.toString(16).padStart(6, '0')}`;

const args = process.argv.slice(2);
const summary = args.includes('--summary');
const filter = args.find((a) => !a.startsWith('--'));

const rows = [];
for (const file of walk(join(root, 'src'))) {
  const rel = relative(root, file);
  if (filter && !rel.includes(filter)) continue;
  const found = literals(readFileSync(file, 'utf8'));
  if (found.length) rows.push({ rel, found, onPalette: found.filter((f) => exact.has(f.hex)).length });
}
rows.sort((a, b) => b.found.length - b.onPalette - (a.found.length - a.onPalette) || a.rel.localeCompare(b.rel));

let total = 0, on = 0;
for (const r of rows) {
  total += r.found.length;
  on += r.onPalette;
  console.log(`${r.rel}  ${r.found.length} literals, ${r.onPalette} on palette`);
  if (summary) continue;
  for (const f of r.found) {
    if (exact.has(f.hex)) continue;
    const { swatch, distance } = nearest(f.hex);
    console.log(`  :${f.line}  ${hex6(f.hex)} → ${swatchName(swatch).padEnd(10)} ${hex6(swatch.hex)}  (${distance.toFixed(3)})`);
  }
}
console.log(`\n${total} literals in ${rows.length} files, ${on} on palette (${SWATCHES.length} swatches). Distances are OKLab; under ~0.03 is hard to tell apart.`);
