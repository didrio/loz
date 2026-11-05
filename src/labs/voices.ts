/**
 * The voices test bench (`/voices.html`, dev server only; Vite builds only index.html). Plays lines through
 * the speech synth and the softened chain, with sliders for every voice and delivery parameter, a readout of
 * how each word was pronounced, and the pitch curve. See docs/audio.md, "Voices".
 */

import { lookup, phonemize } from './speech/phonemize';
import { SOFT_CHAIN, VoicePlayer, type VoiceChain, type VoiceHandle } from './speech/play';
import { DELIVERIES, PRESET_VOICES, speakPhrases, type Delivery, type DeliveryName, type Speech, type VoiceProfile } from './speech/voice';

type PresetName = keyof typeof PRESET_VOICES;

interface Line {
  who: string;
  note: string;
  text: string;
  preset: PresetName;
  deliveryName: DeliveryName;
  voice: VoiceProfile;
  delivery: Delivery;
  speech?: Speech;
}

const line = (who: string, note: string, preset: PresetName, deliveryName: DeliveryName, text: string): Line => ({
  who, note, text, preset, deliveryName, voice: { ...PRESET_VOICES[preset] }, delivery: { ...DELIVERIES[deliveryName] },
});

const lines: Line[] = [
  line('Maren', 'worried', 'oldWoman', 'worried',
    'Wren! Quietly! Nobody goes past the fence, not since the lantern died and the sky turned. You know that.'),
  line('Tobin', 'dry', 'man', 'dry',
    'You look like you haven\'t slept in a week. The mill door, west side of the square. There\'s a bed doing nothing.'),
  line('Pip', 'excited', 'child', 'excited', 'Button! You found her! She\'s not even wet.'),
  line('Free line', 'type anything', 'woman', 'neutral', 'Could you fetch Button? Jars break if you hit them. She won\'t mind.'),
];

const VOICE_SLIDERS: [keyof VoiceProfile, number, number, number][] = [
  ['baseF0', 70, 400, 1], ['rangeSemis', 0, 20, 0.5], ['tractScale', 0.85, 1.4, 0.01], ['breathiness', 0, 1, 0.01],
  ['tilt', 0, 24, 0.5], ['openQuotient', 0.35, 0.85, 0.01], ['rate', 0.5, 1.6, 0.01], ['tremorDepth', 0, 1.5, 0.01],
  ['tremorRate', 2, 9, 0.1], ['jitter', 0, 0.05, 0.001], ['shimmer', 0, 2, 0.05],
];
const DELIVERY_SLIDERS: [keyof Delivery, number, number, number][] = [
  ['pitch', -6, 6, 0.1], ['range', 0, 2.5, 0.05], ['rate', 0.6, 1.5, 0.01], ['breathiness', -0.5, 0.8, 0.01],
  ['tremor', 0, 1.5, 0.01], ['loudness', -12, 6, 0.5],
];

let selected = 0;
const chain: VoiceChain = { ...SOFT_CHAIN };
let softened = true;
let audio: { ctx: AudioContext; player: VoicePlayer } | null = null;
let playing: { handle: VoiceHandle; card: number } | null = null;

function ensureAudio() {
  if (!audio) {
    const ctx = new AudioContext();
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(ctx.destination);
    audio = { ctx, player: new VoicePlayer(ctx, out) };
  }
  void audio.ctx.resume();
  return audio;
}

function render(l: Line) {
  l.speech = speakPhrases(phonemize(l.text), l.voice, l.delivery);
  return l.speech;
}

