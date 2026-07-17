import { useCallback, useMemo, useState } from 'react';
import { t, type Locale, type Message } from '@iterahq/activity-spec/runtime';
import { respond, judge } from '@/api/iteraApi';
import {
  buildJudgeContent,
  computeOutcome,
  type ByocLiveSpec,
  type ByocOutcome,
  type ByocRating,
} from './byocLive';

/**
 * The LIVE BYOC hook — the "async pre-fetch in the player hook" path (Tainan Q5).
 *
 * It owns the local chat transcript and drives the real-LLM calls:
 *   send()  → `POST /v1/embed/respond` produces a GENUINE response to the
 *             learner's own input (step 1). The response MAY also carry a
 *             deterministic `context_good` + `reason` ground-truth verdict,
 *             established once at generation time.
 *   rate()  → compares the learner's good/bad rating against the ground
 *             truth (step 2). TWO paths:
 *             - `context_good` PRESENT (typeof === 'boolean'): use it
 *               directly — no extra network call. This is the fix for the
 *               "contradictory feedback" bug Tainan flagged (a red FAIL
 *               header next to judge `feedback` text that praised a correct
 *               rating): the OLD path's single `/v1/embed/judge` call
 *               produced BOTH `passed` (a boolean) and `feedback` (free
 *               text) from the same LLM generation, and the two could
 *               disagree. `context_good` is established once, so the header
 *               and the feedback it drives can never contradict each other.
 *             - `context_good` ABSENT (older/unupgraded itera-api deploy):
 *               falls back to the pre-existing `POST /v1/embed/judge` path,
 *               UNCHANGED.
 *
 * Deterministic-graceful fallback (Q5 "the reducer stays as deterministic
 * fallback"): the deterministic `@iterahq/activity-spec` runtime is Samuel's and
 * remains the path for every non-live instance. On the live path, if a call
 * degrades — responder unavailable, judge unavailable, or a network throw — the
 * hook NEVER hard-blocks: the responder's own fallback text is shown, and an
 * unverifiable judge yields the `unverified` outcome (recorded, learner may
 * continue). Reducers/side-effects are pure React state; nothing persists here.
 */

type Phase = 'compose' | 'responding' | 'evaluate' | 'judging' | 'settled';

export interface SandboxLiveState {
  messages: Message[];
  phase: Phase;
  /** The last responder call actually ran (false => degraded fallback text). */
  responderAvailable: boolean;
  /** The learner's current rating (null before they rate / after a retry). */
  rating: ByocRating | null;
  /** The judge's verdict on the response: true = "response is good". */
  judgePassed: boolean | null;
  /** The judge actually ran (false => outcome is `unverified`). */
  judgeAvailable: boolean;
  /** Computed lesson outcome once the judge returns. */
  outcome: ByocOutcome | null;
  /** The judge's human feedback (WHY the rating was right/wrong). */
  feedback: string | null;
  /** True once the learner has judged correctly (or the judge couldn't verify). */
  won: boolean;
  /** Non-fatal error surfaced to the UI (call still degrades gracefully). */
  error: string | null;
  send: (input: string) => void;
  rate: (rating: ByocRating) => void;
  retry: () => void;
}

