import { describe, expect, it } from 'vitest';
import {
  buildOrderTag,
  computeSendOrderScore,
  generatedPrEntryScore,
  ORDER_TAG_PREFIX,
  parseOrderTag,
} from './storybook-playground-order';

describe('computeSendOrderScore', () => {
  it('scores a more recently added file higher than an older one', () => {
    const older = computeSendOrderScore({
      addedAt: '2026-01-01T00:00:00Z',
      modifiedAt: '2026-01-01T00:00:00Z',
    });
    const newer = computeSendOrderScore({
      addedAt: '2026-09-01T00:00:00Z',
      modifiedAt: '2026-09-01T00:00:00Z',
    });
    expect(newer).toBeGreaterThan(older);
  });

  it('breaks a tie between two files added the same second by last-modified date', () => {
    const sameAdd = '2026-05-01T12:00:00Z';
    const editedLater = computeSendOrderScore({
      addedAt: sameAdd,
      modifiedAt: '2026-09-01T00:00:00Z',
    });
    const editedEarlier = computeSendOrderScore({
      addedAt: sameAdd,
      modifiedAt: '2026-05-02T00:00:00Z',
    });
    expect(editedLater).toBeGreaterThan(editedEarlier);
  });

  it('never lets a modified-date tie-break flip the order of two different added dates', () => {
    // Older file edited very recently must still score below a newer file
    // that has never been touched since it was added.
    const olderButRecentlyEdited = computeSendOrderScore({
      addedAt: '2026-01-01T00:00:00Z',
      modifiedAt: '2026-09-28T00:00:00Z',
    });
    const newerNeverEdited = computeSendOrderScore({
      addedAt: '2026-01-02T00:00:00Z',
      modifiedAt: '2026-01-02T00:00:00Z',
    });
    expect(newerNeverEdited).toBeGreaterThan(olderButRecentlyEdited);
  });

  it('scores a file git has no record of as 0 (sorts last)', () => {
    expect(computeSendOrderScore({ addedAt: undefined, modifiedAt: undefined })).toBe(0);
  });
});

describe('generatedPrEntryScore', () => {
  it('is always higher than any real send-order score, keeping PR entries on top', () => {
    const realScore = computeSendOrderScore({
      addedAt: '2026-09-28T00:00:00Z',
      modifiedAt: '2026-09-28T00:00:00Z',
    });
    expect(generatedPrEntryScore(0)).toBeGreaterThan(realScore);
    expect(generatedPrEntryScore(100)).toBeGreaterThan(realScore);
  });

  it('keeps entries generated earlier ahead of ones generated later', () => {
    expect(generatedPrEntryScore(0)).toBeGreaterThan(generatedPrEntryScore(1));
  });
});

describe('buildOrderTag / parseOrderTag', () => {
  it('round-trips a score through the tag string', () => {
    const tag = buildOrderTag(1234.5);
    expect(tag).toBe(`${ORDER_TAG_PREFIX}1234.5`);
    expect(parseOrderTag([tag])).toBe(1234.5);
  });

  it('returns undefined when no matching tag is present', () => {
    expect(parseOrderTag(['some-other-tag'])).toBeUndefined();
    expect(parseOrderTag(undefined)).toBeUndefined();
  });
});
