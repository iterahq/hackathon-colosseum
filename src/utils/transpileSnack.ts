/**
 * MOVED — `transpileSnack` now lives in `@iterahq/activities/code` (Fase C,
 * step 5), together with `sucrase`, which became a dependency OF THE PACKAGE.
 *
 * Kept as the app's import path so `src/utils/transpileSnack.test.ts` and
 * `src/test/codeSnackExercises.test.tsx` keep resolving it.
 */
export { transpileSnack } from '@iterahq/activities/code';
