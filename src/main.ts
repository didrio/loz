import { initPhysics, Physics } from './core/physics';
import { Game } from './game/game';
import { BAKE, bakePending, bakeSettled, bakeStats, setBakedLight, setBakeStrength } from './render/bakeLight';
import { loadUiFont } from './ui/font';
import { applyTheme } from './ui/theme';
import './ui/style.css';

async function boot() {
  applyTheme();
  // The font is built in code (ui/font/); if it fails, the CSS falls back to a system font.
  await Promise.all([initPhysics(), loadUiFont()]);
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const game = new Game(canvas, new Physics());
  game.start();
  // Handle for automated tests and the browser console (dev server or ?debug only).
  const params = new URLSearchParams(location.search);
  if (import.meta.env.DEV || params.has('debug')) {
    (window as unknown as { embervale: Game }).embervale = game;
    // The light bake's controls (look scenes wait on `settled` before a shot; render/bakeLight.ts).
    (window as unknown as { embervaleBake: unknown }).embervaleBake = {
      set: setBakedLight, strength: setBakeStrength, settled: bakeSettled, pending: bakePending, stats: bakeStats, BAKE,
    };
    // ?state=<Dev tab state id or number>: skip the title menu and start at that save state (docs/pipeline.md).
    const state = params.get('state');
    if (state && !game.bootToState(state)) console.error(`Unknown ?state=${state}`);
  }
}

void boot();
