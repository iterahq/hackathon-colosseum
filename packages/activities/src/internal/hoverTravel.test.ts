import { describe, expect, it } from 'vitest';
import { distanceToRect, isInside, travelKeepsOpen } from './hoverTravel.js';

const target = { left: 1000, top: 100, width: 32, height: 32 };

describe('travelKeepsOpen', () => {
  it('keeps the preview while every sample gets closer to the switch', () => {
    expect(travelKeepsOpen({ x: 600, y: 500 }, { x: 700, y: 400 }, target)).toBe(true);
    expect(travelKeepsOpen({ x: 700, y: 400 }, { x: 900, y: 200 }, target)).toBe(true);
  });

  it('closes the moment a sample moves away from it', () => {
    expect(travelKeepsOpen({ x: 700, y: 400 }, { x: 600, y: 500 }, target)).toBe(false);
    expect(travelKeepsOpen({ x: 700, y: 400 }, { x: 700, y: 430 }, target)).toBe(false);
  });

  it('forgives a few px of jitter on the way', () => {
    expect(travelKeepsOpen({ x: 700, y: 400 }, { x: 698, y: 403 }, target)).toBe(true);
  });

  it('stays open on or just around the switch itself, whatever came before', () => {
    expect(travelKeepsOpen({ x: 0, y: 0 }, { x: 1010, y: 110 }, target)).toBe(true);
    expect(travelKeepsOpen({ x: 1010, y: 110 }, { x: 1036, y: 96 }, target)).toBe(true);
  });

  it('trusts the first sample after leaving', () => {
    expect(travelKeepsOpen(null, { x: 10, y: 10 }, target)).toBe(true);
  });
});

describe('geometry', () => {
  it('measures distance to the nearest edge and zero inside', () => {
    expect(distanceToRect({ x: 1016, y: 116 }, target)).toBe(0);
    expect(distanceToRect({ x: 1016, y: 50 }, target)).toBe(50);
    expect(distanceToRect({ x: 1062, y: 172 }, target)).toBeCloseTo(Math.hypot(30, 40));
    expect(isInside({ x: 995, y: 95 }, target)).toBe(false);
    expect(isInside({ x: 995, y: 95 }, target, 8)).toBe(true);
  });
});
