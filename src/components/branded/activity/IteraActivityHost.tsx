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
 * `api`    ✅ — Fase D, and it lands with the ONE kind that consumes it: the
 *               AI-judged `document`. BYOC and the live sandbox are still in
 *               the app and still call `@/api/iteraApi` directly; when they
 *               cross, they read the same port rather than a second one.
 *
 *               ⚠️ IT IS SUPPLIED CONDITIONALLY, AND THE CONDITION IS THE
 *               BEHAVIOUR. `DocumentActivity` chooses the AI-judged renderer
 *               with `Boolean(api?.judge)`, which REPLACED the app's
 *               `iteraApiConfigured()` — a build-time read of
 *               `import.meta.env.VITE_ITERA_API_BASE` that could never travel
 *               into another app's bundle. Handing the port over
 *               unconditionally would make that probe answer `true` on an
 *               unconfigured deploy, and a learner would get the judge screen
 *               with a backend that is not there. So the adapter withholds the
 *               object entirely when the base URL is unset, which is exactly
 *               what the env read used to say.
 *
 * `identity.artifactAudience` ✅ — Fase D. `ArtifactVisibilityNotice` used to
 *               query Supabase from inside the activity tree, on mount, once
 *               per document activity. The host resolves it instead — once per
 *               session, and only when authenticated, which is strictly fewer
 *               queries than before. Fail-closed is preserved: it stays
 *               `'unknown'` until the answer is in, and `'unknown'` hides the
 *               notice.
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
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ActivityProvider, useActivityHost } from '@iterahq/activities';
import type {
  ActivityApiPort,
  ActivityIdentity,
  ActivityLiveBufferPort,
  ActivityStoragePort,
} from '@iterahq/activities';
import {
  CODE_ATTEMPTS_KEY_PREFIX,
  CODE_BLANKS_DRAFT_KEY_PREFIX,
  CODE_DRAFT_KEY_PREFIX,
  codeAttemptsActivityId,
  codeBlanksDraftActivityId,
  codeDraftActivityId,
} from '@iterahq/activities/code';
import { useI18n } from '@/i18n';
import { useAuth } from '@/auth/AuthContext';
import { CodeEditor } from '@/components/editor/CodeEditor';
import {
  forgetCodeLiveBuffer,
  publishCodeLiveBuffer,
} from '@/services/codeLiveBuffer.service';
import {
  forgetTerminalLiveBuffer,
  publishTerminalLiveBuffer,
} from '@/services/terminalLiveBuffer.service';
import {
  forgetChatLiveBuffer,
  publishChatLiveBuffer,
} from '@/services/chatLiveBuffer.service';
import {
  generateContext,
  iteraApiConfigured,
  judge,
  listSeeds,
} from '@/api/iteraApi';
import {
  clearCodeSnapshot,
  clearGuidedBlanks,
  readCodeSnapshot,
  readGuidedBlanks,
  saveCodeSnapshot,
  saveGuidedBlanks,
} from '@/services/codeSnapshot.service';
import {
  clearCodeAttempts,
  readCodeAttempts,
  saveCodeAttempts,
} from '@/services/codeAttempts.service';
import { clearTextDraft, readTextDraft, saveTextDraft } from '@/services/textDraft.service';
import { hasTenantAudience } from '@/services/artifact.service';
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
  read: (key) => {
    if (isTextDraftKey(key)) return readTextDraft(textDraftActivityId(key));
    if (isBlanksKey(key)) return readGuidedBlanks(codeBlanksDraftActivityId(key));
    if (isAttemptsKey(key)) return readCodeAttempts(codeAttemptsActivityId(key));
    return readCodeSnapshot(codeDraftActivityId(key))?.code ?? null;
  },
  write: (key, value) => {
    if (isTextDraftKey(key)) return saveTextDraft(textDraftActivityId(key), value);
    if (isBlanksKey(key)) return saveGuidedBlanks(codeBlanksDraftActivityId(key), value);
    if (isAttemptsKey(key)) return saveCodeAttempts(codeAttemptsActivityId(key), value);
    return saveCodeSnapshot(codeDraftActivityId(key), value);
  },
  clear: (key) => {
    if (isTextDraftKey(key)) return clearTextDraft(textDraftActivityId(key));
    if (isBlanksKey(key)) return clearGuidedBlanks(codeBlanksDraftActivityId(key));
    if (isAttemptsKey(key)) return clearCodeAttempts(codeAttemptsActivityId(key));
    return clearCodeSnapshot(codeDraftActivityId(key));
  },
};

