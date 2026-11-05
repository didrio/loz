import { describe, expect, it } from 'vitest';
import { STICK_RADIUS, TouchPad } from './touch';

describe('TouchPad', () => {
  it('the stick reads full tilt at its radius, zero at rest, in pad convention', () => {
    const pad = new TouchPad();
    pad.down(1, 100, 300, { kind: 'stick' });
    expect(pad.stick).toEqual({ x: 0, y: 0 });
    pad.move(1, 100, 300 - STICK_RADIUS); // thumb up = forward = y negative, like a gamepad
    expect(pad.stick.x).toBeCloseTo(0);
    expect(pad.stick.y).toBeCloseTo(-1);
    pad.move(1, 103, 300); // a resting thumb's drift
    expect(pad.stick).toEqual({ x: 0, y: 0 });
  });

  it('the stick centre follows a thumb that slides past the rim', () => {
    const pad = new TouchPad();
    pad.down(1, 100, 300, { kind: 'stick' });
    pad.move(1, 100 + STICK_RADIUS * 3, 300);
    expect(pad.stick.x).toBeCloseTo(1);
    pad.move(1, 100 + STICK_RADIUS * 2, 300); // back by one radius: now centred, not still full right
    expect(pad.stick).toEqual({ x: 0, y: 0 });
  });

  it('a button holds while down and presses only on the frame it lands', () => {
    const pad = new TouchPad();
    pad.down(2, 700, 300, { kind: 'button', actions: ['attack'] });
    expect(pad.pressed('attack')).toBe(true);
    expect(pad.held('attack')).toBe(true);
    pad.endFrame();
    expect(pad.pressed('attack')).toBe(false);
    expect(pad.held('attack')).toBe(true);
    pad.up(2);
    expect(pad.held('attack')).toBe(false);
  });

  it('a finger keeps its job when it slides off its button', () => {
    const pad = new TouchPad();
    pad.down(2, 700, 300, { kind: 'button', actions: ['shield'] });
    pad.move(2, 200, 100);
    expect(pad.held('shield')).toBe(true);
    expect(pad.stick).toEqual({ x: 0, y: 0 });
  });

  it('two fingers on one action: it stays held until both lift', () => {
    const pad = new TouchPad();
    pad.down(1, 0, 0, { kind: 'button', actions: ['jump', 'interact'] });
    pad.down(2, 0, 0, { kind: 'button', actions: ['jump'] });
    pad.up(1);
    expect(pad.held('jump')).toBe(true);
    expect(pad.held('interact')).toBe(false);
    pad.up(2);
    expect(pad.held('jump')).toBe(false);
  });

  it('look drags add up until the frame ends', () => {
    const pad = new TouchPad();
    pad.down(4, 600, 200, { kind: 'look' });
    pad.move(4, 610, 205);
    pad.move(4, 630, 195);
    expect(pad.look).toEqual({ x: 30, y: -5 });
    pad.endFrame();
    expect(pad.look).toEqual({ x: 0, y: 0 });
  });

  it('a held Shield finger turns the camera only while buttonLooks is on', () => {
    const pad = new TouchPad();
    pad.down(1, 500, 300, { kind: 'button', actions: ['shield'] });
    pad.move(1, 510, 300);
    expect(pad.look).toEqual({ x: 0, y: 0 });
    pad.buttonLooks = true;
    pad.move(1, 530, 290);
    expect(pad.look).toEqual({ x: 20, y: -10 });
    expect(pad.held('shield')).toBe(true);
    pad.down(2, 600, 300, { kind: 'button', actions: ['attack'] });
    pad.move(2, 640, 300);
    expect(pad.look).toEqual({ x: 20, y: -10 });
  });

  it('clear lifts everything', () => {
    const pad = new TouchPad();
    pad.down(1, 0, 0, { kind: 'button', actions: ['shield'] });
    pad.down(2, 0, 0, { kind: 'stick' });
    pad.move(2, 50, 0);
    pad.clear();
    expect(pad.held('shield')).toBe(false);
    expect(pad.stick).toEqual({ x: 0, y: 0 });
  });
});
