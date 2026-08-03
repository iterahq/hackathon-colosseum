/**
 * The PORTS of `@iterahq/activities` — everything an activity needs from its
 * host, expressed as interfaces the host implements (ADR-3, dependency
 * inversion, of plan `20260803-itera-player-activities-lib`).
 *
 * Today an activity reaches straight into the app: `@/i18n`, `@/api/iteraApi`,
 * `@/auth/AuthContext`, `@/services/artifact.service`. A library cannot do
 * that — it would know the Itera backend's URL, read the Itera session, and be
 * the Itera Player broken in two rather than a reusable unit.
 *
 * THE SIGNATURES BELOW MIRROR THE REAL ONES in `src/api/iteraApi.ts` /
 * `src/api/iteraByoc.ts`, with ONE deliberate change, described next.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE `token` PARAMETER IS GONE
 * ─────────────────────────────────────────────────────────────────────────────
 * Every backend call in the app today takes `token: string`, and every call
 * site gets it the same way: `useAuth().session?.access_token ?? ''`. Carrying
 * that through the port would mean the library handles a credential — it would
 * have to receive it, hold it in React state/props, and hand it back on every
 * call. There is no version of that which is not a credential-handling
 * library.
 *
 * So the host injects ports that are ALREADY BOUND to its own auth. The Itera
 * Player's adapter is a three-line closure over the existing functions:
 *
 *   const api = useMemo<ActivityApiPort>(() => {
 *     const token = session?.access_token ?? '';
 *     return {
 *       listSeeds,
 *       generateContext: (id, seed) => generateContext(id, seed, token),
 *       judge: (id, content, ctx) => judge(id, content, token, ctx),
 *       respond: (input, system) => respond(input, token, system),
 *       generateByoc: (id, seed) => generateByoc(id, seed, token),
 *       readByoc: (id) => readByoc(id, token),
 *     };
 *   }, [session?.access_token]);
 *
 * The package never sees a token, and `identity.authenticated` is all it needs
 * to decide whether calling a port can possibly succeed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY EVERY PORT METHOD IS OPTIONAL
 * ─────────────────────────────────────────────────────────────────────────────
 * ADR-3's consequence: "kinds que dependem de backend degradam explicitamente
 * quando a porta não é fornecida, em vez de estourar". An absent method is the
 * capability probe. It REPLACES `iteraApiConfigured()`, which today reads
 * `import.meta.env.VITE_ITERA_API_BASE` from inside the component tree — a
 * build-time env read that cannot travel into another app's bundle.
 *
 *   before: `iteraApiConfigured()`   after: `Boolean(api?.judge)`
 */
import type { GeneratedChoiceTree } from '@iterahq/activity-spec';

/* ────────────────────────────────── i18n ─────────────────────────────────── */

/** The locales the activity dictionary ships. Mirrors `Locale` in `src/i18n`. */
export type ActivityLocale = 'pt' | 'en';

/**
 * The i18n port — the single largest coupling in the folder (24 imports of
 * `@/i18n`).
 *
 * Only THREE members, and that is a measured claim, not a guess: every
 * `useI18n()` call in `src/components/branded/activity/**` destructures nothing
 * but `t` and `locale`, and `tText` is the bilingual-bag resolver the shared
 * primitives need. `setLocale`, `toggleLocale` and `registerPersistSink` are
 * app concerns (a locale switcher in the header, a DB write) and stay out.
 */
export interface ActivityI18n {
  /** Active locale. `sandbox_scenario`'s runtime reducers take this directly. */
  locale: ActivityLocale;
  /** Translate a key, interpolating `{name}` placeholders. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Resolve a bilingual jsonb bag (`{ pt, en }`) for the active locale. */
  tText: (bag: Record<string, string | undefined> | null | undefined) => string;
}

/* ────────────────────────────────── api ──────────────────────────────────── */

/** A seed business domain the learner can pick to contextualize an activity. */
export interface ActivitySeed {
  id: string;
  label: string;
}

/** The AI-generated, contextualized brief. */
export interface ActivityBrief {
  activity_id: string;
  seed: string;
  domain: string;
  scenario: string;
  proposed_er: string;
  prompt: string;
  model: string;
  generation_available: boolean;
}

/** One per-criterion heat-map cell from the judge. */
export interface ActivityJudgeCriterion {
  criterion: string;
  met: boolean;
  note?: string;
}

/** The judge verdict an activity renders. */
export interface ActivityJudgeVerdict {
  result_id: string;
  activity_id: string;
  attempt: number;
  status: 'passed' | 'failed' | 'pending';
  passed: boolean;
  score: number | null;
  feedback: string;
  criteria: ActivityJudgeCriterion[];
  model: string;
  progress_status: 'completed' | 'in_progress';
  judge_available: boolean;
}

/**
 * The free-form AI responder result (BYOC step 1 / `sandbox_scenario` live).
 * `responder_available: false` means the model degraded server-side and
 * `response` is a graceful fallback — not an error.
 */
export interface ActivityResponderResult {
  response: string;
  model: string;
  responder_available: boolean;
  /** Deterministic ground truth: did the learner's context produce a good response? */
  context_good?: boolean;
  /** Human-readable WHY behind `context_good`. */
  reason?: string;
}

