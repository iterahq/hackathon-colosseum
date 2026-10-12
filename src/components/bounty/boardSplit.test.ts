import { describe, expect, it } from 'vitest';
import type { BountyStatus } from '@/types/bounty';
import { boardTier, splitBoard } from './boardSplit';

const b = (id: string, status: BountyStatus, rehearsal = false) => ({ id, status, rehearsal });

describe('splitBoard', () => {
  it('keeps what can be taken or is in progress and folds what is over, in order', () => {
    const { live, closed } = splitBoard([b('a', 'open'), b('b', 'paid'), b('c', 'claimed'), b('d', 'refunded'), b('e', 'submitted'), b('f', 'expired'), b('g', 'paying'), b('h', 'refunding'), b('i', 'awaiting_funding')]);
    expect(live.map((x) => x.id)).toEqual(['a', 'c', 'e', 'g']);
    expect(closed.map((x) => x.id)).toEqual(['b', 'd', 'f', 'h', 'i']);
  });

  it('folds a team rehearsal whatever its status', () => {
    const { live, closed } = splitBoard([b('a', 'open', true), b('b', 'open')]);
    expect(live.map((x) => x.id)).toEqual(['b']);
    expect(closed.map((x) => x.id)).toEqual(['a']);
  });

  it('answers two empty lists for an empty board', () => {
    expect(splitBoard([])).toEqual({ live: [], closed: [] });
  });
});

describe('the order of the live missions', () => {
  const team = (id: string, rewardLamports: number, status: BountyStatus = 'open') => ({ id, status, rehearsal: false, rewardLamports, title: `Mission ${id}`, judge: null, postedBy: { kind: 'team' as const } });
  const sponsor = (id: string, rewardLamports: number) => ({ id, status: 'open' as BountyStatus, rehearsal: false, rewardLamports, title: `Landing page ${id}`, judge: null, postedBy: { kind: 'wallet' as const } });
  const judgeOwn = (id: string) => ({ id, status: 'open' as BountyStatus, rehearsal: false, rewardLamports: 10_000_000, title: 'Judge bounty: your first page', judge: { checks: [], codeMax: 1 }, postedBy: { kind: 'team' as const } });
  const judgeTest = (id: string, rewardLamports = 10_000_000) => ({ id, status: 'open' as BountyStatus, rehearsal: false, rewardLamports, title: `Judge test: page ${id}`, judge: null, postedBy: { kind: 'wallet' as const } });
  const order = (items: Array<{ id: string }>) => splitBoard(items as never[]).live.map((x: { id: string }) => x.id);

  it('leads with real missions by reward, then the judge mission, then the testers cards', () => {
    expect(order([judgeTest('t1', 900_000_000), judgeOwn('j'), team('a', 30_000_000), sponsor('s', 80_000_000), judgeTest('t2'), team('b', 120_000_000)])).toEqual(['b', 's', 'a', 'j', 't1', 't2']);
  });

  it('keeps the given order inside a tie and puts a held mission after every open one', () => {
    expect(order([team('a', 30_000_000), team('b', 30_000_000), team('held', 500_000_000, 'claimed'), judgeTest('t')])).toEqual(['a', 'b', 't', 'held']);
  });

  it('tells a tester card only by a wallet poster and a title that starts with Judge test', () => {
    expect(boardTier(judgeTest('x'))).toBe(2);
    expect(boardTier({ ...judgeTest('x'), postedBy: { kind: 'team' } })).toBe(0);
    expect(boardTier({ ...sponsor('x', 1), title: 'A page for a judge test lab' })).toBe(0);
    expect(boardTier(judgeOwn('j'))).toBe(1);
  });
});
