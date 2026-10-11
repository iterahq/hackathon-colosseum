import { getSupabase } from '@/lib/supabase/client';
import type { RecordedAction } from '@/utils/activityFamilies';

export type GradeMode = 'server' | 'self_reported' | 'participation';

/** Body of `POST /functions/v1/grade`. */
export interface GradeRequest {
  activity_id: string;
  /** What the player decided. The server records a completion only if its own grading agrees. */
  passed: boolean;
  response: string | null;
  answer: Record<string, unknown> | null;
}

/** What a miss cost, as the server decided it. */
export interface GradeMiss {
  charge: 'charged' | 'already_charged' | 'lesson_cap';
  life_lost: boolean;
  lesson_cap: number;
}

/** Fired with the raw `lives` block of a grade answer: the server is the only judge of a life. */
export const SERVER_LIVES_EVENT = 'itera:server-lives';

export interface ServerLivesDetail {
  lives: unknown;
  miss: GradeMiss | null;
}

/** Answer of `POST /functions/v1/grade`. */
export interface GradeVerdict {
  verdict: 'pass' | 'fail';
  mode: GradeMode;
  reason?: string;
  attempt_id: string;
  answer_hash: string;
  graded_at: string;
  miss?: GradeMiss;
  lives?: unknown;
  /** Graded for a visitor with no session: nothing was recorded. */
  guest?: boolean;
}

/** The server caps the text of an answer; a longer one is cut here so the request is not refused whole. */
export const MAX_GRADED_RESPONSE_CHARS = 30_000;

/** What the learner submitted, as the activity recorded it: the payload of the last `answer_submitted` action. */
export function submittedAnswer(actions: readonly RecordedAction[] | undefined): Record<string, unknown> | null {
  if (!actions) return null;
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    if (actions[index].type === 'answer_submitted') return actions[index].payload ?? null;
  }
  return null;
}

function isVerdict(value: unknown): value is GradeVerdict {
  if (typeof value !== 'object' || value === null) return false;
  const { verdict, mode } = value as Record<string, unknown>;
  return (verdict === 'pass' || verdict === 'fail') && typeof mode === 'string';
}

/**
 * Sends one settled answer to the server, which grades it and records the
 * attempt and the progress. `null` when the server could not be reached or
 * refused the request: nothing was recorded and the caller may retry.
 */
export async function submitForGrading(input: {
  activityId: string;
  passed: boolean;
  response?: string | null;
  actions?: readonly RecordedAction[];
}): Promise<GradeVerdict | null> {
  const response = typeof input.response === 'string' ? input.response.slice(0, MAX_GRADED_RESPONSE_CHARS) : null;
  const body: GradeRequest = {
    activity_id: input.activityId,
    passed: input.passed,
    response,
    answer: submittedAnswer(input.actions),
  };
  try {
    const { data, error } = await getSupabase().functions.invoke('grade', { method: 'POST', body });
    if (error || !isVerdict(data)) return null;
    if (data.lives && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<ServerLivesDetail>(SERVER_LIVES_EVENT, { detail: { lives: data.lives, miss: data.miss ?? null } }));
    }
    return data;
  } catch {
    return null;
  }
}
