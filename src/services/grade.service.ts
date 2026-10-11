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
  /** The gestures of a kind the browser grades: the server reads them before it accepts the pass. */
  trace: readonly RecordedAction[] | null;
  /** The server writes the attempt's result row and the xp; this player writes neither. */
  results: 'server';
  elapsed_ms: number | null;
  visible_ms: number | null;
}

/** What a verdict lets out of the server: never the key of an answer that missed. */
export interface GradeShown {
  graded_by?: 'server' | 'browser' | 'none';
  key?: Record<string, unknown>;
  explanation?: unknown;
  blanks?: Record<string, boolean>;
  checks?: Array<{ id: string; passed: boolean }>;
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
  shown?: GradeShown;
  /** How many times this learner has sent an answer to this activity, this one included. */
  tries?: number | null;
  xp_awarded?: number;
  /** Graded for a visitor with no session: nothing was recorded. */
  guest?: boolean;
  /** A visitor's pass only: when the server graded it, signed. Sent back by the claim after a sign-in. */
  receipt?: { graded_at: string; sig: string };
}

/** One pass of a visitor, as `claimGuestPasses` sends it. */
export interface GuestClaimItem {
  activityId: string;
  response: string | null;
  actions?: readonly RecordedAction[];
  receipt?: { graded_at: string; sig: string };
  settledAt: number;
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

/** The most gestures sent with one answer; the server reads no more. */
const MAX_TRACE_ACTIONS = 500;
/** How long a verdict asked at the submit waits for the player's own write of the same answer. */
const JUDGED_VERDICT_TTL_MS = 5 * 60_000;

const judgedVerdicts = new Map<string, { verdict: GradeVerdict; at: number }>();
const judgedKey = (activityId: string, response: string | null) => `${activityId}\n${response ?? ''}`;

/** The gestures of a scene kind: they end at the gate the gesture opens. Other kinds send none. */
function gestureTrace(actions: readonly RecordedAction[] | undefined): readonly RecordedAction[] | null {
  if (!actions || actions.length === 0 || actions[actions.length - 1].type !== 'gate_opened') return null;
  return actions.length <= MAX_TRACE_ACTIONS ? actions : [...actions.slice(0, MAX_TRACE_ACTIONS - 1), actions[actions.length - 1]];
}

const wholeMs = (value: number | null | undefined): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null);

/**
 * Sends one settled answer to the server, which grades it and records the
 * attempt, the progress, the result row and the xp. `null` when the server
 * could not be reached or refused the request: nothing was recorded and the
 * caller may retry.
 *
 * An answer already judged at the submit (`judgeAnswer`) is not sent twice: the
 * verdict it got then is the one returned here.
 */
export async function submitForGrading(input: {
  activityId: string;
  passed: boolean;
  response?: string | null;
  actions?: readonly RecordedAction[];
  answer?: Record<string, unknown> | null;
  duration?: { elapsedMs?: number | null; visibleMs?: number | null } | null;
}): Promise<GradeVerdict | null> {
  const response = typeof input.response === 'string' ? input.response.slice(0, MAX_GRADED_RESPONSE_CHARS) : null;
  const key = judgedKey(input.activityId, response);
  const judged = judgedVerdicts.get(key);
  if (judged) {
    judgedVerdicts.delete(key);
    if (Date.now() - judged.at < JUDGED_VERDICT_TTL_MS) return judged.verdict;
  }
  const body: GradeRequest = {
    activity_id: input.activityId,
    passed: input.passed,
    response,
    answer: input.answer ?? submittedAnswer(input.actions),
    trace: gestureTrace(input.actions),
    results: 'server',
    elapsed_ms: wholeMs(input.duration?.elapsedMs),
    visible_ms: wholeMs(input.duration?.visibleMs),
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

/**
 * Asks the server for the verdict of a sealed activity at the submit: the
 * browser holds no key to grade it with. The verdict is kept for the player's
 * own write of the same answer, which then costs no second attempt.
 */
export async function judgeAnswer(
  activityId: string,
  submission: { answer?: Record<string, unknown> | null; response?: string | null },
): Promise<GradeVerdict | null> {
  const response = typeof submission.response === 'string' ? submission.response.slice(0, MAX_GRADED_RESPONSE_CHARS) : null;
  judgedVerdicts.delete(judgedKey(activityId, response));
  const verdict = await submitForGrading({ activityId, passed: true, response, answer: submission.answer ?? null });
  if (verdict) judgedVerdicts.set(judgedKey(activityId, response), { verdict, at: Date.now() });
  return verdict;
}

/**
 * Records, in one request, the passes a visitor settled before signing in. The
 * server grades each again and dates it by its own receipt. Returns the ids
 * that landed; `null` when the request itself failed.
 */
export async function claimGuestPasses(items: readonly GuestClaimItem[]): Promise<ReadonlySet<string> | null> {
  const claim = items.map((item) => ({
    activity_id: item.activityId,
    response: typeof item.response === 'string' ? item.response.slice(0, MAX_GRADED_RESPONSE_CHARS) : null,
    answer: submittedAnswer(item.actions),
    trace: gestureTrace(item.actions),
    receipt: item.receipt ?? null,
    settled_at: item.settledAt,
  }));
  try {
    const { data, error } = await getSupabase().functions.invoke('grade', { method: 'POST', body: { claim } });
    const claimed = (data as { claimed?: unknown } | null)?.claimed;
    if (error || !Array.isArray(claimed)) return null;
    return new Set(claimed.filter((row): row is { activity_id: string; landed: boolean } => row?.landed === true && typeof row.activity_id === 'string').map((row) => row.activity_id));
  } catch {
    return null;
  }
}
