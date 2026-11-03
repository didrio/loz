import * as THREE from 'three';
import { RAPIER } from '../core/physics';
import type { Game } from './game';

/**
 * Developer overlay, on with `?debug` in the URL: frame rate, draw calls, position, mode.
 * Backslash (\) toggles a wireframe of the physics colliders (terrain excluded).
 */
export class Debug {
  private frames = 0;
  private acc = 0;
  private fps = 0;
  private showColliders = false;
  private lines: THREE.LineSegments | null = null;
  private refresh = 0;

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
}
