import { describe, expect, it } from 'vitest';
import type { Capabilities, CapabilityNode } from '@/types/learnerProfile';
import { claimsOfTrail, trailOf } from './CertificationClaims';

const node = (id: string, trail: number, status: CapabilityNode['status'], requires: string[] = []): CapabilityNode => ({ id, trail, day: 1, title: id, requires, status, proof: null });
const caps: Capabilities = {
  program: 'itera-v2', version: 1, total: 4, verifiedCount: 2, next: 'c',
  trails: [{ trail: 0, title: 'Week 1 · HTML' }, { trail: 1, title: 'Week 2 · CSS' }],
  nodes: [node('a', 0, 'verified'), node('b', 0, 'open', ['a']), node('c', 1, 'verified', ['a']), node('d', 1, 'open', ['c', 'b'])],
};

describe('trailOf', () => {
  it('finds the trail by the name the list shows', () => {
    expect(trailOf(caps, 'CSS', 0)).toBe(1);
    expect(trailOf(caps, 'html', 1)).toBe(0);
  });
  it('falls back to the position when no name matches', () => {
    expect(trailOf(caps, 'Estilos', 1)).toBe(1);
    expect(trailOf(caps, 'Estilos', 7)).toBeNull();
  });
});

describe('claimsOfTrail', () => {
  it('keeps one trail, recounts it and drops prerequisites from other trails', () => {
    const css = claimsOfTrail(caps, 1);
    expect(css.trails).toEqual([{ trail: 1, title: 'Week 2 · CSS' }]);
    expect(css.nodes.map((n) => n.id)).toEqual(['c', 'd']);
    expect(css.nodes.map((n) => n.requires)).toEqual([[], ['c']]);
    expect(css.total).toBe(2);
    expect(css.verifiedCount).toBe(1);
    expect(css.next).toBe('c');
  });
  it('forgets a next claim that belongs to another trail', () => {
    expect(claimsOfTrail(caps, 0).next).toBeNull();
  });
});
