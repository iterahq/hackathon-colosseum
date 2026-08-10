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
import * as codeEntry from '@iterahq/activities/code';
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
import { DocumentActivity } from '@/components/branded/activity/DocumentActivity';
import { DiagramActivity } from '@/components/branded/activity/DiagramActivity';
import { QuizActivity } from '@/components/branded/activity/QuizActivity';
import { CodeSnackActivity } from '@/components/branded/activity/code/CodeSnackActivity';
import { ByocActivity } from '@/components/branded/activity/byoc/ByocActivity';
import { ByocActivityView } from '@/components/branded/activity/byoc/ByocActivityView';
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
// Fase D. These three were inline functions in the Player's dispatcher until
// now, so they were the only kinds in the taxonomy this file could not assert
// over — a function declared inside another module is not importable, and the
// contract check therefore had a hole exactly where the un-refactored code was.
type _document = Expect<IsNever<Uncovered<typeof DocumentActivity>>>;
type _diagram = Expect<IsNever<Uncovered<typeof DiagramActivity>>>;
type _quiz = Expect<IsNever<Uncovered<typeof QuizActivity>>>;
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

/**
 * A superfície de render do BYOC mora no `ByocActivityView`, e o `ByocActivity`
 * virou fiação de 12 linhas. Sem esta linha o guard vigiaria a casca enquanto o
 * componente que de fato renderiza podia crescer qualquer prop em silêncio.
 * `state` é o handoff container→presenter (mesma coisa em produção e na story).
 */
type _byocView = Expect<Assignable<Uncovered<typeof ByocActivityView>, 'spec' | 'state'>>;

/* ──────────────── 2. `onComplete(correct: boolean, …)` holds ─────────────── */

type _verdictConcept = Expect<Assignable<Verdict<typeof ConceptActivity>, boolean>>;
type _verdictVideo = Expect<Assignable<Verdict<typeof VideoActivity>, boolean>>;
type _verdictSingle = Expect<Assignable<Verdict<typeof SingleChoiceActivity>, boolean>>;
type _verdictMulti = Expect<Assignable<Verdict<typeof MultiChoiceActivity>, boolean>>;
type _verdictMatch = Expect<Assignable<Verdict<typeof MatchActivity>, boolean>>;
type _verdictOrder = Expect<Assignable<Verdict<typeof OrderActivity>, boolean>>;
type _verdictSandbox = Expect<Assignable<Verdict<typeof SandboxScenarioActivity>, boolean>>;
type _verdictDocument = Expect<Assignable<Verdict<typeof DocumentActivity>, boolean>>;
type _verdictDiagram = Expect<Assignable<Verdict<typeof DiagramActivity>, boolean>>;
type _verdictQuiz = Expect<Assignable<Verdict<typeof QuizActivity>, boolean>>;
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
// Until Fase C this was `Mutual<>`: the two types were interchangeable. They no
// longer are, in exactly ONE place, and it is worth being precise about which.
//
// `ActivityCompleteDetail.actions` is `readonly RecordedAction[]`, whose `type`
// is `LearnerActionType` — the union derived from `FAMILY_ACTIONS` in
// `src/utils/activityFamilies.ts`. `ActivityCompletion.actions` is
// `readonly ActivityRecordedAction[]`, whose `type` is `string`. The package
// CANNOT narrow it: the vocabulary is Itera's telemetry taxonomy, and shipping
// it would hand every consumer of the library Itera's event model.
//
// So the app's type is a strict NARROWING of the package's, and that is checked
// two ways, because a one-way assignability check alone would also pass if the
// app quietly grew a field the contract knows nothing about:
//
//   (a) the app's detail is assignable to the contract's completion;
//   (b) the app's detail has NO field outside the contract.
//
// Together those still say "preserved, not redesigned" — a new field on either
// side turns one of them red — while admitting the one deliberate difference.
// The RUNTIME half of that promise (the action NAMES the package emits really
// are in the app's vocabulary) is asserted in `activityTraceVocabulary.test.ts`.

type _detailNarrows = Expect<Assignable<ActivityCompleteDetail, ActivityCompletion>>;
type _detailNoExtraFields = Expect<
  IsNever<Exclude<keyof ActivityCompleteDetail, keyof ActivityCompletion>>
>;

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

/**
 * THE PUBLIC SURFACE, WRITTEN DOWN.
 *
 * Until Fase C this test asserted `Object.keys(contract)` was EMPTY — the
 * mechanical proof that Fase A shipped types and nothing else. Fase C moves the
 * renderers across, so emptiness is exactly the wrong assertion now. What
 * replaces it has to keep the same property: **a change to what the package
 * exposes cannot happen by accident.**
 *
 * So the list is exact, not a subset. Adding an export to `index.ts` without
 * adding it here turns this red, which is the review moment where someone has
 * to say out loud whether the new name is a PROMISE to consumers or an
 * implementation detail that leaked. That question is the whole of "keep the
 * public API honest", and a `toContain`-style check would never ask it.
 *
 * Type-only exports do not appear here — they are erased at runtime, which is
 * why the type-level assertions above exist separately.
 */
