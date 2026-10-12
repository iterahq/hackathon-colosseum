import { beforeEach, describe, expect, it } from 'vitest';
import { toChest } from '@/services/teraChest.service';
import { WIRE_CHEST_COMMITTED, WIRE_CHEST_FAILED, WIRE_CHEST_MINTED } from '@/services/teraChestMock';
import { markChestsSeen, unseenChests } from './chestSeen';

const chest = (wire: Record<string, unknown>, id: string) => toChest({ ...wire, id })!;

describe('chests nobody saw', () => {
  beforeEach(() => localStorage.clear());

  it('lists open and opening chests, never a failed one', () => {
    const list = [chest(WIRE_CHEST_MINTED, 'a'), chest(WIRE_CHEST_COMMITTED, 'b'), chest(WIRE_CHEST_FAILED, 'c')];
    expect(unseenChests(list).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('forgets a chest once it was shown, and keeps the others', () => {
    const list = [chest(WIRE_CHEST_MINTED, 'a'), chest(WIRE_CHEST_MINTED, 'b')];
    markChestsSeen(['a']);
    expect(unseenChests(list).map((c) => c.id)).toEqual(['b']);
    markChestsSeen(['b', 'a']);
    expect(unseenChests(list)).toEqual([]);
  });

  it('stores ids only, and survives a storage that holds something else', () => {
    localStorage.setItem('itera.chest.seen.v1', '{"not":"a list"}');
    expect(unseenChests([chest(WIRE_CHEST_MINTED, 'a')])).toHaveLength(1);
    markChestsSeen(['a']);
    expect(JSON.parse(localStorage.getItem('itera.chest.seen.v1') ?? '[]')).toEqual(['a']);
  });
});
