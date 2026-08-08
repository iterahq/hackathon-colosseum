/**
 * MOVED — `DocumentActivity` now lives in `@iterahq/activities` (Fase D: the
 * three kinds that were inline functions in this app's dispatcher).
 *
 * Kept as the app's import path so `ActivityRenderer.tsx`, the stories and the
 * tests keep resolving it — the extraction is meant to be invisible to the
 * Player, exactly as Fase C's five steps were.
 *
 * The three renderers behind this kind (read-only · reflection · AI-judged) all
 * crossed. The AI-judged one used to import `@/api/iteraApi` and read
 * `useAuth()` directly; it now goes through the `api` port, which
 * `IteraActivityHost` binds — and binds ONLY when `iteraApiConfigured()`, so
 * the build-time env read that used to select the variant produces the same
 * answer through a runtime capability probe.
 */
export { DocumentActivity } from '@iterahq/activities';
