import { describe, it, expect } from 'vitest';
import { seededShuffle } from './seededShuffle';

describe('seededShuffle', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('is deterministic for the same seed', () => {
    expect(seededShuffle(items, 'user1:act1')).toEqual(seededShuffle(items, 'user1:act1'));
  });

  it('differs across seeds (most of the time)', () => {
    const a = seededShuffle(items, 'user1:act1').join('');
    const b = seededShuffle(items, 'user2:act1').join('');
    expect(a).not.toEqual(b);
  });

  it('preserves the exact set of items', () => {
    expect([...seededShuffle(items, 'x')].sort()).toEqual([...items].sort());
  });

  it('does not mutate the input', () => {
    const copy = [...items];
    seededShuffle(items, 'x');
    expect(items).toEqual(copy);
  });

  it('handles empty and single-element arrays', () => {
    expect(seededShuffle([], 's')).toEqual([]);
    expect(seededShuffle(['only'], 's')).toEqual(['only']);
  });
});
