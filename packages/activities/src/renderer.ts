/**
 * The PUBLIC SURFACE of `@iterahq/activities` — `<ActivityRenderer>` and
 * `<ActivityProvider>` (Fase A of plan `20260803-itera-player-activities-lib`).
 *
 * This module is TYPES ONLY, and stays that way: it is the vocabulary the
 * package and its hosts share, so it must be importable without pulling a
 * single component into a bundle. Fase A wrote it, Fase C made it real —
 * `../ActivityRenderer.tsx` and `../context.tsx` are the implementations.
 *
 * The shape, verbatim from the plan:
 *
 *   <ActivityProvider i18n={…} api={…} identity={…} theme={…}>
 *     <ActivityRenderer
 *       activity={activity}
 *       onComplete={(correct, detail) => …}
 *       onEvent={(event) => …}
 *       reveal={false}
 *       priorAnswer={savedDetail}
 *     />
 *   </ActivityProvider>
 */
import type { ComponentType, ReactNode } from 'react';
import type { ActivityKind } from '@iterahq/activity-spec';
import type { ActivityEventHandler } from './events.js';
import type { ActivityRecordedAction } from './internal/actionRecorder.js';
import type {
  ActivityApiPort,
  ActivityCodeEditorProps,
  ActivityI18n,
  ActivityIdentity,
  ActivityLiveBufferPort,
  ActivityStoragePort,
  ActivityTheme,
} from './ports.js';

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
  /**
   * The ORDERED SEQUENCE of what the learner did to reach this answer — the
   * HOW, where `response` is the WHAT.
   *
   * Added in Fase C, when the kinds that emit it moved into the package. It was
   * already on the app's `ActivityCompleteDetail`; leaving it out of the
   * contract would have meant the extracted kinds either stopped emitting
   * (a behaviour change, which this phase forbids) or emitted through an
   * off-contract channel.
   *
   * ⚠️ Handing this up does NOT cause a write, exactly like `artifact` and
   * `response`. Only a learner-facing host persists — which is the boundary
   * that keeps an author test harness from turning curator traffic into
   * learner data.
   *
   * `type` is a plain `string` here on purpose: the vocabulary belongs to the
   * host's taxonomy (the Player narrows it to `LearnerActionType`), and a
   * library that shipped the taxonomy would be shipping Itera's telemetry
   * model. `src/test/activityTraceVocabulary.test.ts` asserts the names the
   * package emits are a subset of the ones the Player declares.
   */
  actions?: readonly ActivityRecordedAction[];
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

/**
 * Props of `<ActivityRenderer>` — the entire per-activity surface.
 *
 * Every extracted kind's props must be a SUBSET of this
 * (`src/test/activityPublicContract.test.ts` asserts it mechanically), which is
 * also why the host context is React context and not props: a kind that grew an
 * `i18n` prop would turn that assertion red.
 */
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
   * The learner's OWN PRIOR ANSWER, replayed — the completion this very
   * activity handed up in an earlier session, handed back down.
   *
   * ── What problem it solves ────────────────────────────────────────────────
   * `activity.status === 'done'` says the learner finished. It never said WHAT
   * they answered, so a `done` render drew a FRESH activity that was merely
   * greyed out: no option marked, no verdict, "Enviar" still sitting there. The
   * learner saw no trace of their own work, and the pedagogically valuable half
   * — WHICH answer they got wrong — was lost. Pass `priorAnswer` and the render
   * settles into the state it reached right after they submitted.
   *
   * ── Why it is not a state override, and not a test seam ───────────────────
   * The type is `ActivityCompletion`: literally the `detail` argument of
   * `onComplete(correct, detail)`. The contract is symmetric — the answer goes
   * UP through `onComplete`, and the host hands that same value back DOWN.
   *
   * The VERDICT is deliberately absent from that type and stays absent. A host
   * replays WHAT THE LEARNER PICKED (the `actions` trace's terminal
   * `answer_submitted`, which carries the authored ids); the kind re-grades it
   * with the identical expression a live submit uses. "Pretend it is correct"
   * cannot be expressed, and an id the spec does not declare restores nothing.
   * Plan `20260728-itera-activity-testing`, ADR-4 — the reasoning in full lives
   * in `./internal/priorAnswer.ts`.
   *
   * ── What it does NOT do ───────────────────────────────────────────────────
   * It never grades an unfinished activity. The verdict is gated on
   * `status === 'done'`, so replaying onto a `todo` row seeds the inputs and
   * nothing more — the learner can still answer. It never emits: a restored
   * render calls no `onComplete` and records no action, because nobody did
   * anything.
   *
   * ── Which kinds read it ───────────────────────────────────────────────────
   * `single_choice`, `multi_choice`, `order`, `match`. The kinds that never
   * grade (`concept`, `concept_reveal`, `video`, `diagram`) have no answer
   * state to seed and ignore it. `quiz` ignores it too, on purpose — see
   * CONTRACT.md.
   */
  priorAnswer?: ActivityCompletion;
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
   * Where the on-screen source is projected for a host that MIRRORS the learner
   * (the Itera Player's live class puts it on the room's screen). Omit ⇒ every
   * call is a no-op, which is the right answer for a host with no live class.
   *
   * Deliberately NOT folded into `storage`: publishing is not persisting, and
   * `ActivityLiveBufferPort` explains what breaks when the two are collapsed.
   */
  liveBuffer?: ActivityLiveBufferPort;
  /**
   * The editor the `code` kind renders (`@iterahq/activities/code`).
   *
   * One more optional member on the SAME context, not a second injection
   * mechanism — that is the whole reason it is here and not a registry, a
   * global, or a prop threaded through `<ActivityRenderer>`. Omit it and
   * `/code` renders a dependency-free `<textarea>`; the Itera Player injects
   * `src/components/editor/CodeEditor.tsx`, which keeps its live-class caret
   * mirroring and its self-hosted Monaco/TypeScript setup **in the app**.
   *
   * Typed here (rather than in the `/code` entrypoint) because
   * `ActivityHostContext` is one object and a host builds it in one place. It
   * costs the base bundle a type, which is erased — the base graph still
   * reaches nothing under `code/`, asserted by
   * `scripts/assert-entrypoint-isolation.mjs`.
   */
  codeEditor?: ComponentType<ActivityCodeEditorProps>;
  /**
   * Provider-level telemetry sink. Merged with the per-activity `onEvent`:
   * BOTH are called, provider first. A host wiring one exporter for a whole
   * screen should not have to thread `onEvent` through every renderer.
   */
  onEvent?: ActivityEventHandler;
  /**
   * Host-supplied renderers for kinds the package does not ship.
   *
   * This exists because Fase C extracted the six backend-free kinds and
   * DELIBERATELY left the rest behind (`code`/Monaco, the sandboxes, BYOC,
   * the AI-judged `document`) — see README.md for why each one stayed. Without
   * this seam the package's dispatcher would be a dead end for those kinds:
   * a host would have to stop using `<ActivityRenderer>` entirely the moment a
   * lesson contained one.
   *
   * A registered renderer WINS over a built-in of the same kind, which is what
   * lets a host try a replacement without forking the package.
   */
  renderers?: Partial<Record<ActivityKind, ComponentType<ActivityRendererProps>>>;
}

/** Props of `<ActivityProvider>` — the host context plus children. */
export interface ActivityProviderProps extends ActivityHostContext {
  children?: ReactNode;
}
