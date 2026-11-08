/**
 * The asset viewer (`/viewer.html`, dev server only; Vite builds only index.html). docs/pipeline.md, "The viewer, contact
 * sheet and dev shortcuts".
 *   ?asset=<registry id>   one model on a turntable under the game's sky, light and fog (time of day, place, Native/N64,
 *                          a slider per joint to pose it)
 *   ?asset=contact         every registered model side by side at one scale, the golden set marked (the `contact` look scene)
 * Extra params: `hour` (0-24), `place` (valley|village|hollow|shrine), `display` (native|performance|n64), `spin=0` (no turntable),
 * `panel=0` (hide the controls).
 */
import * as THREE from 'three';
import { DISPLAY_N64, DISPLAY_NATIVE, DISPLAY_PERFORMANCE, RetroPipeline, internalSize, pixelRatioFor, type Display } from '../render/retro';
import { ATMOSPHERES, isIndoor, type AtmosphereId } from '../render/atmosphere';
import { pal } from '../render/palette';
import { Sky } from '../render/sky';
import { ASSETS, GOLDEN_SET, assetById, type AssetEntry } from '../render/models/registry';
import { layoutShelves } from './contactLayout';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const labels = document.getElementById('labels')!;
const panel = document.getElementById('panel')!;
if (q.get('panel') === '0') panel.classList.add('hidden');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const retro = new RetroPipeline();
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe0f2, 50, 215);
const sky = new Sky(scene);

const DISPLAYS: Record<string, Display> = { native: DISPLAY_NATIVE, performance: DISPLAY_PERFORMANCE, n64: DISPLAY_N64 };
let display: Display = DISPLAYS[q.get('display') ?? 'native'] ?? DISPLAY_NATIVE;
let hours = Number(q.get('hour') ?? 12);
let place = (q.get('place') ?? 'valley') as AtmosphereId;
let spin = q.get('spin') !== '0';
const assetId = q.get('asset') ?? 'contact';
const contact = assetId === 'contact';

let perspective = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
let ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
let camera: THREE.Camera = perspective;

