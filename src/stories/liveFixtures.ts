import type { ClassPresenceMember, ClassAnswerer, ClassRanking } from '@/types/liveClass';

/**
 * Shared sample data for the live-class component stories.
 *
 * `avatarUrl: null` is explicit on purpose: the live types model an avatar-less
 * learner as a present-but-null key (that is exactly what `useClassSession`
 * writes when presence carries no `avatar_url`), so the fixtures mirror the
 * real payload instead of omitting the property.
 */

export const sampleRoster: ClassPresenceMember[] = [
  { userId: 'prof', name: 'Prof. Tainan', avatarUrl: null, isInstructor: true },
  { userId: 'a', name: 'Ana Souza', avatarUrl: null, isInstructor: false },
  { userId: 'b', name: 'Bruno Lima', avatarUrl: null, isInstructor: false },
  { userId: 'c', name: 'Caio Mendes', avatarUrl: null, isInstructor: false },
  { userId: 'd', name: 'Duda Rocha', avatarUrl: null, isInstructor: false },
];

export const sampleAnswerers: ClassAnswerer[] = [
  { userId: 'a', name: 'Ana Souza', avatarUrl: null, state: 'done', elapsedMs: 7_200 },
  { userId: 'c', name: 'Caio Mendes', avatarUrl: null, state: 'done', elapsedMs: 9_800 },
  { userId: 'b', name: 'Bruno Lima', avatarUrl: null, state: 'wrong', elapsedMs: 12_400 },
  { userId: 'd', name: 'Duda Rocha', avatarUrl: null, state: 'pending' },
];

export const sampleRanking: ClassRanking = {
  ranked: [
    {
      userId: 'a',
      name: 'Ana Souza',
      avatarUrl: null,
      totalMs: 17_000,
      answeredCount: 3,
      correctCount: 3,
      rank: 1,
    },
    {
      userId: 'c',
      name: 'Caio Mendes',
      avatarUrl: null,
      totalMs: 21_500,
      answeredCount: 3,
      correctCount: 2,
      rank: 2,
    },
    {
      userId: 'b',
      name: 'Bruno Lima',
      avatarUrl: null,
      totalMs: 28_900,
      answeredCount: 2,
      correctCount: 1,
      rank: 3,
    },
  ],
  waiting: [{ userId: 'd', name: 'Duda Rocha', avatarUrl: null }],
};

/* ── Guest-link fixtures (plan 20260728-itera-guest-link-aula-sincrona) ─────
 * The guest deliberately shares a display name with a real student ("Ana
 * Souza"): ADR-11 allows that collision precisely because the guest badge is
 * what tells them apart. These fixtures exist so the ambiguity is visible in
 * Storybook instead of being discovered live in a sales demo.
 */

export const sampleRosterWithGuest: ClassPresenceMember[] = [
  ...sampleRoster,
  { userId: 'g1', name: 'Ana Souza', avatarUrl: null, isInstructor: false, isGuest: true },
];

export const sampleAnswerersWithGuest: ClassAnswerer[] = [
  ...sampleAnswerers,
  { userId: 'g1', name: 'Ana Souza', avatarUrl: null, state: 'done', elapsedMs: 5_100 },
];

/** A guest OUT-RANKING the real cohort — allowed by ADR-9, badged everywhere. */
export const sampleRankingWithGuest: ClassRanking = {
  ranked: [
    { userId: 'g1', name: 'Ana Souza', avatarUrl: null, totalMs: 12_400, answeredCount: 3, correctCount: 3, rank: 1, isGuest: true },
    { userId: 'a', name: 'Ana Souza', avatarUrl: null, totalMs: 17_000, answeredCount: 3, correctCount: 3, rank: 2 },
    { userId: 'c', name: 'Caio Mendes', avatarUrl: null, totalMs: 21_500, answeredCount: 3, correctCount: 2, rank: 3 },
    { userId: 'b', name: 'Bruno Lima', avatarUrl: null, totalMs: 28_900, answeredCount: 2, correctCount: 1, rank: 4 },
  ],
  waiting: [
    { userId: 'd', name: 'Duda Rocha', avatarUrl: null },
    { userId: 'g2', name: 'Visitante', avatarUrl: null, isGuest: true },
  ],
};

/** The durable guest ids for this session (itera.class_guests). */
export const sampleGuestUserIds = ['g1', 'g2'];
