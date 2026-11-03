import { describe, expect, it } from 'vitest';
import { nearestInteractable, type Interactable } from './area';

const thing = (id: string, x: number, z: number, more: Partial<Interactable> = {}): Interactable =>
  ({ id, x, z, r: 2, label: 'Look', enabled: () => true, ...more });

describe('nearestInteractable', () => {
  const at = { x: 0, y: 0, z: 0 };

  it('picks the nearest one in reach', () => {
    expect(nearestInteractable([thing('far', 1.5, 0), thing('near', 0, 1)], at)?.id).toBe('near');
  });

  it('skips ones out of their reach, switched off, or on another floor', () => {
    expect(nearestInteractable([thing('out', 3, 0)], at)).toBeNull();
    expect(nearestInteractable([thing('off', 1, 0, { enabled: () => false })], at)).toBeNull();
    expect(nearestInteractable([thing('above', 1, 0, { y: 6 })], at)).toBeNull();
    expect(nearestInteractable([thing('here', 1, 0, { y: 0.5 })], at)?.id).toBe('here');
  });
});
