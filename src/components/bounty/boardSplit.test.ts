import { describe, expect, it } from 'vitest';
import type { BountyStatus } from '@/types/bounty';
import { splitBoard } from './boardSplit';

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
