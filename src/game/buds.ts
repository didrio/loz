import * as THREE from 'three';
import type { Area } from '../world/area';
import type { Game } from './game';
import { BUD, Murmurbud } from './murmurbud';

/** How close Wren must be for a stirred bud's gauge to show. */
const GAUGE_RANGE = 9;

/** What the HUD's bud gauge draws. */
export interface BudGaugeView {
  gauge: number;
  band: number;
  overloaded: boolean;
}

/**
 * The Murmurbuds in play: runs each bud's rule (`murmurbud.ts`) on the area's bud looks, plays
 * its sounds and feeds the floating gauge. An opened bud's note floats until Wren reads it: an
 * interactable with the bud's id (`bud.<hint>`), whose content script reads and takes it.
 */
export class BudSystem {
  private area: Area | null = null;
  private rules = new Map<string, Murmurbud>();

  constructor(private readonly game: Game) {}

  /** One frame of play. */
  update(dt: number) {
    const { area } = this.game;
    if (area !== this.area) this.attach(area);
    if (!area.buds) return;
    for (const [id, rule] of this.rules) {
      const look = area.buds.get(id)!;
      if (look.opened) continue;
      if (rule.update(dt)) this.opened(id);
      else look.setGrowth(rule.growth);
    }
  }

  /** A bud's rule, by id (smoke tests, the console). */
  rule(id: string): Readonly<Murmurbud> | undefined {
    return this.rules.get(id);
  }

  /** The gauge for the nearest stirred bud near Wren, and where it floats on screen; null to hide it. */
  gauge(): { view: BudGaugeView; at: { x: number; y: number } } | null {
    const { area, player } = this.game;
    if (!area.buds || this.game.mode !== 'play') return null;
    let best: string | null = null, bestD = GAUGE_RANGE;
    for (const [id, rule] of this.rules) {
      const look = area.buds.get(id)!;
      const d = Math.hypot(look.x - player.pos.x, look.z - player.pos.z);
      if (rule.awake && d < bestD) [best, bestD] = [id, d];
    }
    if (!best) return null;
    const look = area.buds.get(best)!, rule = this.rules.get(best)!;
    const at = this.game.toScreen(look.center.add(new THREE.Vector3(0, 1.1, 0)));
    if (at) at.x += 64; // beside the wisp rising from its tip, not across it
    return at && { view: { gauge: rule.gauge, band: BUD.band, overloaded: rule.sulk > 0 }, at };
  }

  private attach(area: Area) {
    this.area = area;
    this.rules.clear();
    if (!area.buds) return;
    for (const id of area.buds.keys()) this.rules.set(id, new Murmurbud());
    area.onBudStrike = (id) => this.strike(id);
  }

  private strike(id: string) {
    const rule = this.rules.get(id);
    const look = this.game.area.buds?.get(id);
    if (!rule || !look || look.opened) return;
    const { sfx, particles, hud } = this.game;
    const result = rule.strike();
    if (result === 'grew') {
      sfx.budTap(rule.growth);
      particles.burst(look.center, 0xb9c2a8, 5, 3, 0.35);
    } else if (result === 'overload') {
      sfx.nuhUh();
      look.sulk();
      look.setGrowth(0);
      hud.flashBudGauge();
    }
  }

  private opened(id: string) {
    const look = this.game.area.buds!.get(id)!;
    look.open();
    this.game.sfx.budOpen();
    this.game.particles.burst(look.center, 0xffe8a8, 18, 4, 0.9, false);
  }
}
