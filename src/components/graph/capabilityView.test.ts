import { describe, expect, it } from 'vitest';
import { chainTargets, nextNode, nodeView, provenCount, trailProgress, viewsOf, type ChainState } from '@/components/graph/capabilityView';
import type { AssetRead } from '@/lib/chainClaims';
import type { Capabilities, CapabilityNode } from '@/types/learnerProfile';

const HASH = 'abcd1234'.padEnd(64, '0');
const node = (id: string, status: CapabilityNode['status'], over: Partial<CapabilityNode> = {}): CapabilityNode => ({
  id, trail: 0, day: 1, title: id, requires: [], status,
  proof: status === 'open' ? null : { asset: 'A1', attribute: `claim:${id}`, onchainValue: 'abcd1234', evidenceHash: HASH, txSignature: 's', provenAt: null, assetExplorerUrl: null, txExplorerUrl: null },
  ...over,
});
const caps = (nodes: CapabilityNode[], next: string | null = null): Capabilities => ({ program: 'p', version: 1, total: nodes.length, verifiedCount: 0, next, trails: [], nodes });
const done = (claims: Record<string, string>): ChainState => ({ phase: 'done', reads: { A1: { status: 'ok', claims } as AssetRead } });

describe('nodeView', () => {
  it('open and recorded never depend on the chain', () => {
    expect(nodeView(node('a', 'open'), { phase: 'pending' })).toBe('open');
    expect(nodeView(node('a', 'recorded'), done({}))).toBe('recorded');
  });
  it('a server-verified node is only "chain" after the browser found a prefix match', () => {
    const n = node('a', 'verified');
    expect(nodeView(n, { phase: 'pending' })).toBe('checking');
    expect(nodeView(n, { phase: 'error' })).toBe('server');
    expect(nodeView(n, done({ 'claim:a': 'abcd1234' }))).toBe('chain');
    expect(nodeView(n, done({ 'claim:a': 'ffff' }))).toBe('unconfirmed');
    expect(nodeView(n, done({}))).toBe('unconfirmed');
    expect(nodeView(n, { phase: 'done', reads: { A1: { status: 'wrong-owner' } } })).toBe('unconfirmed');
    expect(nodeView(node('a', 'verified', { proof: null }), done({}))).toBe('unconfirmed');
  });
});

describe('counts and targets', () => {
  const c = caps([node('a', 'verified'), node('b', 'verified'), node('c', 'recorded'), node('d', 'open')], 'd');
  it('counts only browser-confirmed nodes once the read finished', () => {
    const chain = done({ 'claim:a': 'abcd1234' });
    expect(provenCount(viewsOf(c, chain), chain)).toBe(1);
    expect(provenCount(viewsOf(c, { phase: 'pending' }), { phase: 'pending' })).toBe(2);
    expect(provenCount(viewsOf(c, { phase: 'error' }), { phase: 'error' })).toBe(2);
  });
  it('groups attributes per asset for the single read', () => {
    expect(chainTargets(c)).toEqual([{ asset: 'A1', attributes: ['claim:a', 'claim:b'] }]);
    expect(chainTargets(null)).toEqual([]);
  });
  it('tallies per trail and finds the next node', () => {
    const chain = done({ 'claim:a': 'abcd1234' });
    expect(trailProgress(c, viewsOf(c, chain))[0]).toEqual({ proven: 1, total: 4 });
    expect(nextNode(c)?.id).toBe('d');
    expect(nextNode(caps([node('a', 'open')]))).toBeNull();
  });
});
