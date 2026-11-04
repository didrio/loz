import { defineConfig } from 'vite';

// `npm run dev` listens on 5273 (not Vite's default 5173, which other projects use); strictPort fails
// loudly if it's taken. The smoke and look scripts start their own server on a free port (scripts/browser.mjs).
export default defineConfig({ base: './', server: { port: 5273, strictPort: true }, preview: { port: 5274, strictPort: true } });
