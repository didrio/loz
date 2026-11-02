import * as THREE from 'three';

/** A chunky extruded heart, centered on the origin (about 0.7 m wide at scale 1). */
export function heartGeometry(depth = 0.12) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.3);
  s.bezierCurveTo(-0.05, -0.2, -0.35, -0.05, -0.35, 0.12);
  s.bezierCurveTo(-0.35, 0.32, -0.08, 0.36, 0, 0.18);
  s.bezierCurveTo(0.08, 0.36, 0.35, 0.32, 0.35, 0.12);
  s.bezierCurveTo(0.35, -0.05, 0.05, -0.2, 0, -0.3);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.center();
  return g;
}

/** A soft additive glow ball, for flames, sparks and magic. */
export function glow(color: number, radius: number, opacity = 0.35) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 10),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
}
