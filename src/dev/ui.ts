// The UI bench (/ui.html, dev only): the real HUD over a stand-in backdrop, to judge the period
// surface (ui/theme.ts) and the font (ui/font/) on a desktop and a phone without playing to a dialog.
// Switch the look, backdrop, font, device and moment; read the font specimen. Nothing here runs in the game.
import { pal, type Hue, type Shade } from '../render/palette';
import { loadUiFont, UI_FONT } from '../ui/font';
import { GLYPHS } from '../ui/font/glyphs';
import { Hud } from '../ui/hud';
import { applyTheme, UI_LOOK, UI_LOOKS, type UiLookId } from '../ui/theme';
import '../ui/style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (h: Hue, s: Shade) => `#${pal(h, s).toString(16).padStart(6, '0')}`;

/** Stand-in scenes: a sky over ground, in palette colours, bright to dark (where the text must still read). */
const BACKDROPS: Record<string, string> = {
  day: `linear-gradient(${hex('sky', 2)}, ${hex('sky', 3)} 55%, ${hex('grass', 2)} 56%, ${hex('grass', 1)})`,
  dusk: `linear-gradient(${hex('plum', 2)}, ${hex('flame', 2)} 55%, ${hex('straw', 1)} 56%, ${hex('bark', 1)})`,
  night: `linear-gradient(${hex('night', 1)}, ${hex('night', 2)} 55%, ${hex('leaf', 0)} 56%, ${hex('ink', 2)})`,
  dungeon: `linear-gradient(${hex('slate', 0)}, ${hex('stone', 1)} 55%, ${hex('stone', 0)} 56%, ${hex('ink', 1)})`,
  snow: `linear-gradient(${hex('chalk', 2)}, ${hex('chalk', 3)} 55%, ${hex('plaster', 2)} 56%, ${hex('sand', 3)})`,
};

const LINE = 'Old Bram locked his blade in a chest in the [place]Whispering Grove[/]. Take the [gear]Small Key[/] and press [interact] to open it.';

const params = new URLSearchParams(location.search);
const state = {
  look: (params.get('look') as UiLookId) ?? UI_LOOK,
  backdrop: params.get('backdrop') ?? 'day',
  font: params.get('font') ?? 'embervale',
  device: (params.get('device') as 'keyboard' | 'gamepad' | 'touch') ?? 'keyboard',
  view: params.get('view') ?? 'dialog',
};

const fontReady = loadUiFont();
const hud = new Hud();
hud.hideTitle();

function select(id: string, options: string[], value: string, on: (v: string) => void) {
  const el = $<HTMLSelectElement>(id);
  if (options.length) el.innerHTML = options.map((o) => `<option>${o}</option>`).join('');
  el.value = value;
  el.addEventListener('change', () => {
    on(el.value);
    params.set(id, el.value);
    history.replaceState(null, '', `?${params}`);
    render();
  });
}
select('look', Object.keys(UI_LOOKS), state.look, (v) => (state.look = v as UiLookId));
select('backdrop', Object.keys(BACKDROPS), state.backdrop, (v) => (state.backdrop = v));
select('font', [], state.font, (v) => (state.font = v));
select('device', [], state.device, (v) => (state.device = v as typeof state.device));
select('view', [], state.view, (v) => (state.view = v));

// The touch buttons, as touch.ts draws them (static: this is only for their look).
const touch = document.createElement('div');
touch.className = 'touch playing hidden';
touch.style.pointerEvents = 'none';
touch.innerHTML = `
  <div class="touch-stick" style="transform: translate(130px, ${innerHeight - 130}px)"><div class="touch-knob" style="transform: translate(18px, -10px)"></div></div>
  <div class="touch-btn tb-attack">Sword</div><div class="touch-btn tb-jump">Jump</div>
  <div class="touch-btn tb-interact show">Talk</div><div class="touch-btn tb-shield down">Shield</div>
  <div class="touch-btn tb-lock">Lock</div><div class="touch-btn tb-item">Glove</div>`;
document.body.insertBefore(touch, $('hud'));

function fillHud() {
  hud.setDevice(state.device);
  hud.setHearts(13, 20);
  hud.setGems(128);
  hud.setKeys(1, ['crimson', 'azure'], true);
  hud.setFlasks(['life', null], 0, true);
  hud.setCorner(17.5, 'Thistledown', null);
  hud.setHeading(0.3, -1);
  hud.setActions([['attack', 'Sword'], ['shield', 'Guard'], ['lock', 'Lock on']]);
  // One moment at a time, as the game shows them: walking up to someone, reading, answering.
  const play = state.view === 'play';
  const area = document.querySelector<HTMLElement>('#hud .area')!;
  if (play) hud.showArea('Whispering Grove');
  else area.classList.remove('show');
  hud.setPrompt(play ? { x: innerWidth * 0.55, y: innerHeight * 0.45, label: 'Talk' } : null);
  if (play) hud.closeDialog();
  else {
    hud.openDialog('Maren', LINE);
    hud.finishTyping();
  }
  hud.setChoices(state.view === 'choice' ? ['Take the key', 'Ask about Bram', 'Not now'] : null, 0, 2);
}

function specimen() {
  const chars = Object.keys(GLYPHS).filter((ch) => ch.trim()).join('');
  const sample = 'The bell has been quiet since the blight came. Find the prism, Wren — then ring it at dawn!';
  let html = '';
  for (const weight of [400, 700])
    for (const size of [21, 14, 32]) {
      html += `<h3>${weight === 700 ? 'Bold' : 'Regular'} · ${size}px</h3>`;
      html += `<p style="font-weight:${weight};font-size:${size}px">${chars.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`;
      html += `<p style="font-weight:${weight};font-size:${size}px">${sample}</p>`;
    }
  $('specimen').innerHTML = html;
}

function render() {
  applyTheme(state.look);
  document.documentElement.classList.toggle('font-system', state.font === 'system');
  document.body.style.background = BACKDROPS[state.backdrop];
  touch.classList.toggle('hidden', state.device !== 'touch' || state.view !== 'play');
  fillHud();
  $('specimen').classList.toggle('hidden', state.view !== 'specimen');
  if (state.view === 'specimen') specimen();
}

$('benchToggle').addEventListener('click', () => document.querySelector('.bench')!.classList.toggle('closed'));
render();
void fontReady.then((ok) => {
  $('status').textContent = ok && document.fonts.check(`16px ${UI_FONT}`) ? 'Font: Embervale loaded' : 'Font: FAILED (fallback shown; see console)';
  render();
});
addEventListener('resize', render);
