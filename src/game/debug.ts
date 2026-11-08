import * as THREE from 'three';
import { RAPIER } from '../core/physics';
import type { Game } from './game';

/**
 * Developer overlay, on with `?debug` in the URL: frame rate, draw calls, position, mode.
 * Backslash (\) toggles a wireframe of the physics colliders (terrain excluded) and red rings round every live enemy's hurtboxes.
 */
export class Debug {
  private frames = 0;
  private acc = 0;
  private fps = 0;
  private showColliders = false;
  private lines: THREE.LineSegments | null = null;
  private refresh = 0;
  private hurt: THREE.LineSegments | null = null;

  constructor(private game: Game) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backslash') this.showColliders = !this.showColliders;
    });
  }

  update(dt: number) {
    const g = this.game;
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = Math.round(this.frames / this.acc);
      this.frames = 0;
      this.acc = 0;
    }
    const info = g.renderer.info.render;
    const p = g.player.pos;
    g.hud.setDebug(
      `${this.fps} fps · ${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris\n` +
      `mode ${g.mode} · area ${g.area.id} · enemies ${g.enemies.list.length}\n` +
      `pos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} · facing ${g.player.facing.toFixed(2)}\n` +
      `day ${g.state.day} ${g.state.hours.toFixed(2)}h · \` colliders ${this.showColliders ? 'on' : 'off'}`,
    );

    this.drawHurtboxes();
    this.refresh -= dt;
    if (!this.showColliders) {
      if (this.lines) this.lines.visible = false;
      return;
    }
    if (this.refresh > 0 && this.lines) return;
    this.refresh = 0.25;
    const { vertices, colors } = g.physics.world.debugRender(undefined, (c) => c.shapeType() !== RAPIER.ShapeType.TriMesh || c.vertices().length < 3000);
    if (!this.lines) {
      this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
      this.lines.renderOrder = 20;
      this.lines.frustumCulled = false;
      g.scene.add(this.lines);
    }
    this.lines.visible = true;
    this.lines.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    this.lines.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  }

  /** With the wireframe on: three rings (red) around every live enemy's hurtboxes, each frame (they move with the poses). */
  private drawHurtboxes() {
    if (!this.showColliders) {
      if (this.hurt) this.hurt.visible = false;
      return;
    }
    const pts: number[] = [];
    for (const e of this.game.enemies.list) {
      if (!e.alive) continue;
      for (const h of e.hurtboxes()) hurtboxRings(h.center, h.radius, pts);
    }
    if (!this.hurt) {
      this.hurt = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff4040, depthTest: false, transparent: true }));
      this.hurt.renderOrder = 21;
      this.hurt.frustumCulled = false;
      this.game.scene.add(this.hurt);
    }
    this.hurt.visible = true;
    this.hurt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }
}

/** Appends line segments for three rings (one per axis) around a sphere. */
export function hurtboxRings(c: THREE.Vector3, r: number, out: number[], segs = 16) {
  for (let axis = 0; axis < 3; axis++) {
    for (let i = 0; i < segs; i++) {
      for (const k of [i, i + 1]) {
        const a = (k / segs) * Math.PI * 2;
        const u = Math.cos(a) * r;
        const v = Math.sin(a) * r;
        out.push(c.x + (axis === 0 ? 0 : axis === 1 ? u : u), c.y + (axis === 0 ? u : axis === 1 ? 0 : v), c.z + (axis === 0 ? v : axis === 1 ? v : 0));
      }
    }
  }
}
