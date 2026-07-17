/**
 * BYOC ("Bring Your Own Context") LIVE-path helpers — pure, React-free.
 *
 * ADDITIVE MODULE (plan itera-migracao-3-atividades / OpenRouter Phase 2). This
 * file — and the whole `sandbox-live/` folder — is layered ALONGSIDE Samuel's
 * deterministic `sandbox/` runtime, never on top of it. Samuel's
 * `SandboxScenarioActivity` + `useSandboxScenario` + `@iterahq/activity-spec`
 * runtime are the deterministic path and are NOT touched; the live path reuses
 * his presentational components (SandboxChatLog / SandboxBubble / useAssistantStream)
 * and the shared `Message` type, and only ADDS the real-LLM behavior around them.
 *
 * The BYOC activity is a 2-step lesson that teaches CONTEXT:
 *   Step 1 — the learner writes their OWN input/context; the REAL AI responder
 *            (`POST /v1/embed/respond`) generates a genuine response.
 *   Step 2 — the learner rates that response good/bad; the JUDGE
 *            (`POST /v1/embed/judge`) evaluates the response quality (the ground
 *            truth), and the CLIENT compares (learner-rating × judge-verdict) to
 *            decide PASS/FAIL — see `computeOutcome` below.
 */
import type { I18n } from '@iterahq/activity-spec/runtime';

/** The learner's binary rating of the AI response (Tainan: 2 buttons). */
export type ByocRating = 'good' | 'bad';

/** Computed lesson outcome after the judge verdict comes back. */
export type ByocOutcome = 'pass' | 'fail' | 'unverified';

/**
 * The subset of an `activity.spec` the BYOC live component reads. Every field is
 * OPTIONAL with a sensible bilingual default, so a minimally-authored instance
 * still runs. `openness: 'byoc'` (or `live: true`) is the LIVE marker.
 */
export interface ByocLiveSpec {
  /** Live marker — `@iterahq/activity-spec` already models `openness: 'byoc'`. */
  openness?: string;
  /** Alternative explicit live marker. */
  live?: boolean;
  title?: I18n;
  /** Step-1 compose instruction ("write your own context / ask"). */
  prompt?: I18n;
  /** Composer textarea placeholder. */
  placeholder?: I18n;
  /** Optional responder framing (system prompt) passed to `/v1/embed/respond`. */
  system?: string;
  /** Step-2 instruction ("was this response good or bad?"). */
  ratePrompt?: I18n;
  goodLabel?: I18n;
  badLabel?: I18n;
  /** Optional intro line(s) shown before the learner composes. */
  seedMessages?: { role: 'user' | 'assistant'; text: I18n }[];
}

/**
 * Whether an activity should render through the BYOC LIVE path. True only for a
 * `sandbox_scenario` whose spec is marked byoc/live. All other activities (the 6
 * existing deterministic sandbox instances, quizzes, docs, …) return false and
 * flow through Samuel's untouched renderer.
 */
export function isByocLive(activity: { kind: string; spec: Record<string, unknown> | null | undefined }): boolean {
  if (activity.kind !== 'sandbox_scenario') return false;
  const s = (activity.spec ?? {}) as ByocLiveSpec;
  return s.openness === 'byoc' || s.live === true;
}

/**
 * The learner judged CORRECTLY when their rating agrees with the judge's verdict
 * on the response. `judgePassed` is the judge's real-LLM verdict = "the response
 * is good". This is the COMPARISON LOGIC the e2e asserts (not the LLM's exact
 * label): learner-rating × judge-verdict → PASS/FAIL.
 */
export function isRatingCorrect(rating: ByocRating, judgePassed: boolean): boolean {
  return (rating === 'good') === judgePassed;
}

/**
 * Fold the judge result into an outcome. When the judge degraded
 * (`judge_available:false`) the ground truth is unknown → `unverified` (recorded,
 * never hard-blocked — mirrors the server's own graceful-degrade philosophy).
 */
export function computeOutcome(rating: ByocRating, judgePassed: boolean, judgeAvailable: boolean): ByocOutcome {
  if (!judgeAvailable) return 'unverified';
  return isRatingCorrect(rating, judgePassed) ? 'pass' : 'fail';
}

/**
 * Build the judge `content` for step 2. The judge grades whether the SUBMISSION
 * satisfies the activity — so we self-frame the submission as "is this RESPONSE a
 * good answer to this INPUT?", making `passed` = "the response is good"
 * robustly, independent of how thin the DB rubric is. With EXTREME learner inputs
 * (rich context vs empty/garbage) the free model yields good/bad reliably.
 */
export function buildJudgeContent(input: string, response: string): string {
  return [
    'TASK: Decide whether the AI RESPONSE below is a GOOD, high-quality answer to the LEARNER INPUT.',
    'A response is GOOD when it is specific, on-topic, and directly useful for the given input.',
    'It is NOT good when it is generic, off-topic, evasive, or ignores the input.',
    'Set passed=true ONLY if the response is GOOD.',
    '',
    'LEARNER INPUT:',
    input,
    '',
    'AI RESPONSE TO EVALUATE:',
    response,
  ].join('\n');
}
