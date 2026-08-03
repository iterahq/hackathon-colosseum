/**
 * The shape of the BYOC waiting screen, as a pure function of elapsed time.
 *
 * A real generation takes 26–73s (measured in prod). A single pulsing icon for
 * that long reads as "frozen", and a learner who reloads gets the SAME tree back
 * (generation is idempotent per learner+activity) having learnt nothing from the
 * wait. So the wait narrates itself instead.
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

const STAGE_STARTS_MS = [0, 10_000, 28_000, 55_000];
const HORIZON_MS = 75_000;
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
