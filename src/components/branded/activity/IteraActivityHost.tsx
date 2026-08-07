/**
 * The Itera Player's ADAPTER to `@iterahq/activities` — the app side of ADR-3.
 *
 * Fase C moved the backend-free renderers into the package. A package cannot
 * import `@/i18n` or `@/auth/AuthContext`, so everything those renderers used to
 * reach for is injected here instead, once, at the top of the tree.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY AT THE TOP OF THE APP AND NOT AROUND `<ActivityRenderer>`
 * ─────────────────────────────────────────────────────────────────────────────
 * Activities are mounted from FOUR places, not one: `LessonPlayer`,
 * `LiveSessionPage`/`LiveActivityStage`, the author `ActivityTestHarness`, and
 * `ActivityTestPage`. Wrapping the dispatcher would have to be repeated at each,
 * and the failure mode of forgetting one is silent — the activity still renders,
 * just with the package's fallback context, i.e. an anonymous shuffle scope for
 * a signed-in learner. One mount at the root cannot be forgotten.
 *
 * It also keeps this PR out of `ActivityRenderer.tsx`, which two other open PRs
 * are editing right now — `packages/activities/CONTRACT.md` finding 4 is
 * explicit that touching that file mid-queue is how an extraction collides with
 * unrelated work.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS WIRED, AND WHAT IS DELIBERATELY NOT
 * ─────────────────────────────────────────────────────────────────────────────
 * `i18n`   ✅ — the Player's `useI18n()` already satisfies the port verbatim
 *               (asserted in `src/test/activityPublicContract.test.ts`).
 * `identity` ✅ — `authenticated` + `loading` + the learner scope. See below:
 *               this is the one that would have broken silently.
 * `api`    ❌ — the kinds that need it (`sandbox_scenario`, BYOC, the AI-judged
 *               `document`) have NOT been extracted yet; they still call
 *               `@/api/iteraApi` directly, from inside the app. Wiring the port
 *               now would be a second, unused path to the same backend, and a
 *               reader would reasonably assume it was live. It lands with
 *               Fase C step 4, together with the kinds that consume it.
 * `storage`❌ — same reasoning, for the `code` kind (Fase C step 5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ `identity.userId` IS THE SHUFFLE SEED, AND IT IS LOAD-BEARING
 * ─────────────────────────────────────────────────────────────────────────────
 * The choice/ordering kinds shuffle per (learner, activity). The learner half
 * used to come from `currentStorageScope()`, read inside the util — host
 * session state that a library cannot see. It is now passed here.
 *
 * Get this wrong and NOTHING FAILS: every learner in the app falls back to the
 * per-browser anonymous scope, each still gets a stable order, and the only
 * symptom is that the pedagogical reason the shuffle exists (two learners side
 * by side must not be able to copy "it's the third one") quietly stops holding.
 * `src/test/activityHostAdapter.test.tsx` pins it for that reason.
 *
 * It is SUBSCRIBED rather than read once, because the scope resolves
 * asynchronously and without changing the session object. Reading it once was
 * the first version of this file, and it turned the race the old code usually
 * won into a race it always lost: `IteraActivityHost` sits above everything, so
 * its first render happens long before the `current_itera_user_id` RPC returns,
 * and localStorage fires no event in the tab that wrote it. Every activity on
 * that page load then shuffled against the anonymous fallback. The e2e
 * characterization caught it ("a ordem inicial é ESTÁVEL para o mesmo aluno
 * entre montagens"); nothing else did, and nothing threw.
 */
import { useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ActivityProvider } from '@iterahq/activities';
import { useI18n } from '@/i18n';
import { useAuth } from '@/auth/AuthContext';
import { currentStorageScope, subscribeStorageScope } from '@/utils/storageScope';

export function IteraActivityHost({ children }: { children: ReactNode }) {
  const i18n = useI18n();
  const { session, loading } = useAuth();

  const authenticated = Boolean(session?.access_token);
  // SUBSCRIBED, not read once. See the ⚠️ block above and
  // `subscribeStorageScope` in `@/utils/storageScope` — the scope lands
  // asynchronously (an RPC resolves `itera.users.id`), and a plain read here
  // snapshots `null` at first paint and never learns better, because
  // localStorage does not notify the tab that wrote it.
  const scope = useSyncExternalStore(subscribeStorageScope, currentStorageScope, () => null);

  const identity = useMemo(
    () => ({ authenticated, loading, userId: scope }),
    [authenticated, loading, scope],
  );

  return (
    <ActivityProvider i18n={i18n} identity={identity}>
      {children}
    </ActivityProvider>
  );
}

/**
 * The i18n half of the adapter, for trees that are NOT the app.
 *
 * Tests and stories mount an activity with `<I18nProvider>` and nothing else —
 * no `AuthProvider`, no router — so they cannot use `IteraActivityHost`, which
 * reads the session. Without any provider the package falls back to its own
 * dictionary, which is byte-identical to the app's (asserted in
 * `activityDefaultI18n.test.tsx`) but is pinned to `pt`.
 *
 * That is invisible in most tests and NOT invisible in one class of them: a
 * test that switches the reader to `en` and asserts an English sentence.
 * `ActivityRevealAndExplanation.test.tsx` is exactly that — it caught this the
 * moment `AnswerExplanation` (the component #309 taught to resolve a bilingual
 * bag) crossed into the package, because the resolution reads `locale`.
 *
 * So: a locale-sensitive test or story mounts THIS. It is not a test-only
 * shim — it is the honest statement that a tree rendering activities owes them
 * an i18n port, and the app's own root supplies a richer one.
 */
export function ActivityI18nBridge({ children }: { children: ReactNode }) {
  const i18n = useI18n();
  return <ActivityProvider i18n={i18n}>{children}</ActivityProvider>;
}
