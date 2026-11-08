import { initPhysics, Physics } from './core/physics';
import { Game } from './game/game';
import './ui/style.css';

async function boot() {
  await initPhysics();
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const game = new Game(canvas, new Physics());
  game.start();
  // Handle for automated tests and the browser console (dev server or ?debug only).
  const params = new URLSearchParams(location.search);
  if (import.meta.env.DEV || params.has('debug')) {
    (window as unknown as { embervale: Game }).embervale = game;
    // ?state=<Dev tab state id or number>: skip the title menu and start at that save state (docs/pipeline.md).
    const state = params.get('state');
    if (state && !game.bootToState(state)) console.error(`Unknown ?state=${state}`);
  }
}

void boot();
