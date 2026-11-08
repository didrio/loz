/**
 * The N64 sound chain's bench (`/n64audio.html`, dev server only). Runs the game's own `Sfx`, so what you hear is what the
 * game plays: pick a song, a place and some effects, move the sliders, A/B with the chain off. See docs/audio.md.
 */
import type { RoomName } from '../core/blips';
import { Sfx } from '../core/audio';
import { N64_DEFAULT, type N64Params } from '../core/n64chain';
import type { MusicMood } from '../core/tracks';

const sfx = new Sfx();
const params: N64Params = { ...N64_DEFAULT };
const MOODS: MusicMood[] = ['day', 'night', 'village', 'villageNight', 'shrine', 'boss', 'warden', 'blight'];
const ROOM_NAMES: RoomName[] = ['outdoors', 'house', 'dungeon'];
const EFFECTS: [string, () => void][] = [
  ['hit', () => sfx.hit()], ['clank', () => sfx.clank()], ['swing', () => sfx.swing()], ['jar', () => sfx.jar()],
  ['gem', () => sfx.gem()], ['heart', () => sfx.heart()], ['hurt', () => sfx.hurt()], ['door', () => sfx.doorOpen()],
  ['enemy dies', () => sfx.enemyDie()], ['bell', () => sfx.bell(440)], ['fanfare', () => sfx.fanfare()],
];
const SLIDERS: [keyof N64Params, string, number, number, number][] = [
  ['rate', 'sample rate (Hz)', 4000, 48000, 250], ['lowpass', 'low-pass (Hz)', 1500, 20000, 100],
  ['voices', 'note cap', 4, 48, 1], ['reverb', 'reverb amount', 0, 2, 0.05],
];
let mood: MusicMood | null = null;
let room: RoomName = 'outdoors';
let timer: ReturnType<typeof setInterval> | null = null;

function start() {
  sfx.init();
  sfx.setVolumes(0.8, 0.8, 0.8);
  sfx.setChain(params);
  sfx.setRoom(room);
  if (!timer) timer = setInterval(() => sfx.updateMusic(mood ?? 'day', mood !== null), 50);
}

function render() {
  document.querySelector('#app')!.innerHTML =
    `<div class="card"><b>Song</b><br>${MOODS.map((m) => `<button data-mood="${m}" class="${m === mood ? 'on' : ''}">${m}</button>`).join('')}<button data-mood="">stop</button></div>` +
    `<div class="card"><b>Place</b><br>${ROOM_NAMES.map((r) => `<button data-room="${r}" class="${r === room ? 'on' : ''}">${r}</button>`).join('')}</div>` +
    `<div class="card"><b>Effects</b><br>${EFFECTS.map(([n], i) => `<button data-fx="${i}">${n}</button>`).join('')}</div>` +
    `<div class="card"><label class="row">chain<button id="on" class="${params.on ? 'on' : ''}">${params.on ? 'on' : 'off'}</button><span></span></label>` +
    SLIDERS.map(([k, label, min, max, step]) => `<label class="row">${label}<input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${params[k] as number}"><span>${params[k]}</span></label>`).join('') +
    `<button id="copy">Copy values</button><pre id="out"></pre></div>`;
}

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.dataset.mood !== undefined) { start(); mood = (t.dataset.mood || null) as MusicMood | null; render(); }
  else if (t.dataset.room) { start(); room = t.dataset.room as RoomName; sfx.setRoom(room); render(); }
  else if (t.dataset.fx) { start(); EFFECTS[Number(t.dataset.fx)][1](); }
  else if (t.id === 'on') { start(); params.on = !params.on; sfx.setChain(params); render(); }
  else if (t.id === 'copy') {
    const text = JSON.stringify(params);
    void navigator.clipboard?.writeText(text);
    document.querySelector('#out')!.textContent = text;
  }
});

document.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (!t.dataset.k) return;
  (params[t.dataset.k as 'rate'] as number) = Number(t.value);
  (t.nextElementSibling as HTMLElement).textContent = t.value;
  start();
  sfx.setChain(params);
});

render();
