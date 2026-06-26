import type { ProgressStatus } from '@/types/content';

/**
 * Normalize the DB `itera.progress_status` enum value into the front-end
 * canonical {@link ProgressStatus} used across the player UI.
 *
 * WHY this exists: the DB enum is ('not_started','in_progress','completed') but
 * the UI model (SkillTree node state, ActivityRenderer, lesson-done gating) uses
 * the canonical ProgressStatus = ('todo','in_progress','done'). Reading the raw
 * DB value into the UI is the bug that left a fully-completed lesson showing as
 * not-done (0/2) and kept the next lesson LOCKED — the unlock logic checks
 * `status === 'done'` while the DB stores `'completed'`, so it never matched.
 *
 * Mapping:
 *   completed   → done
 *   in_progress → in_progress
 *   not_started → todo
 *   (unknown / undefined) → todo
 */
export function normalizeProgressStatus(dbStatus: string | null | undefined): ProgressStatus {
  switch (dbStatus) {
    case 'completed':
    case 'done':
      return 'done';
    case 'in_progress':
      return 'in_progress';
    default:
      return 'todo';
  }
}
