/**
 * MOVED — `useCodeSnack` now lives in `@iterahq/activities/code` (Fase C,
 * step 5).
 *
 * Its persistence no longer calls `@/services/codeSnapshot.service` directly:
 * it goes through `ActivityStoragePort`, and `IteraActivityHost` injects the
 * adapter that keeps the on-disk key and behaviour exactly what they were.
 */
export { useCodeSnack } from '@iterahq/activities/code';
