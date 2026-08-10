/**
 * liveClassUX.test.ts — Unit tests for the 4 live-class UX fixes.
 *
 * All tests are pure-function / pure-data: no React rendering, no mocking of
 * network calls. This keeps them fast and avoids heavy vitest-jsdom setup.
 */
import { describe, it, expect } from 'vitest';
import { resources } from '@/i18n';

/* ── 1. LiveClassBlock navigation target ─────────────────────────────────── */

/**
 * Given a session and the current user id, compute which path the block
 * should navigate to.
 */
function liveBlockTarget(
  session: { id: string; instructorId: string },
  userId: string | null | undefined
): string {
  return session.instructorId === userId ? '/live/instructor' : `/live/${session.id}`;
}

describe('LiveClassBlock — navigation target', () => {
  const session = { id: 'sess-42', instructorId: 'user-instructor' };

  it('sends a student to /live/:id', () => {
    expect(liveBlockTarget(session, 'user-student')).toBe('/live/sess-42');
  });

  it('sends the instructor to /live/instructor', () => {
    expect(liveBlockTarget(session, 'user-instructor')).toBe('/live/instructor');
  });

  it('sends a null-userId user to /live/:id (student path)', () => {
    expect(liveBlockTarget(session, null)).toBe('/live/sess-42');
  });

  it('sends an undefined-userId user to /live/:id (student path)', () => {
    expect(liveBlockTarget(session, undefined)).toBe('/live/sess-42');
  });
});

/* ── 2. Instructor recovery (LiveSessionPage redirect guard) ─────────────── */

/**
 * Should the LiveSessionPage redirect to /live/instructor?
 * Mirrors the useEffect condition in LiveSessionPage.tsx.
 */
function shouldRedirectToInstructor(
  session: { instructorId: string } | null | undefined,
  userId: string | null | undefined
): boolean {
  return Boolean(session && userId && session.instructorId === userId);
}

describe('Instructor recovery — redirect guard', () => {
  const session = { instructorId: 'user-instructor' };

  it('returns false when session is null', () => {
    expect(shouldRedirectToInstructor(null, 'user-instructor')).toBe(false);
  });

  it('returns false when userId is null', () => {
    expect(shouldRedirectToInstructor(session, null)).toBe(false);
  });

  it('returns false when userId does not match instructorId', () => {
    expect(shouldRedirectToInstructor(session, 'user-student')).toBe(false);
  });

  it('returns true when userId matches instructorId', () => {
    expect(shouldRedirectToInstructor(session, 'user-instructor')).toBe(true);
  });
});

/* ── 3. View-as-student removed from i18n ────────────────────────────────── */

describe('View-as-student key removed from i18n', () => {
  it('live.instructor.preview is absent from PT translations', () => {
    expect(resources.pt['live.instructor.preview']).toBeUndefined();
  });

  it('live.instructor.preview is absent from EN translations', () => {
    expect(resources.en['live.instructor.preview']).toBeUndefined();
  });

  // The instructor stage now mirrors the learner screen (no framed "preview"),
  // so these keys were retired — assert they don't creep back.
  const retired = [
    'live.instructor.preview.label',
    'live.instructor.control.notStarted',
    'live.instructor.control.activity',
  ] as const;
  for (const key of retired) {
    it(`${key} is absent from both locales`, () => {
      expect(resources.pt[key]).toBeUndefined();
      expect(resources.en[key]).toBeUndefined();
    });
  }
});

/* ── 4. New live.block.* keys present in both locales ───────────────────── */

describe('New live.block.* keys in i18n', () => {
  const keys = ['live.block.subtitle', 'live.block.joinCta', 'live.block.returnCta'] as const;

  for (const key of keys) {
    it(`PT has ${key}`, () => {
      expect(resources.pt[key]).toBeTruthy();
    });

    it(`EN has ${key}`, () => {
      expect(resources.en[key]).toBeTruthy();
    });
  }
});

/* ── 5. Reopen label (ADR-1) ─────────────────────────────────────────────── */

describe('live.answer.reopen in i18n', () => {
  it('is present in both locales', () => {
    expect(resources.pt['live.answer.reopen']).toBeTruthy();
    expect(resources.en['live.answer.reopen']).toBeTruthy();
  });

  it('matches the in-activity label for the same affordance', () => {
    // Same button, two surfaces (the activity's own retry and the live page's
    // reopen). Divergent wording read as two different features to the learner.
    expect(resources.pt['live.answer.reopen']).toBe(resources.pt['code.checks.editAgain']);
    expect(resources.en['live.answer.reopen']).toBe(resources.en['code.checks.editAgain']);
  });
});