/**
 * Which of the slots a key names. Routed on the PREFIX and not on the
 * value's shape: all of them hold a string, and guessing from the content would
 * make a learner whose source happens to be JSON land in the wrong slot.
 */
/**
 * The key the package keeps a free-text answer in progress under
 * (`packages/activities/src/internal/textDraft.ts`). Spelled here because the
 * package does not export it; `IteraActivityHost.storage.test.tsx` writes a
 * draft through the real activity and fails if the two drift apart.
 */
const TEXT_DRAFT_KEY_PREFIX = 'itera.text.draft:';

function isTextDraftKey(key: string): boolean {
  return key.startsWith(TEXT_DRAFT_KEY_PREFIX);
}

function textDraftActivityId(key: string): string {
  return key.slice(TEXT_DRAFT_KEY_PREFIX.length);
}

/**
 * A subtree that SHOWS an activity which is not this person's own work in
 * progress: the classroom stage mirroring a learner, an author's test run.
 * Text drafts are neither read nor written there — otherwise the stage would
 * put each viewer's own half-written text under the staged learner's name, and
 * an author's "reset" would hand back what they had just typed.
 */
export function WithoutTextDrafts({ children }: { children: ReactNode }) {
  const host = useActivityHost();
  const inner = host.storage ?? ITERA_ACTIVITY_STORAGE;
  const storage = useMemo<ActivityStoragePort>(
    () => ({
      read: (key) => (isTextDraftKey(key) ? null : inner.read(key)),
      write: (key, value) => {
        if (!isTextDraftKey(key)) inner.write(key, value);
      },
      clear: (key) => {
        if (!isTextDraftKey(key)) inner.clear(key);
      },
    }),
    [inner],
  );
  return (
    <ActivityProvider {...host} storage={storage}>
      {children}
    </ActivityProvider>
  );
}

function isBlanksKey(key: string): boolean {
  return key.startsWith(CODE_BLANKS_DRAFT_KEY_PREFIX);
}

function isAttemptsKey(key: string): boolean {
  return key.startsWith(CODE_ATTEMPTS_KEY_PREFIX);
}

/**
 * The projection adapter — what the professor's stage puts on the room's screen.
 *
 * Straight pass-through, and it is allowed to be: `codeLiveBuffer.service` was
 * written to the port's signature, so nothing is unwrapped here the way
 * `ITERA_ACTIVITY_STORAGE` unwraps a draft key. The `activityId` arrives raw
 * because a live buffer needs no key at all — it never touches disk, so it never
 * needs the learner scope that makes the draft key safe on a shared machine.
 *
 * Why this is a SECOND port and not more work for the storage one is in
 * `ActivityLiveBufferPort`: publishing is not persisting. The short version is
 * that the draft is deliberately withheld until the first keystroke, so before
 * step 5 the stage had nothing to project for a learner who had only opened the
 * exercise — the defect measured in the 2026-08-06 class.
 *
 * Module-level for the same reason as the storage adapter: it closes over
 * nothing, and rebuilding it per render would churn the provider's memo — which
 * here would also re-run the publish effect inside every mounted snack.
 */
export const ITERA_ACTIVITY_LIVE_BUFFER: ActivityLiveBufferPort = {
  publish: publishCodeLiveBuffer,
  publishTerminal: publishTerminalLiveBuffer,
  publishChat: publishChatLiveBuffer,
  // ⚠️ FORGET CLEARS ALL THREE BUFFERS, and it has to. The port has one `forget`
  // for three publish channels, and an activity is one kind — so a `forget` that
  // only reached the code map would leave a terminal screen (or a learner's
  // conversation) projected after they walked away from it, which is the exact
  // staleness the call exists to prevent. Each is a no-op on a key it does not
  // hold.
  //
  // ⚠️ A NEW PUBLISH CHANNEL MUST BE ADDED HERE TOO. The chat one carries the
  // learner's own prose, so a channel left out of this list does not degrade a
  // projection — it keeps someone's words on the projector after they left.
  forget: (activityId: string) => {
    forgetCodeLiveBuffer(activityId);
    forgetTerminalLiveBuffer(activityId);
    forgetChatLiveBuffer(activityId);
  },
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

  // Who, besides the learner, can read what they produce. Resolved HERE because
  // a library cannot hold a Supabase client (ports.ts names this component's
  // consumer by name). `'unknown'` is the honest starting value and the
  // fail-closed one: the notice stays hidden until we can confirm a reader.
  const artifactAudience = useArtifactAudience(authenticated);
  const api = useIteraActivityApi(session?.access_token ?? '');

  const identity = useMemo<ActivityIdentity>(
    () => ({ authenticated, loading, userId: scope, artifactAudience }),
    [authenticated, loading, scope, artifactAudience],
  );

  return (
    <ActivityProvider
      i18n={i18n}
      api={api}
      identity={identity}
      storage={ITERA_ACTIVITY_STORAGE}
      liveBuffer={ITERA_ACTIVITY_LIVE_BUFFER}
      codeEditor={CodeEditor}
    >
      {children}
    </ActivityProvider>
  );
}

