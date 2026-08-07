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
 * `api`    ❌ — the kinds that need it (BYOC, the live sandbox, the AI-judged
 *               `document`) have NOT been extracted yet; they still call
 *               `@/api/iteraApi` directly, from inside the app. Wiring the port
 *               now would be a second, unused path to the same backend, and a
 *               reader would reasonably assume it was live. It lands with the
 *               rest of Fase C step 4, together with the kinds that consume it.
 * `storage`✅ — Fase C step 5. `useCodeSnack` no longer imports
 *               `codeSnapshot.service`; it reads and writes through the port,
 *               and the adapter below is what keeps the ON-DISK KEY AND
 *               BEHAVIOUR identical. See the ⚠️ block at the bottom.
 * `codeEditor` ✅ — Fase C step 5. Monaco stays in the app, and so do the two
 *               things that make this editor Itera's rather than anybody's:
 *               the caret CustomEvent the live class mirrors, and the
 *               TypeScript-worker configuration written against this repo's
 *               self-hosted Monaco vendoring.
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
import type { ActivityStoragePort } from '@iterahq/activities';
import { CODE_DRAFT_KEY_PREFIX, codeDraftActivityId } from '@iterahq/activities/code';
import { useI18n } from '@/i18n';
import { useAuth } from '@/auth/AuthContext';
import { CodeEditor } from '@/components/editor/CodeEditor';
import {
  clearCodeSnapshot,
  readCodeSnapshot,
  saveCodeSnapshot,
} from '@/services/codeSnapshot.service';
import { currentStorageScope, subscribeStorageScope } from '@/utils/storageScope';

/**
 * The draft-persistence adapter — the whole reason the `code` extraction did
 * not cost a single learner their work.
 *
 * The package hands this port a key it minted (`itera.code.snapshot:<id>`) and
 * a plain string. This adapter unwraps the key and delegates to
 * `codeSnapshot.service`, so what lands on disk is BYTE-FOR-BYTE what landed
 * there before step 5:
 *
 *   · the same key — `scopedKey('itera.code.snapshot', activityId)`, i.e.
 *     `itera.code.snapshot:<learner>:<activity>`. The learner scope is not
 *     decoration: the lab machines at Educar+ are shared, and an unscoped key
 *     served the next student the previous student's source;
 *   · the same `{ code, savedAt }` envelope, which `stageAnswerContent` reads
 *     when the professor pulls a learner to the stage;
 *   · the same `CODE_SNAPSHOT_EVENT` on every save AND every clear, which
 *     `useClassSession` and `LiveSessionPage` listen to for "this learner has
 *     work in progress" / "ainda não começou".
 *
 * A package that wrote its own key would have kept working, silently, while
 * every mid-lesson draft on disk became unreachable and the professor's picker
 * went quiet. `src/test/codeDraftKeyCompat.test.tsx` pins exactly that.
 *
 * Module-level and not a hook: it closes over nothing, so rebuilding it per
 * render would only churn the provider's memo.
 */
export const ITERA_ACTIVITY_STORAGE: ActivityStoragePort = {
  read: (key) => readCodeSnapshot(codeDraftActivityId(key))?.code ?? null,
  write: (key, value) => saveCodeSnapshot(codeDraftActivityId(key), value),
  clear: (key) => clearCodeSnapshot(codeDraftActivityId(key)),
};

/**
 * Fail loudly at DEV time if the package ever mints a key this adapter does not
 * recognise. `codeDraftActivityId` answers `''` for a foreign key and every
 * `codeSnapshot.service` function no-ops on an empty id — i.e. the failure mode
 * of a renamed prefix is a draft store that silently stops working, which is
 * the single worst outcome this port has.
 */
if (import.meta.env?.DEV && !CODE_DRAFT_KEY_PREFIX.startsWith('itera.code.snapshot')) {
  console.warn(
    '[IteraActivityHost] @iterahq/activities/code changed its draft-key prefix to',
    CODE_DRAFT_KEY_PREFIX,
    '- learners mid-lesson will not get their work back. See codeDraftKeyCompat.test.tsx.',
  );
}

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
    <ActivityProvider
      i18n={i18n}
      identity={identity}
      storage={ITERA_ACTIVITY_STORAGE}
      codeEditor={CodeEditor}
    >
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
 *
 * It carries the STORAGE port too, since step 5. A tree that renders a `code`
 * snack without it would autosave to the package's own default key instead of
 * the Player's scoped one — nothing throws, the test even passes, and the
 * assertion about where a learner's draft lives quietly stops describing the
 * app. It does NOT carry `codeEditor`: Monaco does not run in jsdom, so a test
 * that wants an editor injects its own stub (see
 * `src/test/support/codeActivityHost.tsx`).
 */
export function ActivityI18nBridge({ children }: { children: ReactNode }) {
  const i18n = useI18n();
  return (
    <ActivityProvider i18n={i18n} storage={ITERA_ACTIVITY_STORAGE}>
      {children}
    </ActivityProvider>
  );
}
