/**
 * `seedFallbackRun` — put the author's fallback reply on screen before any send.
 *
 * `chat_rate_reply` (plan `20260924-activity-type-one-behavior-rule`, T10 +
 * T25) shows a reply and asks the learner to rate it. It has no compose input,
 * so `sendPrompt` never runs, `model.runs` stays empty and `evaluate` has
 * nothing to grade: 0 of the 15 prepared rate specs could complete.
 * `@iterahq/activity-spec/runtime` `seedFallbackRun` (activity-spec #57,
 * `4ae022b`) closes that: one user message (the base prompt), one assistant
 * message (the fallback canned reply) and one run record.
 *
 * The installed spec answers when it exports the function (the release that
 * carries #57). Before that, the same model comes out of `sendPrompt` on a copy
 * of the scenario whose resolver has no rules: the resolver then returns the
 * fallback key, `withContext` is `false`, and the messages are the same —
 * which is exactly what #57 writes by hand. Delete the fallback branch after
 * the bump.
 */
import * as runtime from '@iterahq/activity-spec/runtime';
import type { ChatModel, Locale, Scenario } from '@iterahq/activity-spec/runtime';

type SeedFallbackRun = (sc: Scenario, model: ChatModel, locale: Locale) => ChatModel;

const native = (runtime as unknown as { seedFallbackRun?: SeedFallbackRun }).seedFallbackRun;

/** True when the installed runtime exports `seedFallbackRun` itself. */
export const RUNTIME_HAS_SEED_FALLBACK_RUN = typeof native === 'function';

export function seedFallbackRun(sc: Scenario, model: ChatModel, locale: Locale): ChatModel {
  if (typeof native === 'function') return native(sc, model, locale);
  return seedFallbackRunCompat(sc, model, locale);
}

/** The pre-#57 equivalent. Exported for the parity test only. */
export function seedFallbackRunCompat(sc: Scenario, model: ChatModel, locale: Locale): ChatModel {
  if (model.runs.length > 0) return model;
  const resolver = sc.initialState.resultResolver;
  const fallbackOnly: Scenario = {
    ...sc,
    initialState: { ...sc.initialState, resultResolver: { ...resolver, rules: [] } },
  };
  return runtime.sendPrompt(fallbackOnly, model, locale);
}
