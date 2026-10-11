import type { RecordedAction } from '@/utils/learningTrace';

/** One answer a visitor settled in the public first lesson, kept in the browser until a sign-in claims it. */
export interface GuestAnswer {
  correct: boolean;
  settledAt: number;
  response?: string;
  actions?: RecordedAction[];
  /** What the server said when asked without an account; absent when it could not be asked. */
  serverVerdict?: 'pass' | 'fail';
  /** The server's signed note of when it graded this pass; a sign-in sends it back so the day keeps its real times. */
  receipt?: { graded_at: string; sig: string };
}

export type GuestAnswers = Record<string, GuestAnswer>;
