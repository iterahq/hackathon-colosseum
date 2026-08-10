/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 3a HAS LANDED — and this is the condition `criterionId.ts` set for it
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `src/test/support/criterionId.ts` was written as a SPECIFICATION for a package
 * feature that did not exist yet. Its header says so in as many words:
 *
 *     "`activity-spec` is at 0.13.0 with no `evaluation` export. So the
 *      algorithm lives here, in the baseline that has to run BEFORE any of
 *      that. […] When 3a lands, `activity-spec` must reproduce these ids
 *      EXACTLY for the 35 production rows pinned in
 *      `judgeGradingBaseline.test.tsx`, or the fold is renaming criteria while
 *      claiming to move them."
 *
 * `@iterahq/activity-spec@0.15.0` is 3a. It exports `EvaluationSchema`,
 * `CRITERION_ID_RE`, `slugifyCriterion`, `criterionText`, `criterionIds`,
 * `evaluationSha` and `readEvaluation`.
 *
 * The package's own release notes claim the ids match the ones PR #331 pinned.
 * That claim is checked HERE, against THIS repo's copy of the 35 rows, because
 * a claim verified only in the publisher's repo is not a guarantee for the
 * consumer — it is the same file compared with itself.
 *
 * ⚠️ This is the precondition, not the migration. Deleting `criterionId.ts` in
 * favour of the package import is the correct end state and it is phase 3b/3c —
 * `readEvaluation` is NOT wired into any renderer by this bump. What this file
 * establishes is that the swap is now SAFE to make, and it will go red the day
 * a package change would rename a production criterion.
 */
import { describe, expect, it } from 'vitest';
import {
  CRITERION_ID_RE as PKG_CRITERION_ID_RE,
  criterionIds as pkgCriterionIds,
  criterionText as pkgCriterionText,
  readEvaluation as pkgReadEvaluation,
  safeParseActivitySpec,
} from '@iterahq/activity-spec';
import {
  criterionIds as localCriterionIds,
  criterionText as localCriterionText,
  slugifyCriterion as localSlugify,
  type RubricCriterion,
} from './support/criterionId';
import baseline from './fixtures/production-grading-inputs.json';
import { isExerciseActivity } from '@/utils/isExerciseActivity';

interface BaselineRow {
  source: string;
  ref: string;
  kind: string;
  rubric: { mode?: string; criteria?: RubricCriterion[]; min_words?: number } | null;
}
const rows = (baseline as unknown as { rows: BaselineRow[] }).rows;

