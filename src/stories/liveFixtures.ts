import type { ClassPresenceMember, ClassAnswerer, ClassRanking } from '@/types/liveClass';

/** Shared sample data for the live-class component stories. */

export const sampleRoster: ClassPresenceMember[] = [
  { userId: 'prof', name: 'Prof. Tainan', isInstructor: true },
  { userId: 'a', name: 'Ana Souza', isInstructor: false },
  { userId: 'b', name: 'Bruno Lima', isInstructor: false },
  { userId: 'c', name: 'Caio Mendes', isInstructor: false },
  { userId: 'd', name: 'Duda Rocha', isInstructor: false },
];

export const sampleAnswerers: ClassAnswerer[] = [
  { userId: 'a', name: 'Ana Souza', state: 'done', elapsedMs: 7_200 },
  { userId: 'c', name: 'Caio Mendes', state: 'done', elapsedMs: 9_800 },
  { userId: 'b', name: 'Bruno Lima', state: 'wrong', elapsedMs: 12_400 },
  { userId: 'd', name: 'Duda Rocha', state: 'pending' },
];

export const sampleRanking: ClassRanking = {
  ranked: [
    { userId: 'a', name: 'Ana Souza', totalMs: 17_000, answeredCount: 3, correctCount: 3, rank: 1 },
    { userId: 'c', name: 'Caio Mendes', totalMs: 21_500, answeredCount: 3, correctCount: 2, rank: 2 },
    { userId: 'b', name: 'Bruno Lima', totalMs: 28_900, answeredCount: 2, correctCount: 1, rank: 3 },
  ],
  waiting: [{ userId: 'd', name: 'Duda Rocha' }],
};
