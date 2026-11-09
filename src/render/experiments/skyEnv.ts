import * as THREE from 'three';

/**
 * EXPERIMENT (T62): the experiment barrels' own reflections, shared by `realBarrel.ts` and `modernBarrel.ts`. A material
 * that wears this cube carries it in `userData.ownEnv`, so `ModernLook` can swap it for the scene's sky-following
 * environment while modern lighting is on, and give it back after.
 */

/** A soft sky-and-ground cube for reflections and ambient bounce (no images: six tiny generated faces). */
export function skyCube(): THREE.CubeTexture {
  const N = 16;
  const sky = [0.55, 0.68, 0.86], hor = [0.82, 0.8, 0.72], gnd = [0.32, 0.29, 0.21];
  const faces: THREE.DataTexture[] = [];
  for (let f = 0; f < 6; f++) {
    const data = new Uint8Array(N * N * 4);
    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        const sc = (2 * (col + 0.5)) / N - 1, tc = (2 * (row + 0.5)) / N - 1;
        const d = [[1, -tc, -sc], [-1, -tc, sc], [sc, 1, tc], [sc, -1, -tc], [sc, -tc, 1], [-sc, -tc, -1]][f];
        const y = d[1] / Math.hypot(d[0], d[1], d[2]);
        const c = y > 0 ? hor.map((h, k) => h + (sky[k] - h) * y ** 0.6) : hor.map((h, k) => h + (gnd[k] - h) * (-y) ** 0.4);
        const o = (row * N + col) * 4;
        data.set([c[0] * 255, c[1] * 255, c[2] * 255, 255], o);
      }
    }
    const t = new THREE.DataTexture(data, N, N);
    t.needsUpdate = true;
    faces.push(t);
  }
  const cube = new THREE.CubeTexture(faces);
  cube.colorSpace = THREE.SRGBColorSpace;
  cube.needsUpdate = true;
  return cube;
}

let shared: THREE.CubeTexture | null = null;

/** Gives `m` the shared sky cube as its own reflections (and remembers it for `ModernLook`). */
export function wearSkyCube(m: THREE.MeshStandardMaterial) {
  shared ??= skyCube();
  m.envMap = shared;
  m.userData.ownEnv = shared;
  return m;
}

/**
 * Reflections follow the daylight: before `mesh` draws, each material's reflection strength is its factor times the
 * scene's hemisphere light. A material whose cube was taken away (modern lighting on: the scene's environment lights
 * it) is left alone.
 */
export function followDaylight(mesh: THREE.Object3D, mats: [THREE.MeshStandardMaterial, number][]) {
  let hemi: THREE.HemisphereLight | null | undefined;
  mesh.onBeforeRender = (_r, scene) => {
    if (hemi === undefined) {
      hemi = null;
      scene.traverse((o) => { if (!hemi && o instanceof THREE.HemisphereLight) hemi = o; });
    }
    if (!hemi) return;
    const k = hemi.intensity * (hemi.color.r + hemi.color.g + hemi.color.b) / 3;
    for (const [m, f] of mats) if (m.envMap) m.envMapIntensity = f * k;
  };
}
