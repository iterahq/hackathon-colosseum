import { describe, expect, it } from 'vitest';
import { boardTabOf, defaultTab, rewardTier, splitBoard } from './bountyBoard';
import type { Bounty, BountyStatus } from '@/types/bounty';

const make = (id: string, status: BountyStatus, judge = false): Bounty => ({ id, status, judge: judge ? { checks: [], codeMax: 1 } : null }) as unknown as Bounty;

describe('boardTabOf', () => {
  it('maps every status to one tab', () => {
    expect(boardTabOf('open')).toBe('open');
    expect((['claimed', 'submitted', 'paying'] as const).map(boardTabOf)).toEqual(['progress', 'progress', 'progress']);
    expect((['paid', 'awaiting_funding', 'expired', 'refunding', 'refunded'] as const).map(boardTabOf)).toEqual(['history', 'history', 'history', 'history', 'history']);
  });
});

describe('splitBoard', () => {
  it('takes the first open judge bounty out of the tabs', () => {
    const items = [make('a', 'open'), make('b', 'open', true), make('c', 'open', true)];
    const { featured, tabs } = splitBoard(items);
    expect(featured?.id).toBe('b');
    expect(tabs.open.map((b) => b.id)).toEqual(['a', 'c']);
  });
  it('does not feature a judge bounty that is not open', () => {
    const { featured, tabs } = splitBoard([make('a', 'paid', true)]);
    expect(featured).toBeNull();
    expect(tabs.history.map((b) => b.id)).toEqual(['a']);
  });
  it('orders history with paid first', () => {
    const { tabs } = splitBoard([make('x', 'expired'), make('p', 'paid'), make('r', 'refunded')]);
    expect(tabs.history.map((b) => b.id)).toEqual(['p', 'x', 'r']);
  });
  it('groups held bounties under progress', () => {
    const { tabs } = splitBoard([make('a', 'claimed'), make('b', 'paying'), make('c', 'open')]);
    expect(tabs.progress.map((b) => b.id)).toEqual(['a', 'b']);
  });
});

describe('defaultTab', () => {
  it('prefers open and falls back to the first non-empty tab', () => {
    expect(defaultTab({ open: [1], progress: [1], history: [] })).toBe('open');
    expect(defaultTab({ open: [], progress: [], history: [1] })).toBe('history');
    expect(defaultTab({ open: [], progress: [1], history: [1] })).toBe('progress');
    expect(defaultTab({ open: [], progress: [], history: [] })).toBe('open');
  });
});

describe('rewardTier', () => {
  it('cuts at the thresholds', () => {
    expect(rewardTier(19_999_999)).toBe('common');
    expect(rewardTier(20_000_000)).toBe('rare');
    expect(rewardTier(59_999_999)).toBe('rare');
    expect(rewardTier(60_000_000)).toBe('epic');
    expect(rewardTier(99_999_999)).toBe('epic');
    expect(rewardTier(100_000_000)).toBe('legendary');
  });
});