export function useSandboxScenarioLive(
  activityId: string,
  spec: ByocLiveSpec,
  token: string,
  locale: Locale,
  reveal = false,
  isDone = false,
): SandboxLiveState {
  const seed = useMemo<Message[]>(
    () => (spec.seedMessages ?? []).map((m) => ({ role: m.role, text: t(m.text, locale) })),
    [spec.seedMessages, locale],
  );

  const [messages, setMessages] = useState<Message[]>(seed);
  const [phase, setPhase] = useState<Phase>('compose');
  const [responderAvailable, setResponderAvailable] = useState(true);
  const [lastInput, setLastInput] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  // Deterministic ground truth from the respond() call itself (step 1), when
  // the itera-api contract provides it — see the module doc comment.
  const [contextGood, setContextGood] = useState<boolean | null>(null);
  const [contextGoodReason, setContextGoodReason] = useState<string | null>(null);
  const [rating, setRating] = useState<ByocRating | null>(null);
  const [judgePassed, setJudgePassed] = useState<boolean | null>(null);
  const [judgeAvailable, setJudgeAvailable] = useState(true);
  const [outcome, setOutcome] = useState<ByocOutcome | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readOnly = reveal || isDone;
  const won = outcome === 'pass' || outcome === 'unverified' || reveal || isDone;

  const send = useCallback(
    (input: string) => {
      const text = input.trim();
      if (!text || readOnly || phase === 'responding' || phase === 'judging') return;
      setError(null);
      setLastInput(text);
      setMessages((m) => [...m, { role: 'user', text }]);
      setPhase('responding');

      respond(text, token, spec.system)
        .then((r) => {
          setResponderAvailable(r.responder_available);
          setLastResponse(r.response);
          // Defensive: only trust the field when it's ACTUALLY present (the
          // itera-api contract extension may not be live yet at any given
          // deploy) — `typeof` guards against `undefined` AND non-boolean
          // drift, never against a legit `false`.
          setContextGood(typeof r.context_good === 'boolean' ? r.context_good : null);
          setContextGoodReason(typeof r.reason === 'string' ? r.reason : null);
          setMessages((m) => [...m, { role: 'assistant', text: r.response }]);
          setPhase('evaluate');
        })
        .catch((e) => {
          // Never hard-block: surface a graceful fallback answer + a note.
          const fallback = t(
            { pt: 'A IA está indisponível agora — tente enviar de novo.', en: 'The AI is unavailable right now — try sending again.' },
            locale,
          );
          setResponderAvailable(false);
          setLastResponse(fallback);
          setContextGood(null);
          setContextGoodReason(null);
          setMessages((m) => [...m, { role: 'assistant', text: fallback }]);
          setError((e as Error).message);
          setPhase('evaluate');
        });
    },
    [readOnly, phase, token, spec.system, locale],
  );

  const rate = useCallback(
    (picked: ByocRating) => {
      if (readOnly || phase !== 'evaluate') return;
      setError(null);
      setRating(picked);

      // Deterministic ground-truth path (P5/#5 fix): `context_good` was
      // already established ONCE at generation time (step 1) — skip the
      // separate `/v1/embed/judge` network call entirely and derive the
      // outcome/feedback locally, synchronously. This is what removes the
      // possibility of the header/feedback contradiction: there is only ONE
      // verdict now, not two independently-generated signals from the same
      // LLM call. `judgePassed`/`data-judge-verdict` are still populated
      // (from `context_good`) so downstream consumers (e.g. the e2e
      // comparison-logic assertion) see the SAME shape as the judge path.
      if (contextGood !== null) {
        setJudgePassed(contextGood);
        setJudgeAvailable(true);
        setFeedback(
          contextGoodReason ??
            t({ pt: 'Avaliação registrada.', en: 'Rating recorded.' }, locale),
        );
        setOutcome(computeOutcome(picked, contextGood, true));
        setPhase('settled');
        return;
      }

      // Fallback path — `context_good` wasn't present on the respond()
      // result (itera-api contract not live at this deploy yet). Unchanged
      // from before: call the judge for its own real-LLM verdict.
      setPhase('judging');
      judge(activityId, buildJudgeContent(lastInput, lastResponse), token)
        .then((v) => {
          setJudgePassed(v.passed);
          setJudgeAvailable(v.judge_available);
          setFeedback(v.feedback);
          setOutcome(computeOutcome(picked, v.passed, v.judge_available));
          setPhase('settled');
        })
        .catch((e) => {
          // Judge threw => unverifiable. Record + let the learner continue.
          setJudgeAvailable(false);
          setJudgePassed(null);
          setFeedback(
            t(
              { pt: 'Não foi possível verificar sua avaliação agora, mas ela foi registrada.', en: "We couldn't verify your rating right now, but it was recorded." },
              locale,
            ),
          );
          setOutcome('unverified');
          setError((e as Error).message);
          setPhase('settled');
        });
    },
    [readOnly, phase, contextGood, contextGoodReason, activityId, lastInput, lastResponse, token, locale],
  );

  // Clear the rating/verdict so the learner can re-judge the SAME response (the
  // response is fixed; retry lets them reconsider good vs bad after the feedback).
  const retry = useCallback(() => {
    if (readOnly) return;
    setRating(null);
    setJudgePassed(null);
    setJudgeAvailable(true);
    setOutcome(null);
    setFeedback(null);
    setError(null);
    setPhase('evaluate');
  }, [readOnly]);

  return {
    messages,
    phase,
    responderAvailable,
    rating,
    judgePassed,
    judgeAvailable,
    outcome,
    feedback,
    won,
    error,
    send,
    rate,
    retry,
  };
}
