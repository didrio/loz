// `npm run assets`: builds every registered model in Node and prints the table (triangles against budget, size, textures,
// findings). The same checks run in `npm run check` (src/render/models/registry.test.ts). Needs no browser.
import { createServer } from 'vite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
try {
  const { assetTable } = await server.ssrLoadModule('/src/render/models/validate.ts');
  console.log(assetTable());
} finally {
  await server.close();
}
