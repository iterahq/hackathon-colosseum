/**
 * The STABLE CRITERION ID — derived once from the authored text, then frozen.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY AN ID AT ALL, MEASURED RATHER THAN ASSUMED
 * ─────────────────────────────────────────────────────────────────────────────
 * `itera-api` returns a verdict whose `criteria[].criterion` is a STRING the
 * model wrote, so the only way to say "this verdict graded THAT authored
 * criterion" today is to match the two texts. Production says that does not
 * work: across the 8 recorded verdicts of activity `273e631e` — same activity,
 * same rubric, same model, two learner sessions six minutes apart on
 * 2026-07-17 — four verdicts echo all four authored criteria VERBATIM and four
 * rewrite all four. Text matching is a coin flip, and a coin flip that looks
 * like a lookup.
 *
 * (Plan 20260807-itera-activity-defs-registry-restructure §5.6.4 recorded
 * "4/4 rewritten" from a single verdict. The population is 4 of 8 verbatim,
 * 4 of 8 rewritten. Same conclusion, stronger: a text key would have PASSED on
 * half the evidence.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ THIS FILE IS A SPECIFICATION FOR PHASE 3a, NOT ITS IMPLEMENTATION
 * ─────────────────────────────────────────────────────────────────────────────
 * The plan puts `EvaluationSchema` / `CriterionIdSchema` / `readEvaluation()`
 * in `@iterahq/activity-spec` 0.10.0 (phase 3a) and has the phase-3e DML tool
 * compute each id ONCE and freeze it. Neither exists yet — `activity-spec` is
 * at 0.13.0 with no `evaluation` export. So the algorithm lives here, in the
 * baseline that has to run BEFORE any of that, and it is deliberately the same
 * algorithm §5.6.4 describes:
 *
 *     lowercase → strip diacritics → non-alphanumeric to `-` → collapse `-`
 *     → trim to 40 chars → disambiguate collisions with `-2`, `-3`, …
 *
 * When 3a lands, `activity-spec` must reproduce these ids EXACTLY for the 35
 * production rows pinned in `judgeGradingBaseline.test.tsx`, or the fold is
 * renaming criteria while claiming to move them. Deleting this file in favour
 * of the package import is the correct end state — but only once the ids match.
 *
 * ⚠️ The derivation reads `pt` first, `en` second. That order is not cosmetic:
 * the 35 rows mix `{ pt, en }` bags and raw strings in the SAME `criteria[]`
 * array (8 rows do), so a derivation keyed on `en` would produce a different id
 * for the raw-string entries and quietly split one criterion into two.
 */

/** The shape a rubric criterion arrives in: a raw string OR an i18n bag. */
export type RubricCriterion = string | { pt?: string; en?: string; [k: string]: unknown };

/** `CriterionIdSchema` from the plan: `^[a-z0-9][a-z0-9-]{1,39}$`. */
export const CRITERION_ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

/** The authored text of one criterion — `pt` first, `en` second, raw string as-is. */
export function criterionText(criterion: RubricCriterion): string {
  if (typeof criterion === 'string') return criterion;
  const pt = criterion.pt;
  const en = criterion.en;
  if (typeof pt === 'string' && pt.length > 0) return pt;
  if (typeof en === 'string' && en.length > 0) return en;
  return '';
}

/** The slug of ONE text, before collision handling. */
export function slugifyCriterion(text: string): string {
  const stripped = text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  // Trim to 40 THEN re-trim a trailing `-`, so a cut landing on a separator
  // does not leave an id that fails its own regex.
  return stripped.slice(0, 40).replace(/-+$/g, '') || 'criterion';
}

/**
 * The ordered ids of one rubric's `criteria[]`.
 *
 * Order is part of the identity: the fold rewrites the array, and an array that
 * comes back with the same members in a different order is a different grading
 * input as far as the prompt the model receives is concerned.
 */
export function criterionIds(criteria: readonly RubricCriterion[] | undefined): string[] {
  const seen = new Map<string, number>();
  return (criteria ?? []).map((c) => {
    const base = slugifyCriterion(criterionText(c));
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}

/**
 * The grading input reduced to what a fold MUST preserve, as one comparable
 * record. Anything the model is asked lives here; anything else does not.
 */
export interface GradingSignature {
  mode: 'ai-judge' | 'word-count';
  criterionIds: string[];
  artifact: boolean;
  minWords?: number;
}

export function gradingSignature(rubric: Record<string, unknown> | null | undefined): GradingSignature {
  const r = (rubric ?? {}) as {
    mode?: unknown;
    criteria?: RubricCriterion[];
    artifact?: unknown;
    min_words?: unknown;
  };
  const sig: GradingSignature = {
    mode: r.mode === 'ai-judge' ? 'ai-judge' : 'word-count',
    criterionIds: criterionIds(r.criteria),
    artifact: r.artifact !== undefined,
  };
  if (typeof r.min_words === 'number') sig.minWords = r.min_words;
  return sig;
}
