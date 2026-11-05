/**
 * The blips test bench (`/blips.html`, dev server only; Vite builds only index.html). Plays each NPC's lines the way the
 * dialog box does (typing at 55 letters a second, a breath after punctuation) with sliders for every voice parameter.
 * See docs/audio.md, "Talking blips".
 */
import { BLIP_PRESETS, BlipPlayer, MOODS, blipAt, type BlipVoice, type RoomName } from '../core/blips';
import { SPEAKERS } from '../content/voices';
import { visibleText } from '../ui/richText';

interface Line {
  who: string;
  voice: BlipVoice;
  text: string;
  mood?: keyof typeof MOODS;
}

const lines: Line[] = [
  { who: 'Maren', voice: { ...SPEAKERS.Maren }, text: 'Wren! Quietly! Nobody goes past the fence, not since the lantern died and the sky turned. You know that.' },
  { who: 'Tobin', voice: { ...SPEAKERS.Tobin }, text: 'You look like you haven\'t slept in a week. The mill door, west side of the square. There\'s a bed doing nothing.' },
  { who: 'Pip', voice: { ...SPEAKERS.Pip }, text: 'Button! You found her! She\'s not even wet.' },
  { who: 'Lark', voice: { ...SPEAKERS.Lark }, text: 'Did you see the lantern? Is it really out? Why would anyone take it?' },
  { who: 'Odo', voice: { ...SPEAKERS.Odo }, text: 'Fifty gems for the tunic, friend. Twenty to fill a flask. Fair prices, in hard times.' },
  { who: 'Maren (soft)', voice: { ...SPEAKERS.Maren }, mood: 'soft', text: 'Come back. Whatever you find, just come back.' },
  { who: 'Tobin (shake)', voice: { ...SPEAKERS.Tobin }, mood: 'shake', text: 'It said my name. In the air. My name.' },
];

const SLIDERS: [keyof BlipVoice, number, number, number][] = [
  ['pitch', 70, 700, 1], ['range', 0, 1.5, 0.05], ['cutoff', 300, 6000, 50], ['length', 0.02, 0.2, 0.005], ['every', 1, 5, 1],
  ['glide', -4, 4, 0.1], ['wobble', 0, 1.5, 0.05], ['wobbleRate', 2, 10, 0.1], ['gain', 0.05, 1, 0.01],
];
const WAVES: OscillatorType[] = ['sine', 'triangle', 'square', 'sawtooth'];

let audio: { ctx: AudioContext; player: BlipPlayer } | null = null;
let selected = 0;
let room: RoomName = 'outdoors';
let run = 0;

function ensureAudio() {
  if (!audio) {
    const ctx = new AudioContext();
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(ctx.destination);
    audio = { ctx, player: new BlipPlayer(ctx, out) };
  }
  void audio.ctx.resume();
  return audio;
}

function play(i: number) {
  const a = ensureAudio();
  const line = lines[i];
  const mine = ++run;
  const plain = visibleText(line.text);
  const state = { letters: 0 };
  const el = document.querySelector<HTMLElement>(`#text${i}`)!;
  let k = 0;
  const step = () => {
    if (mine !== run || k >= plain.length) return;
    const ch = plain[k];
    const blip = blipAt(line.voice, plain, k, state, line.mood ? MOODS[line.mood] : {});
    if (blip) a.player.play(blip, room);
    k++;
    el.textContent = plain.slice(0, k);
    const pause = ',;:—'.includes(ch) ? 0.12 : '.!?'.includes(ch) && (k >= plain.length || plain[k] === ' ') ? 0.28 : 0;
    setTimeout(step, (1 / 55 + pause) * 1000);
  };
  step();
}

function render() {
  const cards = document.querySelector('#cards')!;
  cards.innerHTML = lines
    .map((l, i) => `<div class="card${i === selected ? ' sel' : ''}" data-i="${i}"><div class="who">${l.who}</div><div class="text" id="text${i}"></div><button data-play="${i}">Play</button></div>`)
    .join('');
  const v = lines[selected].voice;
  const tune = document.querySelector('#tune')!;
  tune.innerHTML =
    `<div class="card"><div class="who">${lines[selected].who}</div>` +
    `<label class="row">preset<select id="preset"><option value="">(keep)</option>${Object.keys(BLIP_PRESETS).map((p) => `<option>${p}</option>`).join('')}</select><span></span></label>` +
    `<label class="row">wave<select id="wave">${WAVES.map((w) => `<option${w === v.wave ? ' selected' : ''}>${w}</option>`).join('')}</select><span></span></label>` +
    `<label class="row">room<select id="room">${(['outdoors', 'house', 'dungeon'] as RoomName[]).map((r) => `<option${r === room ? ' selected' : ''}>${r}</option>`).join('')}</select><span></span></label>` +
    SLIDERS.map(([k, min, max, step]) => `<label class="row">${k}<input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v[k]}"><span>${v[k]}</span></label>`).join('') +
    `<button id="copy">Copy values</button><pre id="out"></pre></div>`;
}

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.dataset.play) play(Number(t.dataset.play));
  else if (t.id === 'copy') {
    const text = JSON.stringify(lines[selected].voice);
    void navigator.clipboard?.writeText(text);
    document.querySelector('#out')!.textContent = text;
  } else {
    const card = t.closest<HTMLElement>('.card[data-i]');
    if (card && Number(card.dataset.i) !== selected) {
      selected = Number(card.dataset.i);
      render();
    }
  }
});

document.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  const v = lines[selected].voice;
  if (t.dataset.k) {
    (v[t.dataset.k as keyof BlipVoice] as number) = Number(t.value);
    (t.nextElementSibling as HTMLElement).textContent = t.value;
  }
});

document.addEventListener('change', (e) => {
  const t = e.target as HTMLSelectElement;
  if (t.id === 'wave') lines[selected].voice.wave = t.value as OscillatorType;
  else if (t.id === 'room') room = t.value as RoomName;
  else if (t.id === 'preset' && t.value) {
    lines[selected].voice = { ...BLIP_PRESETS[t.value as keyof typeof BLIP_PRESETS] };
    render();
  }
});

render();