function resize() {
  const ratio = pixelRatioFor(display, window.devicePixelRatio);
  const size = internalSize(display, window.innerWidth * ratio, window.innerHeight * ratio);
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  retro.setSize(size);
  renderer.info.autoReset = !size;
  perspective.aspect = window.innerWidth / window.innerHeight;
  perspective.updateProjectionMatrix();
  if (contact) frameContact();
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------------------------------------------------
// One asset on a turntable
// ---------------------------------------------------------------------------------------------------------------------

const focus = new THREE.Vector3();
let orbitR = 5;
let orbitY = 1.5;
/** The camera's angle round the model (rad; 0 = front). `?angle=<deg>` fixes it and stops the turntable (front 0, three-quarter 45, side 90). */
let angle = q.has('angle') ? (Number(q.get('angle')) * Math.PI) / 180 : 0.6;
if (q.has('angle')) spin = false;
const joints: { name: string; obj: THREE.Object3D; rest: THREE.Euler }[] = [];

function setupAsset(entry: AssetEntry) {
  const model = entry.build();
  scene.add(model.root);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshLambertMaterial({ color: pal('olive', 2) }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);
  const box = new THREE.Box3().setFromObject(model.root);
  const size = box.getSize(new THREE.Vector3());
  box.getCenter(focus);
  const r = Math.max(size.x, size.y, size.z) * 0.5;
  orbitR = Math.max(1.5, (r / Math.tan((perspective.fov * Math.PI) / 360)) * 1.35);
  orbitY = focus.y + r * 0.3;
  for (const [name, obj] of Object.entries(model.joints)) joints.push({ name, obj, rest: obj.rotation.clone() });
  return { entry, size };
}

// ---------------------------------------------------------------------------------------------------------------------
// The contact sheet
// ---------------------------------------------------------------------------------------------------------------------

const placed: { entry: AssetEntry; x: number; y: number; w: number; golden: boolean }[] = [];
let sheetW = 1;
let sheetH = 1;

function setupContact() {
  const items = ASSETS.map((entry) => {
    const model = entry.build();
    const box = new THREE.Box3().setFromObject(model.root);
    const size = box.getSize(new THREE.Vector3());
    return { entry, model, box, w: Math.max(size.x, 0.4), h: Math.max(box.max.y - box.min.y, 0.1) };
  });
  const layout = layoutShelves(items.map((i) => ({ id: i.entry.id, kind: i.entry.kind, w: i.w, h: i.h })), 40, 1.2);
  sheetW = layout.width;
  sheetH = layout.height;
  scene.background = new THREE.Color(pal('ink', 2));
  scene.fog = null;
  sky.setIndoor(true); // no dome, no sun disc: the lights below do the work
  for (const p of layout.items) {
    const it = items.find((i) => i.entry.id === p.id)!;
    // Centre the model's box on its slot; its origin (its feet) on the shelf.
    const cx = (it.box.min.x + it.box.max.x) / 2;
    it.model.root.position.set(p.x + p.w / 2 - cx, p.y - it.box.min.y, 0);
    scene.add(it.model.root);
    placed.push({ entry: it.entry, x: p.x + p.w / 2, y: p.y, w: p.w, golden: GOLDEN_SET.includes(it.entry.id) });
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.8, 0.06, 0.6), new THREE.MeshBasicMaterial({ color: pal('ink', 3) }));
    shelf.position.set(p.x + p.w / 2, p.y - 0.03, 0);
    scene.add(shelf);
  }
  const hemi = new THREE.HemisphereLight(pal('chalk', 3), pal('olive', 1), 1.6);
  const sun = new THREE.DirectionalLight(pal('chalk', 3), 2.2);
  sun.position.set(-6, 14, 18);
  scene.add(hemi, sun);
  for (const p of placed) {
    const el = document.createElement('span');
    el.textContent = `${p.golden ? '★ ' : ''}${p.entry.id}`;
    if (p.golden) el.className = 'gold';
    labels.append(el);
  }
  camera = ortho;
  panel.innerHTML = '<h1>Contact sheet</h1><div class="note">Every registered model at one scale (1 m = the same size everywhere). ★ = the golden set.</div>';
}

