import { describe, expect, it } from 'vitest';
import { evidenceShare, nodeTier, parseShare, tierCounts, tierOf } from '@/components/graph/evidenceTier';
import type { CapabilityNode } from '@/types/learnerProfile';

const node = (id: string, graded: string | null | undefined, proven = true): CapabilityNode => ({
  id, trail: 0, day: 1, title: id, requires: [], status: proven ? 'verified' : 'open',
  proof: proven ? { asset: 'A', attribute: `claim:${id}`, onchainValue: null, evidenceHash: 'h', txSignature: null, provenAt: null, assetExplorerUrl: null, txExplorerUrl: null, graded } : null,
});

describe('parseShare', () => {
  it('reads a share and folds legacy completions into the total', () => {
    expect(parseShare('10/12')).toEqual({ graded: 10, total: 12 });
    expect(parseShare('2/2 +14 legacy')).toEqual({ graded: 2, total: 16 });
    expect(parseShare('0/0')).toEqual({ graded: 0, total: 0 });
  });

  it('refuses anything that is not a share', () => {
    for (const bad of [null, undefined, '', '12', '13/12', '10/12 extra', '-1/2', '1e2/200', '10 / 12']) expect(parseShare(bad)).toBeNull();
  });
});

describe('tierOf', () => {
  it('is top only when the server graded every answer', () => {
    expect(tierOf({ graded: 12, total: 12 })).toBe('top');
    expect(tierOf(parseShare('2/2 +14 legacy'))).toBe('middle');
    expect(tierOf({ graded: 10, total: 12 })).toBe('middle');
    expect(tierOf({ graded: 1, total: 12 })).toBe('middle');
  });

  it('is base when the server graded none, or the evidence states no share', () => {
    expect(tierOf({ graded: 0, total: 12 })).toBe('base');
    expect(tierOf({ graded: 0, total: 0 })).toBe('base');
    expect(tierOf(null)).toBe('base');
  });
});

describe('evidenceShare', () => {
  it('trusts only a version 2 document', () => {
    expect(evidenceShare(JSON.stringify({ v: 2, verified: '10/12', activities: [] }))).toEqual({ graded: 10, total: 12 });
    expect(evidenceShare(JSON.stringify({ v: 1, verified: '12/12' }))).toBeNull();
    expect(evidenceShare(JSON.stringify({ v: 2, verified: 12 }))).toBeNull();
    expect(evidenceShare('{broken')).toBeNull();
  });
});

describe('tiers of a graph', () => {
  it('gives a proven node a tier and an unproven one none', () => {
    expect(nodeTier(node('a', '12/12'))).toBe('top');
    expect(nodeTier(node('b', '10/12'))).toBe('middle');
    expect(nodeTier(node('c', null))).toBe('base');
    expect(nodeTier(node('d', undefined))).toBeNull();
    expect(nodeTier(node('e', '12/12', false))).toBeNull();
  });

  it('counts proven nodes per tier, and nothing when no node states a share', () => {
    expect(tierCounts([node('a', '12/12'), node('b', '10/12'), node('c', '10/12'), node('d', null), node('e', null, false)])).toEqual({ top: 1, middle: 2, base: 1 });
    expect(tierCounts([node('a', undefined), node('e', null, false)])).toBeNull();
  });
});