const PUBLIC_RUNTIME_SURFACE = [
  // entry points
  'ActivityProvider',
  'ActivityRenderer',
  'BUILT_IN_ACTIVITY_KINDS',
  'isBuiltInActivityKind',
  'useActivityHost',
  'useActivityI18n',
  'useActivityStorage',
  // built-in kinds
  'ConceptActivity',
  'ConceptRevealActivity',
  'MatchActivity',
  'MultiChoiceActivity',
  'OrderActivity',
  'SingleChoiceActivity',
  'VideoActivity',
  // Fase D — the three that had no file to move
  'DocumentActivity',
  'DiagramActivity',
  'QuizActivity',
  // chat_sandbox / terminal_sandbox — two kinds, five activity types. The two
  // dispatchers are public because the app switches on KIND; the five leaves are
  // public because the stories drive them directly.
  'ChatSandboxActivity',
  'TerminalSandboxActivity',
  'SandboxAIActivity',
  'SandboxAIWithOptionsActivity',
  'SandboxAICompleteWordsActivity',
  'TerminalFreeTextActivity',
  'TerminalOptionsActivity',
  // …and the deprecated kind they were split out of, which now only delegates.
  'SandboxScenarioActivity',
  // i18n
  'ACTIVITY_DICTIONARY',
  'ACTIVITY_I18N_KEYS',
  'createActivityI18n',
  // telemetry
  'ACTIVITY_TRACE_ACTIONS',
  'MAX_ACTIVITY_ACTIONS',
  'useActivityActionRecorder',
  // provisional: shared primitives the un-extracted kinds still compose with
  'AnswerExplanation',
  'ActivityShell',
  'ArtifactVisibilityNotice',
  'JudgeHeatmap',
  'DoneButton',
  'InstructionImage',
  'InstructionPanel',
  'KindBadge',
  'RichBlock',
  'RichSpans',
  'RichText',
  'SubmitButton',
  'ActivityTextarea',
  'SandboxBubble',
  'SandboxChatLog',
  'SandboxClearButton',
  'SandboxWindow',
  'useAssistantStream',
  'answerMachine',
  'anonLearnerScope',
  'isLocaleBag',
  'resolveLocalizedText',
  'choiceOptionState',
  'learnerShuffle',
  'learnerShuffleAvoidingSolution',
  'learnerShuffleSeed',
  'localizedText',
  'parseInline',
  'parseRichText',
  'resolveLearnerScope',
  'seededShuffle',
].sort();

/**
 * THE SECOND DOOR — `@iterahq/activities/code` (ADR-5, Fase C step 5).
 *
 * It gets its own exact list for the same reason the base one has one: a name
 * added here is a promise to consumers, and the review moment where someone has
 * to say so out loud is worth more than the keystrokes it costs.
 *
 * Note what this list does NOT contain: any editor. The editor is a port
 * (`ActivityHostContext.codeEditor`), and the guarantee that neither entrypoint
 * can reach Monaco is asserted over the BUILT module graph in
 * `activityEntrypointIsolation.test.ts` — a list of names could never prove it,
 * because the offending import would be three files down from one of them.
 */
const CODE_ENTRYPOINT_SURFACE = [
  'CodeActivity',
  'CodeSnackPane',
  'CodeLivePreview',
  'CodeChecksFeedback',
  'CodeChecksList',
  'CodeResetControl',
  'CodeEditorSurface',
  'FallbackCodeEditor',
  'CodeHelpLink',
  'GuidedCodePane',
  'allBlanksFilled',
  'blankWidthCh',
  'buildWordBank',
  'gradeGuided',
  'guidedVariant',
  'isBlankCorrect',
  'isGuidedCodeSpec',
  'restoreGuidedValues',
  'spentBankCounts',
  'splitGuidedTemplate',
  'substituteBlanks',
  'useCodeSnack',
  'useCodeChecks',
  'useGuidedCode',
  'transpileSnack',
  'CODE_PREVIEW_IFRAME_HTML',
  'CODE_PREVIEW_RUNTIME_SOURCE',
  'createRequireShim',
  'installPreviewDialogShims',
  'runCodeChecks',
  'CODE_BLANKS_DRAFT_KEY_PREFIX',
  'CODE_DRAFT_KEY_PREFIX',
  'codeBlanksDraftActivityId',
  'codeBlanksDraftKey',
  'codeDraftActivityId',
  'codeDraftKey',
].sort();

describe('activities public contract', () => {
  it('exports exactly the documented public surface — no more, no less', () => {
    expect(Object.keys(contract).sort()).toEqual(PUBLIC_RUNTIME_SURFACE);
  });

  it('renders every kind it claims to render', () => {
    // `BUILT_IN_ACTIVITY_KINDS` is what a host reads to decide whether it can
    // display a row without supplying its own renderer. If the list and the
    // dispatcher disagree, the host is told "yes" and gets the unsupported
    // placeholder — a lie that only shows up in front of a learner.
    for (const kind of contract.BUILT_IN_ACTIVITY_KINDS) {
      expect(contract.isBuiltInActivityKind(kind)).toBe(true);
    }
    // The negative case has to stay a NEGATIVE case, or the assertion above is
    // the only thing here and it can never fail on a kind that was dropped from
    // the dispatcher but left in the list. `code` is the honest choice now:
    // Fase C step 5 gives it its own entrypoint (ADR-5, Monaco is heavy), so
    // the BASE bundle must keep answering "no, ask the host" for it.
    expect(contract.isBuiltInActivityKind('code')).toBe(false);
  });

  it('exposes the `code` kind through its own entrypoint, exactly', () => {
    expect(Object.keys(codeEntry).sort()).toEqual(CODE_ENTRYPOINT_SURFACE);
  });

  it('does NOT re-export the code kind from the base barrel', () => {
    // The list assertion above would already fail on a stray export, but this
    // says WHY out loud: `code` is behind `/code` because Monaco-class weight
    // must not ride in the bundle every consumer pays for (ADR-5), and the base
    // dispatcher answering "no, ask the host" is how a host finds that out
    // before it mounts rather than after.
    for (const name of CODE_ENTRYPOINT_SURFACE) {
      expect(name in contract).toBe(false);
    }
  });

  it('keeps the type-level assertions above referenced', () => {
    // `tsc` checks the aliases whether or not anything reads them; this exists so
    // a reader knows the file is not half-dead code.
    expect(true).toBe(true);
  });
});