/**
 * The backend adapter — the port's own header sketches this closure almost
 * verbatim, with one addition that is load-bearing.
 *
 * ⚠️ IT IS `undefined` WHEN THE API IS NOT CONFIGURED, and that is not a
 * micro-optimisation. `DocumentActivity` picks the AI-judged renderer off
 * `Boolean(api?.judge)`, which REPLACED the component's inline
 * `iteraApiConfigured()`. Supplying a port that would fetch against an empty
 * base URL turns that probe into a permanent `true`, and the learner gets a
 * judge screen backed by nothing — on exactly the deploys (previews, local dev,
 * any host without `VITE_ITERA_API_BASE`) where the app used to fall through to
 * the reflection renderer. Same expression, same answer; it has only moved to
 * the one place allowed to know about `import.meta.env`.
 *
 * ⚠️ NO TOKEN CROSSES THE BOUNDARY. The two methods that need one close over it
 * here, so the package receives functions that are ALREADY authenticated and
 * never a credential it would have to hold. That is the entire reason
 * `ActivityApiPort` dropped the `token` parameter every `iteraApi` function
 * takes.
 *
 * Memoised on the token alone: a new object on every render would churn the
 * provider's context for no change in behaviour. It does NOT remount anything —
 * a context value change re-renders consumers, it does not reset their state —
 * so a token refresh mid-answer is invisible to the learner.
 */
function useIteraActivityApi(token: string): ActivityApiPort | undefined {
  return useMemo<ActivityApiPort | undefined>(
    () =>
      iteraApiConfigured()
        ? {
            listSeeds,
            generateContext: (activityId, seed) => generateContext(activityId, seed, token),
            judge: (activityId, content, ctx) => judge(activityId, content, token, ctx),
          }
        : undefined,
    [token],
  );
}

/**
 * Resolve `artifactAudience` once per authenticated session.
 *
 * ⚠️ IT MUST NOT RUN FOR AN ANONYMOUS VISITOR. `hasTenantAudience()` resolves
 * `itera.users.id` and then the tenant — two round trips whose answer for a
 * guest is always `false`. Gating on `authenticated` makes this strictly fewer
 * queries than the component-level version it replaces (which fired once per
 * document activity mounted, guest or not), rather than more.
 *
 * ⚠️ THE ERROR PATH IS THE PRODUCT DECISION, not an oversight: a rejected
 * promise leaves the value at `'unknown'`, which HIDES the notice. Claiming
 * "your employer can read this" when we could not confirm it teaches the
 * learner to distrust the notice on the day it is true.
 */
function useArtifactAudience(authenticated: boolean): ActivityIdentity['artifactAudience'] {
  const [audience, setAudience] =
    useState<ActivityIdentity['artifactAudience']>('unknown');

  useEffect(() => {
    if (!authenticated) {
      setAudience('unknown');
      return;
    }
    let alive = true;
    hasTenantAudience()
      .then((yes) => {
        if (alive) setAudience(yes ? 'tenant' : 'none');
      })
      .catch(() => {
        /* stay 'unknown' — never claim a reader exists when we cannot confirm it */
      });
    return () => {
      alive = false;
    };
  }, [authenticated]);

  return audience;
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
 *
 * The LIVE BUFFER rides along for the identical reason, and the failure is even
 * quieter: without the port the package's publish is a no-op, so a test that
 * asks what the stage would project reads `null` and reports "o aluno não
 * começou" — a wrong answer that looks exactly like a correct one.
 */
export function ActivityI18nBridge({ children }: { children: ReactNode }) {
  const i18n = useI18n();
  return (
    <ActivityProvider
      i18n={i18n}
      storage={ITERA_ACTIVITY_STORAGE}
      liveBuffer={ITERA_ACTIVITY_LIVE_BUFFER}
    >
      {children}
    </ActivityProvider>
  );
}