function play(i: number) {
  const l = lines[i];
  const s = render(l);
  const { player } = ensureAudio();
  const c = softened ? chain : { warmth: 20000, room: 0, level: chain.level };
  playing = { handle: player.play(s.samples, s.sampleRate, c), card: i };
  drawCard(i);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

function buildLines() {
  const root = document.getElementById('lines')!;
  root.replaceChildren();
  lines.forEach((l, i) => {
    const card = el('div', { className: `card${i === selected ? ' sel' : ''}`, id: `card${i}` });
    card.onclick = () => select(i);
    const text = el('textarea', { value: l.text, rows: 2 });
    text.oninput = () => (l.text = text.value);
    const playBtn = el('button', { textContent: 'Play' });
    playBtn.onclick = (e) => { e.stopPropagation(); select(i); play(i); };
    const stopBtn = el('button', { className: 'ghost', textContent: 'Stop' });
    stopBtn.onclick = (e) => { e.stopPropagation(); audio?.player.stop(); };
    card.append(
      el('h2', {}, l.who, el('small', { textContent: `${l.preset} · ${l.deliveryName}` })),
      el('div', { className: 'line' }, text),
      el('div', { className: 'row' }, playBtn, stopBtn),
      el('div', { className: 'phones', id: `phones${i}` }),
      el('canvas', { id: `pitch${i}`, width: 900, height: 160 }),
    );
    root.append(card);
    render(l);
    drawCard(i);
  });
}

function select(i: number) {
  if (selected === i) return;
  document.getElementById(`card${selected}`)?.classList.remove('sel');
  selected = i;
  document.getElementById(`card${i}`)?.classList.add('sel');
  buildPanel();
}

function drawCard(i: number) {
  const l = lines[i];
  const s = l.speech ?? render(l);
  const phones = document.getElementById(`phones${i}`)!;
  phones.replaceChildren(...s.timeline.words.map((w) => {
    const { phones: p, source } = lookup(w.text);
    return el('span', { className: source === 'rules' ? 'rules' : '', title: source }, el('b', { textContent: w.text }), ` ${p}`);
  }));
  drawPitch(i);
}

/** The pitch curve (Hz) with word boundaries, and a playhead while the line plays. */
function drawPitch(i: number) {
  const s = lines[i].speech!;
  const cv = document.getElementById(`pitch${i}`) as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const { width: W, height: H } = cv;
  const t = s.timeline;
  const voiced = t.f0.filter((p) => p.v > 0).map((p) => p.v);
  const lo = Math.min(...voiced) * 0.9;
  const hi = Math.max(...voiced) * 1.1;
  const x = (sec: number) => (sec / t.duration) * W;
  const y = (hz: number) => H - 34 - ((hz - lo) / (hi - lo)) * (H - 46);
  g.clearRect(0, 0, W, H);
  g.font = '13px system-ui';
  // Labels drop to a second row when they'd run into the previous one.
  const rowEnd = [-Infinity, -Infinity];
  for (const w of t.words) {
    g.fillStyle = 'rgba(224,168,79,0.08)';
    g.fillRect(x(w.start), 0, x(w.end) - x(w.start), H);
    g.fillStyle = '#a99f90';
    const lx = x(w.start) + 2;
    const row = lx >= rowEnd[0] ? 0 : lx >= rowEnd[1] ? 1 : rowEnd[0] <= rowEnd[1] ? 0 : 1;
    g.fillText(w.text, lx, H - 4 - row * 15);
    rowEnd[row] = lx + g.measureText(w.text).width + 4;
  }
  g.strokeStyle = '#e0a84f';
  g.lineWidth = 2;
  g.beginPath();
  t.f0.forEach((p, k) => (k ? g.lineTo(x(p.t), y(p.v)) : g.moveTo(x(p.t), y(p.v))));
  g.stroke();
  g.fillStyle = '#a99f90';
  g.fillText(`${Math.round(hi)} Hz`, 4, 14);
  g.fillText(`${Math.round(lo)} Hz · ${t.duration.toFixed(2)} s`, W - 150, 14);
  if (playing?.card === i && audio) {
    const now = audio.ctx.currentTime - playing.handle.startedAt;
    if (now >= 0 && now <= t.duration) {
      g.fillStyle = '#f1e7d0';
      g.fillRect(x(now), 0, 2, H);
    }
  }
}

function slider<T>(obj: T, key: keyof T, min: number, max: number, step: number, onChange: () => void) {
  const out = el('output', { textContent: String(obj[key]) });
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(obj[key]) });
  input.oninput = () => {
    (obj[key] as number) = Number(input.value);
    out.textContent = input.value;
    onChange();
  };
  return el('label', {}, String(key), input, out);
}

function buildPanel() {
  const l = lines[selected];
  const panel = document.getElementById('panel')!;
  const rerender = () => { render(l); drawCard(selected); };

  const presetSel = el('select');
  for (const p of Object.keys(PRESET_VOICES)) presetSel.append(el('option', { value: p, textContent: p, selected: p === l.preset }));
  presetSel.onchange = () => { l.preset = presetSel.value as PresetName; l.voice = { ...PRESET_VOICES[l.preset] }; refresh(); };
  const delSel = el('select');
  for (const d of Object.keys(DELIVERIES)) delSel.append(el('option', { value: d, textContent: d, selected: d === l.deliveryName }));
  delSel.onchange = () => { l.deliveryName = delSel.value as DeliveryName; l.delivery = { ...DELIVERIES[l.deliveryName] }; refresh(); };

  const softBox = el('input', { type: 'checkbox', checked: softened });
  softBox.onchange = () => (softened = softBox.checked);

  const copied = el('span', { id: 'copied' });
  const copy = el('button', { className: 'ghost', textContent: 'Copy values' });
  copy.onclick = async () => {
    const r = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
    await navigator.clipboard.writeText(`// ${l.who} (${l.preset} · ${l.deliveryName})\nvoice: ${r(l.voice)},\ndelivery: ${r(l.delivery)},\nchain: ${r(chain)},`);
    copied.textContent = 'copied';
    setTimeout(() => (copied.textContent = ''), 1500);
  };
  const again = el('button', { textContent: 'Play' });
  again.onclick = () => play(selected);

  panel.replaceChildren(
    el('h3', { textContent: `${l.who}: voice` }),
    el('div', { className: 'row' }, presetSel, delSel),
    ...VOICE_SLIDERS.map(([k, a, b, s]) => slider(l.voice, k, a, b, s, rerender)),
    el('h3', { textContent: 'Delivery' }),
    ...DELIVERY_SLIDERS.map(([k, a, b, s]) => slider(l.delivery, k, a, b, s, rerender)),
    el('h3', { textContent: 'Softened chain (all lines)' }),
    el('label', {}, 'on', softBox, el('output')),
    slider(chain, 'warmth', 1500, 12000, 100, () => {}),
    slider(chain, 'room', 0, 0.8, 0.01, () => {}),
    slider(chain, 'level', 0, 1.5, 0.01, () => {}),
    el('div', { className: 'row' }, again, copy, copied),
  );

  function refresh() {
    document.querySelector(`#card${selected} h2 small`)!.textContent = `${l.preset} · ${l.deliveryName}`;
    rerender();
    buildPanel();
  }
}

/** The playhead. */
function tick() {
  if (playing) drawPitch(playing.card);
  requestAnimationFrame(tick);
}

document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !(e.target instanceof HTMLTextAreaElement)) {
    e.preventDefault();
    play(selected);
  }
});

buildLines();
buildPanel();
tick();
