/**
 * MOVED — the `code` kind now lives in `@iterahq/activities/code` (Fase C,
 * step 5: the heavy kind, behind its own entrypoint per ADR-5).
 *
 * Renamed on the way: the package calls it `CodeActivity`, like every other
 * kind there. The app keeps the historical name so `ActivityRenderer.tsx`, the
 * stories and the tests keep resolving it — the extraction is meant to be
 * invisible to the Player, exactly as steps 1-4 were.
 *
 * ⚠️ Importing this path pulls the `/code` entrypoint. That is correct HERE
 * (the Player renders code snacks) and is exactly what a consumer that does not
 * must avoid — see `packages/activities/src/code/index.ts`.
 */
export { CodeActivity as CodeSnackActivity } from '@iterahq/activities/code';
