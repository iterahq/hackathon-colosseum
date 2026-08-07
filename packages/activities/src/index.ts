/**
 * `@iterahq/activities` — portable Itera activity renderers.
 *
 * Fase A defined the boundary (types only). Fase B moved it into this package
 * and made the app consume it by name. **Fase C is where the renderers crossed**
 * — this module now has runtime, and `src/test/activityPublicContract.test.ts`
 * asserts the exact list below rather than asserting emptiness.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SHAPE
 * ─────────────────────────────────────────────────────────────────────────────
 *   <ActivityProvider i18n={…} api={…} identity={…} theme={…} storage={…}>
 *     <ActivityRenderer
 *       activity={activity}                 // validated by @iterahq/activity-spec
 *       onComplete={(correct, detail) => …}
 *       onEvent={(event) => …}
 *       reveal={false}
 *       live={false}
 *     />
 *   </ActivityProvider>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS **NOT** EXPORTED, AND WHY THAT IS THE POINT
 * ─────────────────────────────────────────────────────────────────────────────
 * The package's `src/` contains ~30 modules. This barrel exposes the ones a
 * consumer needs and no more:
 *
 *  • `internal/*` — `answerMachine`, `seededShuffle`, `richText`, the action
 *    recorder, the learner-scope resolver. All useful, none of them a promise:
 *    they are how the kinds are built, and exporting them would freeze the
 *    implementation into the API. The one exception is `ACTIVITY_TRACE_ACTIONS`,
 *    which is exported because the HOST has to be able to check it against its
 *    own taxonomy.
 *  • `components/*` — `ActivityShell`, `SubmitButton`, `RichText`,
 *    `InstructionPanel`, `parts`. These ARE re-exported, but only because the
 *    Itera Player's un-extracted kinds (sandbox, terminal, BYOC, code) still
 *    compose with them. They are marked below; when those kinds move, this
 *    section shrinks. Do not build on them expecting stability.
 *  • The default dictionary's raw `ACTIVITY_DICTIONARY` map is exported, but
 *    `createActivityI18n` is the supported way in.
 */

/* ───────────────────────────── the entry points ──────────────────────────── */

export { ActivityRenderer, BUILT_IN_ACTIVITY_KINDS, isBuiltInActivityKind } from './ActivityRenderer.js';
export type { BuiltInActivityKind } from './ActivityRenderer.js';
export { ActivityProvider, useActivityHost, useActivityI18n, useActivityStorage } from './context.js';

/* ──────────────────────────── the built-in kinds ─────────────────────────── */
// Exported individually as well as through the dispatcher: a host that lays out
// its own screen (the LCPWCI control plane renders ONE micro-experiment, not a
// lesson) should not have to go through a kind switch to mount the one it has.

export { ConceptActivity } from './kinds/ConceptActivity.js';
export { ConceptRevealActivity } from './kinds/ConceptRevealActivity.js';
export { VideoActivity } from './kinds/VideoActivity.js';
export { SingleChoiceActivity } from './kinds/SingleChoiceActivity.js';
export { MultiChoiceActivity } from './kinds/MultiChoiceActivity.js';
export { MatchActivity } from './kinds/MatchActivity.js';
export { OrderActivity } from './kinds/OrderActivity.js';

/* ─────────────────────────── sandbox_scenario ────────────────────────────── */
// Fase C step 4. ONE kind (`sandbox_scenario`) with five activity types behind
// it: the dispatcher picks off the AUTHORED SHAPE, never off a second enum —
// `sandboxKind: 'terminal'` splits by `inputMode`, everything else is the chat
// sandbox split by `slots` / `choices`. The five are exported individually as
// well, for the same reason the choice kinds are: a host that already knows
// which one it has should not have to go through a switch to mount it.
//
// It needs NO backend port. That is a property of the kind, not an omission:
// the whole thing runs on `@iterahq/activity-spec/runtime`'s pure reducers, so
// a host gets a multi-turn, graded micro-experiment with nothing injected but
// i18n. The AI-judged live twin (`sandbox-live`) is the one that needs `api`,
// and it has not moved yet — see README.

export { SandboxScenarioActivity } from './kinds/SandboxScenarioActivity.js';
export { SandboxAIActivity } from './kinds/sandbox/SandboxAIActivity.js';
export { SandboxAIWithOptionsActivity } from './kinds/sandbox/SandboxAIWithOptionsActivity.js';
export { SandboxAICompleteWordsActivity } from './kinds/sandbox/SandboxAICompleteWordsActivity.js';
export { TerminalFreeTextActivity } from './kinds/terminal/TerminalFreeTextActivity.js';
export { TerminalOptionsActivity } from './kinds/terminal/TerminalOptionsActivity.js';

