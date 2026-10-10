/** The end of a lesson: what the client knows, what `passport` answered, and the screen that follows. */
import type { PassportResult } from '@/types/achievements';
import type { CeremonyModel } from '@/utils/ceremony';

/** Where the lesson sits in a trail with a certification, as the client knows it before the server answers. */
export interface TrailPreview {
  day: number;
  totalDays: number;
  /** Stamps already on the page before this day. */
  stampedBefore: number;
  trailTitle: string;
  colorIndex: number;
}

/** `loading`: the trails are not read yet. `none`: the lesson is not a day of any trail. */
export type TrailKnowledge = 'loading' | 'none' | TrailPreview;

export type PassportCall =
  | { state: 'idle' }
  | { state: 'pending' }
  | { state: 'done'; result: Pick<PassportResult, 'day_incomplete'>; model: CeremonyModel | null }
  /** `silent`: the function is missing or not for this caller (401/403/404). */
  | { state: 'error'; silent: boolean }
  | { state: 'timeout' };

export interface LessonEndInput {
  /** A learner with an account: not signed out, not a live-class guest. */
  learner: boolean;
  /** Activities of this lesson the client knows as completed, and how many it has. */
  done: number;
  total: number;
  /** The lesson was finished in this visit, just now (not reopened already finished). */
  fresh: boolean;
  trail: TrailKnowledge;
  call: PassportCall;
  /** The learner closed the ceremony ("Depois"). */
  dismissed?: boolean;
}

export type LessonEndView =
  /** The plain completion card. `note` adds the line about the stamp arriving later. */
  | { kind: 'card'; note: 'stampLater' | null }
  /** The day is not whole: no ceremony, the card says how many are left. */
  | { kind: 'incomplete'; missing: number; done: number; total: number }
  /** Nothing yet: the trails are still being read (bounded by the caller). */
  | { kind: 'hold' }
  /** The ceremony in its minting state, before the server answered. */
  | { kind: 'preparing'; preview: TrailPreview }
  | { kind: 'ceremony'; model: CeremonyModel };
