import type { RecordedAction } from '@/utils/learningTrace';

/** One settled answer of the self-paced player, as kept in localStorage. */
export interface StoredLessonAnswer {
  correct: boolean;
  /** Wall clock of the settle — replayed as the attempt's anchor if the write never landed. */
  settledAt: number;
  /** False until the attempt reached the server (or its durable outbox). */
  saved: boolean;
  response?: string;
  actions?: RecordedAction[];
}
