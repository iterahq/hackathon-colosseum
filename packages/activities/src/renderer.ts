/**
 * The PUBLIC SURFACE of `@iterahq/activities` — `<ActivityRenderer>` and
 * `<ActivityProvider>` (Fase A of plan `20260803-itera-player-activities-lib`).
 *
 * This module is TYPES ONLY. Nothing here renders, nothing here imports a
 * component, and nothing in the app imports it yet — Fase A defines the
 * boundary, Fase B moves the code across it. Zero behaviour change is the
 * exit criterion of this phase, and "no runtime code" is how that is
 * guaranteed rather than argued.
 *
 * The shape, verbatim from the plan:
 *
 *   <ActivityProvider i18n={…} api={…} identity={…} theme={…}>
 *     <ActivityRenderer
 *       activity={activity}
 *       onComplete={(correct, detail) => …}
 *       onEvent={(event) => …}
 *       reveal={false}
 *     />
 *   </ActivityProvider>
 */
import type { ReactNode } from 'react';
import type { ActivityKind } from '@iterahq/activity-spec';
import type { ActivityEventHandler } from './events';
import type {
  ActivityApiPort,
  ActivityI18n,
  ActivityIdentity,
  ActivityStoragePort,
  ActivityTheme,
} from './ports';

/* ────────────────────────────── the activity ─────────────────────────────── */

/** Learner progress on one activity. Mirrors `ProgressStatus`. */
export type PortableActivityStatus = 'todo' | 'in_progress' | 'done';

/**
 * The activity row, reduced to what the RENDERERS actually read.
 *
 * Five fields, and that number is measured: a grep of `activity.<field>` across
 * `src/components/branded/activity/**` returns `spec`, `status`, `id`, `kind`
 * and `rubric` — and nothing else. `lessonId`, `ordinal`, `publishStatus` and
 * `artifactPolicy` are on the app's `Activity` type but are read by the PLAYER
 * and the author canvas, never by an activity. Keeping them out of the contract
 * is the difference between "a portable unit" and "the Itera content model,
 * exported".
 *
 * The app's `Activity` is assignable to this by construction (it is a
 * superset), which is what `src/test/activityContract.test.ts` asserts — so the
 * Player passes its existing rows straight through, unchanged.
 */
export interface PortableActivity {
  id: string;
  kind: ActivityKind;
  /** Validated against the kind's Zod schema by `@iterahq/activity-spec`. */
  spec: Record<string, unknown>;
  /** Authored grading configuration. `null` when the kind grades itself. */
  rubric?: Record<string, unknown> | null;
  /** Derived from the host's progress store, when the host tracks progress. */
  status?: PortableActivityStatus;
}

/* ──────────────────────────── the completion ─────────────────────────────── */

/** What a learner can PRODUCE. Mirrors `ArtifactType`. */
export type PortableArtifactType = 'code' | 'text' | 'document' | 'diagram' | 'site';

/**
 * Content the learner produced, handed UP so the host can persist it.
 *
 * The activity says WHAT it made, never HOW it is stored — that boundary
 * already exists in the app (it is what keeps the author test-harness from
 * writing to the DB) and the library inherits it unchanged.
 */
export interface PortableProducedArtifact {
  type: PortableArtifactType;
  content: string;
  filename: string;
  /** Defaults to `text/plain`. */
  mimeType?: string;
}

/**
 * The optional richer verdict an activity hands up alongside `correct`.
 *
 * Preserved EXACTLY as it is today (`ActivityCompleteDetail` in
 * `src/components/branded/activity/activityFeedbackKinds.ts`) — every field
 * optional, so every `onComplete(correct)` caller that ignores it stays valid.
 */
export interface ActivityCompletion {
  /** Overrides the default correct/incorrect headline. */
  message?: string;
  /** A secondary explanation line (reveal recap / judge WHY). */
  explanation?: string;
  /** Content worth keeping, for a host that persists learner work. */
  artifact?: PortableProducedArtifact;
  /** Plain-text summary of the answer, for kinds that author no file. */
  response?: string;
}

/**
 * THE contract. Unchanged from today's `ActivityRenderer` — the `detail`
 * argument has been carried since PR #191.
 *
 * Do not widen it into a settlement object. Every consumer in the app, every
 * story and every test speaks `(correct, detail?)`, and a library whose central
 * callback changes shape in its own extraction has not extracted anything.
 */
export type ActivityCompleteHandler = (
  correct: boolean,
  detail?: ActivityCompletion,
) => void;

/* ──────────────────────────── the components ─────────────────────────────── */

/** Props of `<ActivityRenderer>` — the entire per-activity surface. */
export interface ActivityRendererProps {
  /** The row to render. Already validated by `@iterahq/activity-spec`. */
  activity: PortableActivity;
  /** Settled verdict, plus whatever the learner produced. */
  onComplete: ActivityCompleteHandler;
  /**
   * Telemetry (ADR-4). Optional — an activity behaves identically without it.
   * See `./events.ts` for why the payload is open in v1.
   */
  onEvent?: ActivityEventHandler;
  /**
   * Show the correct answer without a submission (timer stopped or expired).
   * A DISPLAY mode, not player chrome: the host decides when, the activity
   * decides what "revealed" looks like for its kind.
   */
  reveal?: boolean;
  /**
   * Live class vs. self-paced. Read today by `concept` (stepped instruction
   * panel) and `code` (the "seguir mesmo assim" skip after a failed practical).
   *
   * It stays in the contract despite ADR-1 ("nível de activity, não de
   * player") because it is not chrome — no bar, no hearts, no navigation. It
   * is a rendering mode a host can be in, and dropping it would silently
   * change what those two kinds render.
   */
  live?: boolean;
}

/**
 * Everything the activities need from the host, in one object.
 *
 * `i18n` is the only REQUIRED member: without it, every kind renders raw
 * translation keys — the 24-import coupling has no fail-open. Everything else
 * is optional and degrades explicitly (ADR-3).
 */
export interface ActivityHostContext {
  /** REQUIRED. Translation + locale. */
  i18n: ActivityI18n;
  /** Backend ports, already bound to the host's auth. Omit ⇒ backend-backed kinds degrade. */
  api?: ActivityApiPort;
  /** Who is answering, reduced to what activities read. Omit ⇒ treated as anonymous. */
  identity?: ActivityIdentity;
  /** Scoping and token overrides. Omit ⇒ inherit the host's Tailwind theme. */
  theme?: ActivityTheme;
  /** Draft persistence for the `code` kind. Omit ⇒ localStorage, as today. */
  storage?: ActivityStoragePort;
  /**
   * Provider-level telemetry sink. Merged with the per-activity `onEvent`:
   * BOTH are called, provider first. A host wiring one exporter for a whole
   * screen should not have to thread `onEvent` through every renderer.
   */
  onEvent?: ActivityEventHandler;
}

/** Props of `<ActivityProvider>` — the host context plus children. */
export interface ActivityProviderProps extends ActivityHostContext {
  children?: ReactNode;
}
