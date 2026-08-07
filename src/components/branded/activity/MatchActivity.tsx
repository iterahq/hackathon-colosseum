/**
 * MOVED — `MatchActivity` now lives in `@iterahq/activities` (Fase C, step 3:
 * the backend-free kinds).
 *
 * Kept as the app's import path so `ActivityRenderer.tsx`, the stories and the
 * tests keep resolving it — the extraction is meant to be invisible to the
 * Player, and a PR that also rewrote 15 import sites would have mixed "did the
 * move change behaviour?" with "did the rename change behaviour?".
 */
export { MatchActivity } from '@iterahq/activities';
