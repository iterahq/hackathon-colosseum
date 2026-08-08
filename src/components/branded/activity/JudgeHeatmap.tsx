/**
 * MOVED — `JudgeHeatmap` now lives in `@iterahq/activities` (Fase D).
 *
 * It crossed with the AI-judged `document`, which is its only production caller.
 * This file is the app's import path, kept so `src/stories/JudgeHeatmap.stories.tsx`
 * resolves unchanged.
 *
 * ⚠️ The verdict type it takes is now `ActivityJudgeVerdict` (the port's mirror
 * of `JudgeVerdict` in `@/api/iteraApi`), not `JudgeVerdict` itself. The two are
 * asserted MUTUALLY assignable in `src/test/activityPublicContract.test.ts`, so
 * every existing call site type-checks — and if the wire shape ever changes on
 * one side only, that assertion is what goes red.
 */
export { JudgeHeatmap } from '@iterahq/activities';
