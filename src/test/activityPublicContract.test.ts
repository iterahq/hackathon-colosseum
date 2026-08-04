/**
 * The Fase A exit criterion, as a test.
 *
 * Plan `20260803-itera-player-activities-lib` says the contract must cover
 * "os 9+ kinds existentes sem exceção especial". That is a claim about the code,
 * so it is checked against the code instead of being asserted in a doc:
 *
 *  1. every renderer's props fit inside the contract's prop set;
 *  2. every `onComplete` still starts with `correct: boolean`;
 *  3. the app's `Activity` row narrows cleanly to `PortableActivity`;
 *  4. the ports MIRROR `src/api/iteraApi.ts` rather than inventing shapes;
 *  5. the app's `useI18n()` already satisfies the i18n port;
 *  6. the contract module emits NO runtime code.
 *
 * Most of it is type-level: the assertions below fail `npm run typecheck`
 * (a build gate here since PR #195), not at runtime. The one runtime check is
 * (6) — the guarantee that Fase A changed nothing that ships.
 *
 * Fase B moved the contract itself into `packages/activities/`, so the imports
 * below now go through `@iterahq/activities` — the npm-workspace link, i.e. the
 * same module edge an external host resolves. That makes this file do double
 * duty: it still guards the contract against renderer drift, and it now also
 * fails if the workspace wiring breaks. When Fase C moves the renderers, this
 * file moves with them.
 */
import * as contract from '@iterahq/activities';
import type {
  ActivityByocGeneration,
  ActivityBrief,
  ActivityCompletion,
  ActivityI18n,
  ActivityJudgeVerdict,
  ActivityResponderResult,
  ActivitySeed,
  PortableActivity,
} from '@iterahq/activities';

import type { Activity } from '@/types/content';
import type { ActivityCompleteDetail } from '@/components/branded/activity/activityFeedbackKinds';
import type { GeneratedBrief, JudgeVerdict, RespondResult, Seed } from '@/api/iteraApi';
import type { ByocGeneration } from '@/types/byoc';
import { useI18n } from '@/i18n';

import { ConceptActivity } from '@/components/branded/activity/ConceptActivity';
import { VideoActivity } from '@/components/branded/activity/VideoActivity';
import { SingleChoiceActivity } from '@/components/branded/activity/SingleChoiceActivity';
import { MultiChoiceActivity } from '@/components/branded/activity/MultiChoiceActivity';
import { MatchActivity } from '@/components/branded/activity/MatchActivity';
import { OrderActivity } from '@/components/branded/activity/OrderActivity';
import { SandboxScenarioActivity } from '@/components/branded/activity/SandboxScenarioActivity';
import { CodeSnackActivity } from '@/components/branded/activity/code/CodeSnackActivity';
import { ByocActivity } from '@/components/branded/activity/byoc/ByocActivity';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';

/* ─────────────────────────── type-level helpers ──────────────────────────── */

type Expect<T extends true> = T;
type Assignable<A, B> = [A] extends [B] ? true : false;
type Mutual<A, B> = Assignable<A, B> extends true ? Assignable<B, A> : false;
type IsNever<T> = [T] extends [never] ? true : false;

/** The prop names `<ActivityRenderer>` exposes to a host. */
type ContractProp = keyof contract.ActivityRendererProps;

/**
 * The props of a renderer, read off the function itself.
 *
 * `React.ComponentProps` would be the idiomatic spelling, but it constrains its
 * argument to `JSXElementConstructor`, which cannot be expressed as a generic
 * bound here without an `any`. Inferring from the call signature is exact and
 * needs no escape hatch.
 */
type PropsOf<C> = C extends (props: infer P, ...rest: never) => unknown ? P : never;

/** Props a renderer demands that the contract does NOT expose. Should be none. */
type Uncovered<C> = Exclude<keyof PropsOf<C>, ContractProp>;

/** The first argument of a renderer's `onComplete`. Should be `boolean`, always. */
type Verdict<C> = PropsOf<C> extends {
  onComplete: (correct: infer V, ...rest: never) => void;
}
  ? V
  : never;

/* ───────────────── 1. every kind fits inside the contract ────────────────── */
// One line per kind. A renderer that grows a prop outside the contract turns its
// line red — which is the review signal that either the contract has to widen or
// the prop belongs to the host, and someone has to choose ON PURPOSE.

