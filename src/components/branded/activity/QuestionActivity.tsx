/**
 * MOVED — `QuestionActivity` lives in `@iterahq/activities` (it was born there,
 * 2026-08-28, ADR-6 of `20260828-itera-learning-engine-v1`).
 *
 * Kept as the app's import path for the same reason every other kind has one:
 * `ActivityRenderer.tsx`, the stories and the tests resolve kinds from
 * `./<Kind>Activity`, and a kind that broke that convention would be the one
 * nobody finds.
 *
 * `QUESTION_OTHER_ID` travels with it: the plans-app adapter (M7) has to spell
 * the "Outro" sentinel exactly as the renderer records it, and a sentinel
 * re-typed at a call site is a sentinel that can be re-typed wrongly.
 */
export { QuestionActivity, QUESTION_OTHER_ID } from '@iterahq/activities';
