/**
 * Locale must stay part of every content query key.
 *
 * The service layer collapses bilingual `{ pt, en }` bags into plain strings
 * while mapping a row, so a cached content entry is language-specific and cannot
 * be re-resolved after the fact. If these keys ever stop varying by locale, an
 * English learner silently keeps whichever language was cached first — which is
 * exactly the regression these tests exist to catch.
 */
import { describe, expect, it } from 'vitest';
import { queryKeys } from './queryKeys';

describe('queryKeys — locale is a cache dimension for authored content', () => {
  it('lesson.byId differs between pt and en', () => {
    expect(queryKeys.lesson.byId('L1', 'pt')).not.toEqual(queryKeys.lesson.byId('L1', 'en'));
  });

  it('lesson.byGuestCode differs between pt and en', () => {
    expect(queryKeys.lesson.byGuestCode('CODE', 'pt')).not.toEqual(
      queryKeys.lesson.byGuestCode('CODE', 'en')
    );
  });

  it('programs.bySlug differs between pt and en', () => {
    expect(queryKeys.programs.bySlug('p', 'pt')).not.toEqual(queryKeys.programs.bySlug('p', 'en'));
  });

  it('author.unitCanvas and author.activityTest differ between pt and en', () => {
    expect(queryKeys.author.unitCanvas('u', 'pt')).not.toEqual(
      queryKeys.author.unitCanvas('u', 'en')
    );
    expect(queryKeys.author.activityTest('a', 'pt')).not.toEqual(
      queryKeys.author.activityTest('a', 'en')
    );
  });

  it('the same locale yields a stable key (no cache miss per render)', () => {
    expect(queryKeys.lesson.byId('L1', 'en')).toEqual(queryKeys.lesson.byId('L1', 'en'));
  });

  it('unitCanvasAll is a locale-agnostic PREFIX of unitCanvas, so invalidation drops every language', () => {
    const prefix = queryKeys.author.unitCanvasAll('u');
    for (const locale of ['pt', 'en']) {
      const full = queryKeys.author.unitCanvas('u', locale);
      // react-query matches by prefix: every element of the prefix must be the
      // head of the full key, and the full key must be strictly longer.
      expect(full.slice(0, prefix.length)).toEqual([...prefix]);
      expect(full.length).toBeGreaterThan(prefix.length);
    }
  });

  it('keys that carry no authored content stay locale-free', () => {
    // Guards against a blanket "add locale everywhere" refactor: keying a
    // user-scoped or structural query by locale would double its cache for no
    // reason and mask a real invalidation bug.
    expect(queryKeys.user.stats).toEqual(['user', 'stats']);
    expect(queryKeys.lesson.next('L1')).toEqual(['lesson', 'L1', 'next']);
  });
});