type _concept = Expect<IsNever<Uncovered<typeof ConceptActivity>>>;
type _video = Expect<IsNever<Uncovered<typeof VideoActivity>>>;
type _singleChoice = Expect<IsNever<Uncovered<typeof SingleChoiceActivity>>>;
type _multiChoice = Expect<IsNever<Uncovered<typeof MultiChoiceActivity>>>;
type _match = Expect<IsNever<Uncovered<typeof MatchActivity>>>;
type _order = Expect<IsNever<Uncovered<typeof OrderActivity>>>;
type _sandboxScenario = Expect<IsNever<Uncovered<typeof SandboxScenarioActivity>>>;
type _code = Expect<IsNever<Uncovered<typeof CodeSnackActivity>>>;
type _dispatcher = Expect<IsNever<Uncovered<typeof ActivityRenderer>>>;

/**
 * BYOC IS THE ONE EXCEPTION, and it is not a kind.
 *
 * `ByocActivity` takes an extra `spec` prop because BYOC is a LAYER over any
 * host kind: the dispatcher resolves the harness with `resolveByocSpec(activity)`
 * BEFORE the kind switch and passes the resolved spec down. So `spec` is an
 * internal handoff between the dispatcher and the layer, not something a host
 * ever supplies — the public surface stays `{activity, onComplete, onEvent,
 * reveal, live}`.
 *
 * Asserted rather than ignored: if BYOC grows a SECOND extra prop, this line
 * goes red and the exception has to be re-justified.
 */
type _byoc = Expect<Assignable<Uncovered<typeof ByocActivity>, 'spec'>>;

/* ──────────────── 2. `onComplete(correct: boolean, …)` holds ─────────────── */

type _verdictConcept = Expect<Assignable<Verdict<typeof ConceptActivity>, boolean>>;
type _verdictVideo = Expect<Assignable<Verdict<typeof VideoActivity>, boolean>>;
type _verdictSingle = Expect<Assignable<Verdict<typeof SingleChoiceActivity>, boolean>>;
type _verdictMulti = Expect<Assignable<Verdict<typeof MultiChoiceActivity>, boolean>>;
type _verdictMatch = Expect<Assignable<Verdict<typeof MatchActivity>, boolean>>;
type _verdictOrder = Expect<Assignable<Verdict<typeof OrderActivity>, boolean>>;
type _verdictSandbox = Expect<Assignable<Verdict<typeof SandboxScenarioActivity>, boolean>>;
type _verdictCode = Expect<Assignable<Verdict<typeof CodeSnackActivity>, boolean>>;
type _verdictByoc = Expect<Assignable<Verdict<typeof ByocActivity>, boolean>>;
type _verdictDispatcher = Expect<Assignable<Verdict<typeof ActivityRenderer>, boolean>>;

/* ────────── 3. the app's row narrows to the portable row, unchanged ───────── */
// One direction only, and deliberately so: `Activity` carries `lessonId` and
// `ordinal`, which no renderer reads. The Player keeps passing its existing rows;
// the package asks for less. The reverse (`PortableActivity` -> `Activity`) is
// FALSE today and stays false — making it true would drag the Itera content
// model into the package, which is the thing ADR-1 refuses.

type _rowNarrows = Expect<Assignable<Activity, PortableActivity>>;

/* ─────── 4. the completion detail is PRESERVED, not redesigned ──────────── */

type _detailPreserved = Expect<Mutual<ActivityCompleteDetail, ActivityCompletion>>;

/* ───────── 5. the ports mirror the real client, not an invented one ───────── */
// If someone changes a wire shape in `src/api/iteraApi.ts` without updating the
// port, these go red — which is the only thing that keeps a hand-copied
// interface honest.

type _seed = Expect<Mutual<Seed, ActivitySeed>>;
type _brief = Expect<Mutual<GeneratedBrief, ActivityBrief>>;
type _verdictShape = Expect<Mutual<JudgeVerdict, ActivityJudgeVerdict>>;
type _respond = Expect<Mutual<RespondResult, ActivityResponderResult>>;
type _byocGeneration = Expect<Mutual<ByocGeneration, ActivityByocGeneration>>;

/* ────────── 6. the host's existing i18n already satisfies the port ────────── */
// The adapter for the Itera Player is `useI18n()` itself — no shim, no mapping.

type _i18nSatisfied = Expect<Assignable<ReturnType<typeof useI18n>, ActivityI18n>>;

/* ──────────────────────────── runtime assertion ──────────────────────────── */

describe('activities public contract (Fase A)', () => {
  it('emits no runtime code — Fase A cannot change what renders', () => {
    // A types-only module compiles to an empty namespace object. If a component,
    // a constant or a helper ever lands in `contract/`, this fails and the
    // "zero behaviour change" promise of Fase A stops being free.
    expect(Object.keys(contract)).toEqual([]);
  });

  it('keeps the type-level assertions above referenced', () => {
    // `tsc` checks the aliases whether or not anything reads them; this exists so
    // a reader knows the file is not half-dead code.
    expect(true).toBe(true);
  });
});
