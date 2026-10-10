import { describe, expect, it } from 'vitest';
import { cleanNote, endorseVerdict, endorsementAttributes, endorsementsOf, withEndorsements } from './endorsement.ts';

const W1 = 'CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B';
const W2 = 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA';
const AT = '2026-10-10T03:00:00.000Z';

describe('cleanNote', () => {
  it('accepts no note', () => {
    expect(cleanNote(undefined)).toBeNull();
    expect(cleanNote(null)).toBeNull();
    expect(cleanNote('   ')).toBeNull();
  });

  it('keeps plain text, trims it and drops control characters', () => {
    expect(cleanNote('  Great   work\u0000\u0007 on the\nproject ')).toBe('Great work on the project');
    expect(cleanNote('<b onload=x>&"\'</b>')).toBe('<b onload=x>&"\'</b>');
  });

  it('accepts 140 characters and refuses 141 or a non-string', () => {
    expect(cleanNote('a'.repeat(140))).toHaveLength(140);
    expect(cleanNote('é'.repeat(140))).toHaveLength(140);
    expect(cleanNote('a'.repeat(141))).toBe(false);
    expect(cleanNote(42)).toBe(false);
    expect(cleanNote({ text: 'x' })).toBe(false);
  });
});

describe('endorsementsOf', () => {
  it('reads well-formed entries in slot order', () => {
    expect(endorsementsOf({ endorsements: [{ slot: 2, wallet: W2, at: AT }, { slot: 1, wallet: W1, at: AT }] })).toEqual([
      { slot: 1, wallet: W1, at: AT },
      { slot: 2, wallet: W2, at: AT },
    ]);
  });

  it('drops anything malformed: a shortened wallet, a slot out of range, a duplicate slot', () => {
    expect(endorsementsOf({})).toEqual([]);
    expect(endorsementsOf({ endorsements: 'x' })).toEqual([]);
    expect(endorsementsOf({ endorsements: [{ slot: 1, wallet: 'CPq4…Jq8B', at: AT }, { slot: 4, wallet: W1, at: AT }, { slot: 0, wallet: W1, at: AT }, null, { slot: 2, wallet: W1, at: 5 }] })).toEqual([]);
    expect(endorsementsOf({ endorsements: [{ slot: 1, wallet: W1, at: AT }, { slot: 1, wallet: W2, at: AT }] })).toEqual([{ slot: 1, wallet: W1, at: AT }]);
  });
});

describe('endorsementAttributes', () => {
  it('writes the FULL wallet and the time per slot, and nothing else', () => {
    const attributes = endorsementAttributes([{ slot: 1, wallet: W1, at: AT }, { slot: 3, wallet: W2, at: AT }]);
    expect(attributes).toEqual([
      { key: 'endorsed_by_1', value: W1 },
      { key: 'endorsed_at_1', value: AT },
      { key: 'endorsed_by_3', value: W2 },
      { key: 'endorsed_at_3', value: AT },
    ]);
    expect(attributes[0].value).toHaveLength(44);
  });
});

describe('withEndorsements', () => {
  it('puts the table of record back into the row and leaves an agreeing row alone', () => {
    const row = { state: { days_done: 2 } };
    const restored = withEndorsements(row, [{ slot: 1, wallet: W1, at: AT }]);
    expect(restored.state).toEqual({ days_done: 2, endorsements: [{ slot: 1, wallet: W1, at: AT }] });
    expect(withEndorsements(restored, [{ slot: 1, wallet: W1, at: AT }])).toBe(restored);
    expect(withEndorsements(row, [])).toBe(row);
  });

  it('removes a copy the table does not back', () => {
    const forged = { state: { endorsements: [{ slot: 1, wallet: W1, at: AT }] } };
    expect(withEndorsements(forged, []).state.endorsements).toEqual([]);
  });
});

describe('endorseVerdict', () => {
  it('gives the lowest free slot', () => {
    expect(endorseVerdict([], 'me')).toEqual({ action: 'endorse', slot: 1 });
    expect(endorseVerdict([{ instructor_user_id: 'a', slot: 1 }, { instructor_user_id: 'b', slot: 3 }], 'me')).toEqual({ action: 'endorse', slot: 2 });
  });

  it('is one per instructor per certification', () => {
    expect(endorseVerdict([{ instructor_user_id: 'me', slot: 2 }], 'me')).toEqual({ action: 'already', slot: 2 });
  });

  it('stops at three', () => {
    const three = [1, 2, 3].map((slot) => ({ instructor_user_id: `t${slot}`, slot }));
    expect(endorseVerdict(three, 'me')).toEqual({ action: 'full' });
    expect(endorseVerdict(three, 't2')).toEqual({ action: 'already', slot: 2 });
  });
});
