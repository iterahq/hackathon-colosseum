/**
 * MOVED — `AnswerExplanation` now lives in `@iterahq/activities` (Fase C, step 2:
 * the shared primitives).
 *
 * This file is the app's import path, kept so stories, tests and the kinds that
 * have NOT been extracted yet (sandbox · terminal · byoc · code) compile
 * unchanged. The plan's Fase C says exactly this: *"o app vira consumidor:
 * `src/components/branded/activity/*` é deletado e re-exportado do pacote"*.
 *
 * ⚠️ The bilingual-`explanation` fix from #309 travelled WITH the component and
 * is intact — including its "not a second implementation" promise, which the
 * move could easily have broken. See `packages/activities/src/components/AnswerExplanation.tsx`
 * and `resolveLocalizedText`, which now has exactly one implementation (in the
 * package) that `@/utils/resolveLocalizedSpec` re-exports.
 */
export { AnswerExplanation } from '@iterahq/activities';