/** One BYOC generation, as the host's backend serializes it. */
export interface ActivityByocGeneration {
  generation_id: string | null;
  activity_id: string;
  attempt: number | null;
  seed: string;
  mode: string;
  generated: GeneratedChoiceTree;
  fallback_used: boolean;
  attempts_used: number;
  model: string;
  degraded_reason: string | null;
  created_at: string | null;
  reused: boolean;
  generation_available: boolean;
  persisted: boolean;
}

/** The subset of a brief the judge wants back as context. */
export type ActivityJudgeContext = Pick<
  ActivityBrief,
  'seed' | 'domain' | 'scenario' | 'proposed_er'
>;

/**
 * The backend port. Every method optional — absence is the capability probe
 * (see the header). Implementations are expected to be already authenticated;
 * a rejected promise is a normal, renderable outcome.
 */
export interface ActivityApiPort {
  /** Seed domains for the contextualization picker. Open GET in the Itera impl. */
  listSeeds?: (activityId: string) => Promise<ActivitySeed[]>;
  /** Generate the contextualized brief for a chosen seed. */
  generateContext?: (activityId: string, seed: string) => Promise<ActivityBrief>;
  /** Submit the learner's open-scope artifact for AI judging. */
  judge?: (
    activityId: string,
    content: string,
    generatedContext?: ActivityJudgeContext,
  ) => Promise<ActivityJudgeVerdict>;
  /** The real AI responder — the learner's own input, answered by the model. */
  respond?: (input: string, system?: string) => Promise<ActivityResponderResult>;
  /** Build the BYOC tree from the learner's seed. Idempotent server-side. */
  generateByoc?: (activityId: string, seed: string) => Promise<ActivityByocGeneration>;
  /** Read back THIS learner's existing generation, or `null` when there is none. */
  readByoc?: (activityId: string) => Promise<ActivityByocGeneration | null>;
}

/* ──────────────────────────────── identity ───────────────────────────────── */

/**
 * The MINIMUM the activities need to know about who is answering.
 *
 * Measured, not assumed: all three `useAuth()` call sites under
 * `src/components/branded/activity/**` read exactly `session?.access_token`
 * (to authenticate a backend call) and `loading` (to avoid firing a call that
 * would 401 on an empty token). Nothing reads the user's email, id, roles,
 * tenant or provider. So the port carries neither a session nor a token:
 * `authenticated` is the boolean those three sites actually needed.
 */
export interface ActivityIdentity {
  /**
   * The host CAN authenticate a port call right now. Replaces the
   * `Boolean(session?.access_token)` check at every call site.
   */
  authenticated: boolean;
  /**
   * The host's auth is still settling. Activities must not call an
   * authenticated port while this is true. Replaces `useAuth().loading`.
   */
  loading?: boolean;
  /**
   * Opaque learner id, for TELEMETRY CORRELATION ONLY — never for
   * authorization. The library makes no access decision; the host's backend
   * does, from the credential the host bound into the ports.
   */
  userId?: string | null;
  /**
   * Who, besides the learner, can read what the learner produces here.
   *
   * This exists because of a coupling the plan's audit missed:
   * `ArtifactVisibilityNotice` calls `hasTenantAudience()` from
   * `@/services/artifact.service`, which queries Supabase DIRECTLY from inside
   * the activity tree — a second backend dependency, on a different backend
   * than `iteraApi`. A library cannot hold a Supabase client, so the host
   * RESOLVES the fact and passes the answer. Omitted ⇒ `'unknown'` ⇒ the
   * notice stays hidden, which is the component's existing fail-closed
   * behaviour ("never claim a reader exists when we cannot confirm it").
   */
  artifactAudience?: 'none' | 'tenant' | 'unknown';
}

/* ───────────────────────────────── theme ─────────────────────────────────── */

/**
 * Presentation hooks. NOT a theming engine.
 *
 * The activities are styled with Tailwind utilities against the brand tokens
 * that `@devfellowship/components` defines (`evergreen`, `clay`, `obsidiana`,
 * `border`, `card`, …). That package is a PEER DEPENDENCY, so the host owns the
 * Tailwind build and the token values — this port only lets it scope and tune
 * them. A host with no Tailwind pipeline renders unstyled; that is the known
 * risk in the plan, and Fase D is where it gets tested rather than asserted.
 */
export interface ActivityTheme {
  /** Light/dark intent when the host is not already driving it via a class. */
  appearance?: 'light' | 'dark';
  /** Extra class names on the activity root — the scoping seam. */
  className?: string;
  /** CSS custom properties set on the activity root (token overrides). */
  tokens?: Record<string, string>;
}

/* ──────────────────────────────── storage ────────────────────────────────── */

/**
 * Draft persistence for in-progress work.
 *
 * Third coupling the plan's table missed: the `code` kind autosaves the
 * learner's source through `@/services/codeSnapshot.service` (localStorage) so
 * a reload does not throw their work away. It is not a backend call, so it
 * never showed up in the `@/api/*` count — but it IS host state, and a host
 * that renders many activities will want to namespace or redirect it.
 *
 * Optional: omitted ⇒ the package's own localStorage default, i.e. exactly
 * today's behaviour.
 *
 * ⚠️ Read, write and clear travel TOGETHER. `UseCodeSnackCallbacks.onAutosave`
 * already documents why overriding only the write side hands the learner back
 * the wrong source on the next open.
 */
export interface ActivityStoragePort {
  read: (key: string) => string | null;
  write: (key: string, value: string) => void;
  clear: (key: string) => void;
}
