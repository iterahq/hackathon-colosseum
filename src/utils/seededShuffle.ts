/**
 * MOVED — the deterministic Fisher–Yates shuffle now lives in
 * `@iterahq/activities` (Fase C, step 1: pure logic).
 *
 * Kept as a re-export because `replaySession.ts` and `seededShuffle.test.ts`
 * import it from here, and neither has anything to do with the extraction.
 */
export { seededShuffle } from '@iterahq/activities';
