/**
 * `onEvent` — the telemetry emission point of `@iterahq/activities` (ADR-4 of
 * plan `20260803-itera-player-activities-lib`).
 *
 * WHY IT IS LOOSE IN v1: the telemetry SCHEMA belongs to Fase 1 of the parent
 * plan (`20260803-itera-learning-control-plane-prototipo`) and does not exist
 * yet. The *emission point*, however, has to exist from the first consumer —
 * a host app that adopts the library before the schema lands would otherwise be
 * a permanent blind spot, and un-instrumented data is lost for good.
 *
 * HOW IT HARDENS WITHOUT BREAKING (the whole point of the shape below):
 *
 *  1. `type` is `KnownActivityEventType | AnyOtherString`. Adding a literal to
 *     `KnownActivityEventType` is ADDITIVE — every existing emitter and every
 *     existing handler keeps compiling, because arbitrary strings were always
 *     accepted. The literals only buy autocomplete.
 *  2. `payload` stays `Record<string, unknown>` on `ActivityEvent` FOREVER.
 *     Typed payloads arrive as an OVERLAY (`ActivityEventPayloads` +
 *     `TypedActivityEvent<T>`) that consumers opt into at the call site. The
 *     base type is never narrowed, so no consumer is ever broken by a schema
 *     that got stricter.
 *  3. New top-level fields are added OPTIONAL. Never required.
 *
 * Anything that cannot be done additively is a MAJOR of the package, and the
 * ADR-4 promise ("aceitável: é aditivo, não breaking") is the thing being
 * traded away — say so out loud in that PR.
 */
import type { ActivityKind } from '@iterahq/activity-spec';

/**
 * Any string that is not one of the known literals.
 *
 * `Record<never, never>` rather than `{}` on purpose: `string & {}` is the
 * classic "keep the literals in autocomplete but accept any string" idiom, and
 * `@typescript-eslint/no-empty-object-type` (on via `tseslint.configs.recommended`)
 * flags the `{}` spelling. Same type, lint-clean.
 */
type AnyOtherString = string & Record<never, never>;

/**
 * The event names v1 knows about. NOT exhaustive by construction — see
 * `ActivityEventType`. Grouped by moment, `noun.verb` in past tense.
 */
export type KnownActivityEventType =
  /** The activity mounted and is on screen. */
  | 'activity.viewed'
  /** First learner interaction with the activity (typing, selecting, dragging). */
  | 'activity.started'
  /** The learner changed their in-progress answer (pre-submit). */
  | 'answer.changed'
  /** The learner committed an answer. */
  | 'answer.submitted'
  /** The activity settled a verdict and called `onComplete`. */
  | 'activity.completed'
  /** The correct answer was shown without a submission (timer stopped/expired). */
  | 'activity.revealed'
  /** A kind that needs a host port could not run because the port is absent. */
  | 'port.unavailable'
  /** A host port was called and rejected. */
  | 'port.failed';

/**
 * The event name. Known literals are suggested; any string is accepted, which
 * is precisely what makes adding literals later a non-breaking change.
 */
export type ActivityEventType = KnownActivityEventType | AnyOtherString;

/**
 * One telemetry event emitted by an activity.
 *
 * The library never sends this anywhere — it hands it to the host, which owns
 * transport, batching, consent and retention. A library that shipped its own
 * exporter would be a second, invisible data plane inside someone else's app.
 */
export interface ActivityEvent {
  type: ActivityEventType;
  /** `activity.id` of the activity that emitted. */
  activityId: string;
  /** The activity's kind, so a host can route without re-looking-up the row. */
  kind: ActivityKind;
  /** `Date.now()` at emission. Milliseconds since epoch, host clock. */
  at: number;
  /**
   * v1: an OPEN bag. Deliberately unstructured until the Fase 1 schema lands —
   * see the hardening note at the top of this file. Never narrow this field;
   * add typed overlays instead.
   */
  payload?: Record<string, unknown>;
}

/** What the host passes as `onEvent`. Synchronous and must not throw. */
export type ActivityEventHandler = (event: ActivityEvent) => void;

/**
 * The OVERLAY seam for Fase 1.
 *
 * When the telemetry schema lands, it declares payload shapes here — via
 * declaration merging or a straight edit — and consumers that want the strict
 * view read `TypedActivityEvent<'answer.submitted'>`. `ActivityEvent` itself is
 * untouched, so nothing that compiles today stops compiling.
 *
 * Empty in v1 on purpose: an empty interface here is the honest statement that
 * no payload has been specified yet.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ActivityEventPayloads {}

/**
 * An `ActivityEvent` narrowed to one event type, with its declared payload when
 * `ActivityEventPayloads` has one and the open bag when it does not.
 */
export type TypedActivityEvent<T extends ActivityEventType> = Omit<
  ActivityEvent,
  'type' | 'payload'
> & {
  type: T;
  payload?: T extends keyof ActivityEventPayloads
    ? ActivityEventPayloads[T]
    : Record<string, unknown>;
};
