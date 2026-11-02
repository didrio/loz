import { initPhysics, Physics } from './core/physics';
import { Game } from './game/game';
import './ui/style.css';

async function boot() {
  await initPhysics();
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const game = new Game(canvas, new Physics());
  game.start();
  // Handle for automated tests and the browser console (dev server or ?debug only).
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    (window as unknown as { embervale: Game }).embervale = game;
  }
}

void boot();
