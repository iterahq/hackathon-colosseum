/**
 * The shape of the BYOC waiting screen, as a pure function of elapsed time.
 *
 * A wait long enough to read as "frozen" needs narration: the learner who
 * reloads gets the SAME tree back (generation is idempotent per learner+activity)
 * having learnt nothing from waiting. So the wait narrates itself instead.
 *
 * ⚠️ THESE NUMBERS TRACK A MEASUREMENT, AND THE MEASUREMENT MOVED.
 * ---------------------------------------------------------------
 * They were first set against 26–73s, which was real — but that was the latency
 * of `openai/gpt-oss-20b:free`, a reasoning model that burned ~1.190 tokens
 * thinking before writing a word. Prod switched `ITERA_BYOC_MODEL` to
 * `google/gemini-2.5-flash-lite` on 2026-08-05 and now measures **~2,4s of
 * generation, ~6s end to end** (benched by `scripts/byoc-bench.mjs`, itera-api#37
 * — that PR added the bench and the latency log; the swap itself is env, and
 * itera-api#38 aligns the repo default to it). Against the old thresholds a
 * learner never got past the FIRST of four stages — the other three strings were
 * shipped, translated, and unreachable.
 *
 * So the stages are re-cut for ~6s. If the model changes again, re-measure and
 * re-cut: a narration calibrated to a latency the product no longer has is worse
 * than no narration, because it looks maintained.
 *
 * The bar never reaches 100%: it eases toward `CEILING` over `HORIZON`, because
 * arrival is an event we are told about, not one we can predict.
 */

export const BYOC_STAGE_KEYS = [
  'byoc.stage.reading',
  'byoc.stage.writing',
  'byoc.stage.responses',
  'byoc.stage.checking',
] as const;

const STAGE_STARTS_MS = [0, 1_500, 3_000, 4_500];
const HORIZON_MS = 9_000;
const CEILING = 0.93;

/** `stage` indexes `BYOC_STAGE_KEYS`; `percent` is 0–100, monotonic, asymptotic. */
export function byocProgress(elapsedMs: number): {
  stage: number;
  percent: number;
  seconds: number;
} {
  const ms = Math.max(0, elapsedMs);
  let stage = 0;
  for (let i = 0; i < STAGE_STARTS_MS.length; i++) if (ms >= STAGE_STARTS_MS[i]) stage = i;
  return {
    stage,
    percent: Math.round(CEILING * (1 - Math.exp(-3 * (ms / HORIZON_MS))) * 100),
    seconds: Math.floor(ms / 1000),
  };
}
