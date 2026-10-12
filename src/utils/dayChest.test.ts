import { describe, expect, it } from 'vitest';
import { toChest } from '@/services/teraChest.service';
import { WIRE_CHEST_COMMITTED, WIRE_CHEST_FAILED, WIRE_CHEST_MINTED, WIRE_CHEST_ROLLING } from '@/services/teraChestMock';
import { CHEST_MAX_POLLS, chestPhase, chestPollMs } from './dayChest';

const committed = toChest(WIRE_CHEST_COMMITTED)!;
const rolling = toChest(WIRE_CHEST_ROLLING)!;
const minted = toChest(WIRE_CHEST_MINTED)!;
const failed = toChest(WIRE_CHEST_FAILED)!;

describe('chestPhase', () => {
  it('draws nothing while the feature is off, whatever the chest says', () => {
    for (const chest of [null, committed, minted]) expect(chestPhase({ featureOn: false, answered: true, chest })).toBeNull();
  });

  it('holds the row as "sealing" until the first answer, then follows the chest', () => {
    expect(chestPhase({ featureOn: true, answered: false, chest: null })).toBe('sealing');
    expect(chestPhase({ featureOn: true, answered: true, chest: committed })).toBe('committed');
    expect(chestPhase({ featureOn: true, answered: true, chest: rolling })).toBe('rolling');
    expect(chestPhase({ featureOn: true, answered: true, chest: minted })).toBe('revealed');
  });

  it('draws nothing for a day with no chest or a chest that failed', () => {
    expect(chestPhase({ featureOn: true, answered: true, chest: null })).toBeNull();
    expect(chestPhase({ featureOn: true, answered: true, chest: failed })).toBeNull();
  });
});

describe('chestPollMs', () => {
  it('asks again while the block is awaited, at the pace the server gives, within bounds', () => {
    expect(chestPollMs(committed, 1)).toBe(1200);
    expect(chestPollMs({ ...rolling, retryAfterMs: null }, 1)).toBe(1500);
    expect(chestPollMs({ ...committed, retryAfterMs: 10 }, 1)).toBe(600);
    expect(chestPollMs({ ...committed, retryAfterMs: 60_000 }, 1)).toBe(5000);
  });

  it('stops for a settled chest, no chest, or after the last poll', () => {
    expect(chestPollMs(minted, 1)).toBe(false);
    expect(chestPollMs(failed, 1)).toBe(false);
    expect(chestPollMs(null, 1)).toBe(false);
    expect(chestPollMs(committed, CHEST_MAX_POLLS)).toBe(false);
  });
});
