import { describe, expect, it } from 'vitest';
import { claimVerdict, unlockLevelOf, unlockView } from './unlock.ts';

const LAUREL = { unlock: { level: 5 } };

describe('unlockLevelOf', () => {
  it('reads the level an item unlocks at', () => {
    expect(unlockLevelOf(LAUREL)).toBe(5);
  });

  it('is null for an item that is only sold or a malformed rule', () => {
    expect(unlockLevelOf({})).toBeNull();
    expect(unlockLevelOf(null)).toBeNull();
    expect(unlockLevelOf({ unlock: { level: '5' } })).toBeNull();
    expect(unlockLevelOf({ unlock: { level: 0 } })).toBeNull();
    expect(unlockLevelOf({ unlock: { level: 2.5 } })).toBeNull();
    expect(unlockLevelOf({ unlock: [5] })).toBeNull();
  });
});

describe('unlockView', () => {
  it('is locked below the level and unlocked from it on', () => {
    expect(unlockView(LAUREL, 3)).toEqual({ level: 5, current_level: 3, unlocked: false });
    expect(unlockView(LAUREL, 5)).toEqual({ level: 5, current_level: 5, unlocked: true });
    expect(unlockView(LAUREL, 9)).toEqual({ level: 5, current_level: 9, unlocked: true });
  });

  it('is locked with no level for a visitor', () => {
    expect(unlockView(LAUREL, null)).toEqual({ level: 5, current_level: null, unlocked: false });
  });

  it('is absent for an item without the rule', () => {
    expect(unlockView({ value: 'emerald' }, 9)).toBeNull();
  });
});

describe('claimVerdict', () => {
  const facts = { kind: 'outfit', effect: LAUREL, level: 5, owned: false };

  it('claims at the level', () => {
    expect(claimVerdict(facts)).toBe('claim');
  });

  it('refuses below the level', () => {
    expect(claimVerdict({ ...facts, level: 4 })).toBe('locked');
  });

  it('answers already_owned whichever way the item was obtained, even below the level', () => {
    expect(claimVerdict({ ...facts, owned: true })).toBe('already_owned');
    expect(claimVerdict({ ...facts, owned: true, level: 1 })).toBe('already_owned');
  });

  it('never gives away an item that has no unlock rule or is not an outfit', () => {
    expect(claimVerdict({ ...facts, effect: {} })).toBe('not_claimable');
    expect(claimVerdict({ ...facts, kind: 'life' })).toBe('not_claimable');
  });
});