describe('0.15.0 reproduces the frozen criterion ids of the 35 production rows', () => {
  it('has the whole captured population, so the sweep below cannot be empty', () => {
    // Vacuity guard. Every assertion in this file iterates `rows`; an empty or
    // truncated fixture would make all of them pass while checking nothing.
    expect(rows).toHaveLength(35);
    const withCriteria = rows.filter((r) => (r.rubric?.criteria ?? []).length > 0);
    expect(withCriteria.length).toBeGreaterThan(0);
  });

  it.each(rows.map((r, i) => [`${r.source}/${r.ref}#${i}`, r] as const))(
    '%s — package ids are IDENTICAL to the pinned local ids',
    (_label, row) => {
      const criteria = row.rubric?.criteria ?? [];
      // Order included: the fold rewrites the array, and the same members in a
      // different order are a different grading input to the model.
      expect(pkgCriterionIds(criteria)).toEqual(localCriterionIds(criteria));
    }
  );

  it('agrees on the pt-first text rule, criterion by criterion', () => {
    // The id is only as stable as the text it is derived from. 8 of the 35 rows
    // mix `{pt,en}` bags and raw strings inside ONE `criteria[]`, so a package
    // that read `en` first would split a criterion in two — and would still
    // produce well-formed ids while doing it.
    let compared = 0;
    for (const row of rows) {
      for (const c of row.rubric?.criteria ?? []) {
        expect(pkgCriterionText(c)).toBe(localCriterionText(c));
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(0);
  });

  it('every derived id satisfies the package regex, and both regexes agree', () => {
    for (const row of rows) {
      for (const id of pkgCriterionIds(row.rubric?.criteria ?? [])) {
        expect(id, `${row.source}/${row.ref}: ${id}`).toMatch(PKG_CRITERION_ID_RE);
      }
    }
  });

  it('disambiguates a genuine collision the same way — the case production does not contain', () => {
    // NOT VACUOUS by construction: the 35 rows may hold no duplicate text, so
    // the `-2` suffix path above could go unexercised. This forces it, because
    // a package that dropped collision handling would silently merge two
    // criteria into one id and every row-level assertion would still pass.
    const collide: RubricCriterion[] = ['Explica com clareza', 'Explica com clareza'];
    expect(pkgCriterionIds(collide)).toEqual(localCriterionIds(collide));
    expect(pkgCriterionIds(collide)[0]).not.toBe(pkgCriterionIds(collide)[1]);
    // And the shared slug really is the base both sides derived from.
    expect(pkgCriterionIds(collide)[0]).toBe(localSlugify('Explica com clareza'));
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ TRIPWIRE — the two branch selectors still read `rubric`, and ONLY `rubric`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `readEvaluation()` exists in 0.15.0 to stop two copy-pasted selectors drifting
 * apart:
 *
 *   • `packages/activities/src/kinds/DocumentActivity.tsx` — ai-judge vs
 *     reflection vs read-only
 *   • `src/utils/isExerciseActivity.ts` — does this row count as an exercise
 *
 * Neither is wired to it yet, and this bump deliberately does not wire them: the
 * package sequences the consumers in 3b/3c and the DATA in 3e, "in that order
 * and never together".
 *
 * That order is load-bearing, and this file makes the reason measurable instead
 * of a sentence in a changelog. Both selectors take the ai-judge branch on
 * `rubric.mode === 'ai-judge'` and nothing else. So a row whose grading has
 * moved to `spec.evaluation` with the `rubric` column emptied — exactly what 3e
 * creates — takes the ai-judge branch in NEITHER place today.
 *
 * The concrete consequence, stated no wider than it is: such a `document`
 * renders as a plain word-count reflection instead of `AiJudgeDocumentActivity`.
 * The learner gets no AI grading and no criteria feedback, and completion is
 * gated on any non-empty text, because `min_words` reads 0. Nothing throws.
 *
 * ⚠️ Deliberately NOT claimed: the row does not vanish from the podium.
 * `isWrittenDocument` also returns true on a truthy `spec.prompt`, which
 * `DocumentSpecSchema` makes REQUIRED — so an evaluation-only document still
 * counts as an exercise. That is asserted below rather than assumed, because it
 * is the half of the blast radius that is already safe.
 *
 * This is a tripwire, NOT a desired invariant. Delete it when 3b moves the
 * selectors onto `readEvaluation`.
 */
describe('TRIPWIRE: `spec.evaluation` alone does not yet drive any renderer branch', () => {
  const evaluation = {
    mode: 'ai-judge' as const,
    criteria: [{ id: 'clareza', text: 'Escreve com clareza', weight: 1 }],
    passMark: 60,
  };
  /** The row shape phase 3e creates: graded in `spec`, `rubric` column emptied. */
  const row = {
    kind: 'document' as const,
    spec: { prompt: 'Descreva o que você aprendeu.', evaluation },
    rubric: null,
  };

  it('the schema accepts the evaluation-only `document` 3e will create', () => {
    // `prompt` is REQUIRED on `document`, so the realistic 3e row keeps it. The
    // row is already storable — which is why the tripwire is needed BEFORE the
    // data moves, not after.
    expect(safeParseActivitySpec('document', row.spec).success).toBe(true);
  });

  it('`readEvaluation` finds it — the package half of the fold is READY', () => {
    expect(pkgReadEvaluation(row)?.mode).toBe('ai-judge');
  });

  it('…and still falls back to the legacy `rubric` column — so 3b can ship before 3e', () => {
    const found = pkgReadEvaluation({
      spec: { prompt: 'p' },
      rubric: { mode: 'ai-judge', criteria: ['Escreve com clareza'] },
    });
    expect(found?.mode).toBe('ai-judge');
  });

  it('🔴 but the RENDERER selector still sees no ai-judge — the branch data is empty', () => {
    // `DocumentActivity` branches on `rubric.mode === 'ai-judge'`, then on
    // `spec.prompt || min_words > 0`. Asserted at the data the branch reads,
    // which is what a renderer test would exercise indirectly and less clearly.
    const rubric = (row.rubric ?? {}) as { mode?: string; min_words?: number };
    expect(rubric.mode).toBeUndefined();
    expect(typeof rubric.min_words === 'number' ? rubric.min_words : 0).toBe(0);
    // ⇒ ai-judge branch NOT taken; reflection branch taken via `spec.prompt`,
    //   with a word floor of 0. That is the silent downgrade.
    expect(Boolean(row.spec.prompt)).toBe(true);
  });

  it('✅ and it does NOT drop off the podium — `isExerciseActivity` still says yes', () => {
    // The half that is already safe, pinned so the tripwire above is not read
    // as a wider outage than it is.
    expect(isExerciseActivity(row as unknown as Parameters<typeof isExerciseActivity>[0])).toBe(true);
  });
});