function frameContact() {
  const aspect = window.innerWidth / window.innerHeight;
  const pad = 1.2;
  let h = sheetH + pad * 2;
  let w = h * aspect;
  if (w < sheetW + pad * 2) {
    w = sheetW + pad * 2;
    h = w / aspect;
  }
  ortho.left = -w / 2;
  ortho.right = w / 2;
  ortho.top = h / 2;
  ortho.bottom = -h / 2;
  ortho.position.set(sheetW / 2, sheetH / 2, 40);
  ortho.lookAt(sheetW / 2, sheetH / 2, 0);
  ortho.updateProjectionMatrix();
  const spans = [...labels.children] as HTMLElement[];
  placed.forEach((p, i) => {
    const sx = ((p.x - ortho.position.x) / w + 0.5) * window.innerWidth;
    const sy = (0.5 - (p.y - 0.6 - ortho.position.y) / h) * window.innerHeight;
    spans[i].style.left = `${sx}px`;
    spans[i].style.top = `${sy}px`;
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------------------------------------------------

function slider(label: string, min: number, max: number, step: number, value: number, on: (v: number) => void, parent: HTMLElement) {
  const row = document.createElement('label');
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  const out = document.createElement('span');
  out.textContent = String(value);
  input.addEventListener('input', () => {
    out.textContent = input.value;
    on(Number(input.value));
  });
  row.append(span, input, out);
  parent.append(row);
}

function select(options: string[], value: string, on: (v: string) => void) {
  const el = document.createElement('select');
  for (const o of options) el.add(new Option(o, o, false, o === value));
  el.addEventListener('change', () => on(el.value));
  return el;
}

function setupPanel(info: { entry: AssetEntry; size: THREE.Vector3 }) {
  const { entry, size } = info;
  panel.innerHTML = '';
  const h1 = document.createElement('h1');
  h1.textContent = entry.id;
  const note = document.createElement('div');
  note.className = 'note';
  note.textContent = `${entry.kind} · ${entry.tier} · ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} m${entry.note ? ` · ${entry.note}` : ''}`;
  const pick = select(ASSETS.map((a) => a.id), entry.id, (id) => {
    q.set('asset', id);
    location.search = q.toString();
  });
  panel.append(h1, note, pick);
  const scene1 = document.createElement('div');
  panel.append(Object.assign(document.createElement('h2'), { textContent: 'Scene' }), scene1);
  slider('hour', 0, 24, 0.25, hours, (v) => (hours = v), scene1);
  scene1.append(
    select(['native', 'performance', 'n64'], Object.keys(DISPLAYS).find((k) => DISPLAYS[k] === display)!, (v) => {
      display = DISPLAYS[v];
      resize();
    }),
    select(Object.keys(ATMOSPHERES), place, (v) => {
      place = v as AtmosphereId;
      applyPlace(true);
    }),
  );
  const spinBtn = Object.assign(document.createElement('button'), { textContent: spin ? 'Stop turntable' : 'Turn' });
  spinBtn.addEventListener('click', () => {
    spin = !spin;
    spinBtn.textContent = spin ? 'Stop turntable' : 'Turn';
  });
  scene1.append(spinBtn);
  slider('angle', -180, 180, 1, Math.round((angle * 180) / Math.PI), (v) => { angle = (v * Math.PI) / 180; spin = false; spinBtn.textContent = 'Turn'; }, scene1);
  if (joints.length) {
    panel.append(Object.assign(document.createElement('h2'), { textContent: 'Pose (joint rotations, degrees)' }));
    for (const j of joints) {
      const box = document.createElement('div');
      box.className = 'joint';
      box.append(Object.assign(document.createElement('div'), { textContent: j.name }));
      for (const axis of ['x', 'y', 'z'] as const) {
        const deg = Math.round((j.rest[axis] * 180) / Math.PI);
        slider(axis, -180, 180, 1, deg, (v) => (j.obj.rotation[axis] = (v * Math.PI) / 180), box);
      }
      panel.append(box);
    }
  }
  panel.append(Object.assign(document.createElement('div'), {
    className: 'note',
    textContent: 'Moves and hurtboxes belong to the behaviour, not the model: in the game, ?debug and \\ draw the hurtboxes, embervale.spawn(id, x, z) puts an enemy in front of Wren and activeBoss.forceMove(name) plays a boss move.',
  }));
}

function applyPlace(snap: boolean) {
  const indoor = isIndoor(place);
  sky.setIndoor(indoor);
  sky.setAtmosphere(place, snap);
}

// ---------------------------------------------------------------------------------------------------------------------
// Boot and loop
// ---------------------------------------------------------------------------------------------------------------------

if (contact) setupContact();
else {
  const entry = assetById(assetId);
  if (!entry) {
    panel.textContent = `No registered asset "${assetId}". Ids: ${ASSETS.map((a) => a.id).join(', ')}`;
    throw new Error(`unknown asset ${assetId}`);
  }
  setupPanel(setupAsset(entry));
  applyPlace(true);
}
resize();

let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!contact) {
    if (spin) angle += dt * 0.6;
    perspective.position.set(focus.x + Math.sin(angle) * orbitR, orbitY, focus.z + Math.cos(angle) * orbitR);
    perspective.lookAt(focus);
    sky.update(hours, focus, perspective.position, dt);
  }
  if (retro.active) retro.render(renderer, scene, camera);
  else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// The look harness reads the draw-call stats from `embervale.renderer` and waits for it to exist.
(window as unknown as { embervale: unknown }).embervale = { renderer, mode: 'viewer', assetId };
