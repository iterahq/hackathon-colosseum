/**
 * Local persistence of the learner's OWN settled answers in the self-paced
 * lesson player, so a page refresh can't re-open an exercise that was already
 * answered — hit or miss. The self-paced sibling of `liveAnswerStorage`.
 *
 * `itera.progress` only says "completed"; it never said WHAT was answered, and
 * it says nothing at all about a miss (which stays `in_progress`, the same
 * value a lesson reset leaves behind). So without this the reload drew every
 * answered exercise blank again, and a miss could be dodged with F5.
 *
 * Keyed by activity under one scoped key, so "resetar a lição para todos"
 * (`clearLearnerLessonState`) can forget exactly the activities it reopens.
 */
import { scopedKey } from '@/utils/storageScope';
import type { RecordedAction } from '@/utils/learningTrace';
import type { StoredLessonAnswer } from '@/types/lessonAnswer';

export type { StoredLessonAnswer } from '@/types/lessonAnswer';

const keyFor = () => scopedKey('itera.lesson.answers', 'v1');

/** Same cap as the attempt log (`MAX_RESPONSE_CHARS`) — kept local to stay pure. */
const MAX_STORED_RESPONSE_CHARS = 2000;

/**
 * The only actions a restore reads (`packages/activities/src/internal/priorAnswer.ts`):
 * the terminal submit, and the gate `decompose_canvas` seeds its parts from.
 * Storing the whole trace would grow the key by kilobytes per exercise.
 */
const RESTORE_ACTION_TYPES: readonly string[] = ['answer_submitted', 'gate_opened'];

/** The last action of each restorable type, in the order they happened. */
export function restoreActions(actions?: readonly RecordedAction[] | null): RecordedAction[] {
  if (!actions) return [];
  const last = new Map<string, RecordedAction>();
  for (const action of actions) {
    if (RESTORE_ACTION_TYPES.includes(action.type)) last.set(action.type, action);
  }
  return [...last.values()].sort((a, b) => a.at - b.at);
}

export function readLessonAnswers(): Record<string, StoredLessonAnswer> {
  const key = keyFor();
  if (!key) return {};
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const valid: Record<string, StoredLessonAnswer> = {};
    for (const [id, entry] of Object.entries(parsed as Record<string, StoredLessonAnswer>)) {
      if (entry && typeof entry.correct === 'boolean') valid[id] = entry;
    }
    return valid;
  } catch {
    return {};
  }
}

export function storeLessonAnswer(activityId: string, answer: StoredLessonAnswer): void {
  const key = keyFor();
  if (!key || !activityId) return;
  try {
    const all = readLessonAnswers();
    all[activityId] = {
      ...answer,
      response: answer.response?.slice(0, MAX_STORED_RESPONSE_CHARS),
      actions: restoreActions(answer.actions),
    };
    localStorage.setItem(key, JSON.stringify(all));
  } catch {
    // Storage unavailable (private mode/quota) — refresh protection degrades only.
  }
}

export function clearLessonAnswers(activityIds: readonly string[]): void {
  const key = keyFor();
  if (!key || activityIds.length === 0) return;
  try {
    const all = readLessonAnswers();
    for (const activityId of activityIds) delete all[activityId];
    localStorage.setItem(key, JSON.stringify(all));
  } catch {
    // Storage unavailable — nothing was persisted to clear either.
  }
}
