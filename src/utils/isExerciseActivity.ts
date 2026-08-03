import type { Activity } from '@/types/content';
import { isByocActivity } from '@/components/branded/activity/byoc/byocSpec';
import { iteraApiConfigured } from '@/api/iteraApi';
import { isAnswerableLiveKind } from './isAnswerableLiveKind';

/**
 * "Does this activity ask the learner to PRODUCE an answer?" — the row-level
 * question, where `isAnswerableLiveKind` only answers the kind-level one.
 *
 * It needs the whole row because two AUTHORED fields flip the verdict, and both
 * flips reached production: a BYOC harness turns a `concept` into a graded
 * round, and a `document` carrying a prompt or an `ai-judge`/`min_words` rubric
 * is a written reflection rather than a page to read.
 *
 * The distinction is what keeps the podium honest (professor feedback,
 * 2026-08-02: *"apenas nos exercicios os usuarios devem marcar como
 * concluidas"*). While reading a slide could be "completed", whoever clicked it
 * outscored whoever just listened — and the professor had to advance the class
 * anyway, so the ranking measured obedience, not learning.
 */
export function isExerciseActivity(activity: Activity | null | undefined): boolean {
  if (!activity) return false;
  if (isByocActivity(activity)) return true;
  if (activity.kind === 'document') return isWrittenDocument(activity);
  return isAnswerableLiveKind(activity.kind);
}

/**
 * Mirrors the branch `DocumentActivity` takes in `ActivityRenderer`: a prompt or
 * a rubric means a textarea and a word count, no prompt means prose plus a body.
 * Kept as one predicate so the shell and the renderer cannot disagree about
 * whether the learner is expected to write.
 */
function isWrittenDocument(activity: Activity): boolean {
  const rubric = (activity.rubric ?? {}) as { mode?: string; min_words?: number };
  if (rubric.mode === 'ai-judge' && iteraApiConfigured()) return true;
  const minWords = typeof rubric.min_words === 'number' ? rubric.min_words : 0;
  const spec = (activity.spec ?? {}) as { prompt?: string };
  return Boolean(spec.prompt) || minWords > 0;
}