/* ───────────────────────────────── i18n ──────────────────────────────────── */

export { ACTIVITY_DICTIONARY, ACTIVITY_I18N_KEYS, createActivityI18n } from './i18n/dictionary.js';

/* ─────────────────────────────── telemetry ───────────────────────────────── */

export {
  ACTIVITY_TRACE_ACTIONS,
  MAX_ACTIVITY_ACTIONS,
  useActivityActionRecorder,
} from './internal/actionRecorder.js';
export type {
  ActivityActionRecorder,
  ActivityRecordedAction,
  ArrangementAction,
  ScenarioAction,
  SelectionAction,
} from './internal/actionRecorder.js';

/* ──────────── shared primitives — for the not-yet-extracted kinds ────────── */
// ⚠️ PROVISIONAL SURFACE. These exist so the Itera Player's `sandbox`,
// `terminal`, `byoc` and `code` trees keep compiling while they wait their turn
// (Fase C steps 4 and 5). They are the seam of an unfinished extraction, not a
// design for outside use.

export { ActivityTextarea } from './components/ActivityTextarea.js';
export type { ActivityTextareaProps } from './components/ActivityTextarea.js';
export { AnswerExplanation } from './components/AnswerExplanation.js';
export { InstructionImage } from './components/InstructionImage.js';
// The chat-sandbox pieces the Player's un-extracted LIVE sandbox still composes
// with (`SandboxScenarioLiveActivity` renders the same window and transcript
// against an AI-backed model). They leave this section when that one moves.
export { SandboxBubble } from './kinds/sandbox/SandboxBubble.js';
export { SandboxChatLog } from './kinds/sandbox/SandboxChatLog.js';
export { SandboxClearButton } from './kinds/sandbox/SandboxClearButton.js';
export { SandboxWindow } from './kinds/sandbox/SandboxWindow.js';
export { useAssistantStream } from './kinds/sandbox/useAssistantStream.js';
export { InstructionPanel } from './components/InstructionPanel.js';
export { RichBlock } from './components/RichBlock.js';
export { RichSpans } from './components/RichSpans.js';
export { RichText } from './components/RichText.js';
export { ActivityShell, DoneButton, KindBadge, SubmitButton } from './components/parts.js';
export { parseInline, parseRichText } from './internal/richText.js';
export type { Block, Inline } from './internal/richText.js';
export { answerMachine, choiceOptionState } from './internal/answerMachine.js';
export type {
  AnswerMachineInput,
  AnswerMachineState,
  ChoiceOptionState,
} from './internal/answerMachine.js';
export { seededShuffle } from './internal/seededShuffle.js';
export {
  anonLearnerScope,
  learnerShuffle,
  learnerShuffleAvoidingSolution,
  learnerShuffleSeed,
  resolveLearnerScope,
} from './internal/shuffle.js';
export {
  isLocaleBag,
  localizedText,
  resolveLocalizedText,
} from './internal/localizedText.js';
export type { PartialI18nBag } from './internal/localizedText.js';

/* ───────────────────────────────── types ─────────────────────────────────── */

export type {
  ActivityEvent,
  ActivityEventHandler,
  ActivityEventPayloads,
  ActivityEventType,
  KnownActivityEventType,
  TypedActivityEvent,
} from './events.js';

export type {
  ActivityApiPort,
  ActivityBrief,
  ActivityI18n,
  ActivityIdentity,
  ActivityJudgeContext,
  ActivityJudgeCriterion,
  ActivityJudgeVerdict,
  ActivityLocale,
  ActivityResponderResult,
  ActivitySeed,
  ActivityStoragePort,
  ActivityTheme,
  ActivityByocGeneration,
} from './ports.js';

export type {
  ActivityCompleteHandler,
  ActivityCompletion,
  ActivityHostContext,
  ActivityProviderProps,
  ActivityRendererProps,
  PortableActivity,
  PortableActivityStatus,
  PortableArtifactType,
  PortableProducedArtifact,
} from './renderer.js';

export type {
  ChoiceOption,
  ConceptRevealSpec,
  ConceptSpec,
  I18nText,
  InstructionPanelSpec,
  MatchPair,
  MatchSpec,
  MultiChoiceSpec,
  OrderSpec,
  SingleChoiceSpec,
  VideoSpec,
} from './specs.js';
