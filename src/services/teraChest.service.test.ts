import { describe, expect, it } from 'vitest';
import { chestVerifyPath, toChest, toChestList, toRecompute } from './teraChest.service';
import { WIRE_CHEST_COMMITTED, WIRE_CHEST_MINTED, WIRE_CHEST_ROLLING, WIRE_RECOMPUTE } from './teraChestMock';

describe('toChest', () => {
  it('reads a committed chest: the slot is on chain, nothing is rolled', () => {
    const chest = toChest(WIRE_CHEST_COMMITTED);
    expect(chest).toMatchObject({ id: 'chest_fixture_1', day: 3, trail: 'HTML', status: 'committed', seed: null, tier: null, tera: null, retryAfterMs: 1200 });
    expect(chest?.commit).toEqual({ slot: 418_220_113, tx: '5fixtureCommitSignature' });
    expect(chest?.odds).toHaveLength(6);
  });

  it('reads the Tera of a minted chest with its proof links', () => {
    const chest = toChest(WIRE_CHEST_MINTED);
    expect(chest?.status).toBe('minted');
    expect(chest?.tier).toBe('rare');
    expect(chest?.tera).toMatchObject({ key: 'base_lider', title: 'Tera, leader', tierName: 'Super Tera', pageUrl: '/c/FixtureTera11111111111111111111111111111111' });
    expect(chest?.seed?.blockhash).toBe(WIRE_CHEST_ROLLING.seed.blockhash);
  });

  it('does not call a chest minted when no Tera came with it', () => {
    expect(toChest({ ...WIRE_CHEST_MINTED, tera: null })?.status).toBe('rolling');
  });

  it('answers null for anything that is not a chest', () => {
    for (const v of [null, {}, { id: 'x' }, { id: 'x', status: 'opened' }, 'chest']) expect(toChest(v)).toBeNull();
  });
});

describe('toChestList', () => {
  it('is off unless the function says enabled', () => {
    for (const v of [null, {}, { chests: [WIRE_CHEST_MINTED] }, { enabled: false, chests: [WIRE_CHEST_MINTED] }]) expect(toChestList(v)).toEqual({ enabled: false, chests: [] });
    expect(toChestList({ enabled: true, chests: [WIRE_CHEST_MINTED, { broken: true }] }).chests).toHaveLength(1);
  });
});

describe('toRecompute', () => {
  it('keeps the formula, the inputs, the pool and the steps', () => {
    const r = toRecompute(WIRE_RECOMPUTE);
    expect(r?.formula).toContain('sha256');
    expect(r?.inputs.day).toBe(3);
    expect(r?.pool).toEqual(['base_lider', 'base_livre', 'base_natural']);
    expect(r?.steps).toHaveLength(3);
    expect(toRecompute({})).toBeNull();
  });
});

it('links a chest to the page where anyone rolls it again', () => {
  expect(chestVerifyPath('a b')).toBe('/verify?chest=a%20b#chest');
});
