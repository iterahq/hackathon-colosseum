import type { RecordedAction } from '@/utils/learningTrace';

/** One answer a visitor settled in the public first lesson, kept in the browser until a sign-in claims it. */
export interface GuestAnswer {
  correct: boolean;
  settledAt: number;
  response?: string;
  actions?: RecordedAction[];
  /** What the server said when asked without an account; absent when it could not be asked. */
  serverVerdict?: 'pass' | 'fail';
}

export type GuestAnswers = Record<string, GuestAnswer>;
