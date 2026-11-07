// The swatch page (/palette.html, dev only): every hue and shade of the master palette, and each area's sub-palette.
import { AREA_PALETTES, HUES, pal, SWATCHES, type Hue } from '../render/palette';

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

let html = '<table>';
for (const hue of Object.keys(HUES) as Hue[]) {
  html += `<tr><th>${hue}</th>`;
  for (const s of SWATCHES.filter((w) => w.hue === hue)) {
    const ink = s.lab[0] > 0.62 ? '#1d1a24' : '#e8e2d6';
    html += `<td class="sw" style="background:${css(s.hex)};color:${ink}" title="pal('${hue}', ${s.shade}) ${css(s.hex)}">${s.shade}</td>`;
  }
  html += '</tr>';
}
html += '</table><h2>Each area’s sub-palette</h2><div class="areas">';
for (const [area, list] of Object.entries(AREA_PALETTES)) {
  html += `<div><h3>${area}</h3><div class="strip">`;
  for (const [h, s] of list) html += `<div style="background:${css(pal(h, s))}" title="${h} ${s}"></div>`;
  html += '</div></div>';
}
document.getElementById('root')!.innerHTML = `${html}</div>`;
