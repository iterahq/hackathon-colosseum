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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS BEHIND THE OTHER DOOR — `@iterahq/activities/code`
 * ─────────────────────────────────────────────────────────────────────────────
 * Nothing in this file reaches the `code` kind, and that is a MECHANICAL
 * property rather than a convention: `scripts/assert-entrypoint-isolation.mjs`
 * walks the built module graph from `dist/index.js` and fails if any reachable
 * file lives under `dist/code/` or names `sucrase` / `monaco-editor` /
 * `@monaco-editor/react`. It runs in `npm test` against the workspace build and
 * again inside `external-consumer/check.sh` against the INSTALLED tarball — the
 * artifact a consumer actually gets.
 *
 * `code` is therefore absent from `BUILT_IN_ACTIVITY_KINDS` on purpose: this
 * bundle answers "no, ask the host" for it (ADR-5). See `./code/index.ts`.
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

/* ─────── the ONE-BEHAVIOUR kinds (plan 20260924-activity-type-one-behavior-rule) ─────── */
// One activity type = one behaviour. Each kind below is ONE behaviour of an old
// kind (`chat_sandbox`, `terminal_sandbox`, `document`, `question`) on the same
// shared components. The five `code_*` kinds are on the `/code` entrypoint.

export {
  ONE_BEHAVIOUR_KINDS,
  ONE_BEHAVIOUR_PARENT,
  isOneBehaviourKind,
  kindInvalidTestId,
  safeParseKindSpec,
  specPackageKnowsKind,
  transitionKindOf,
} from './oneBehaviourKinds.js';
export type {
  KindSpecParse,
  KnownActivityKind,
  OneBehaviourKind,
  TransitionParentKind,
} from './oneBehaviourKinds.js';
export {
  ChatComposeActivity,
  ChatFillSelectActivity,
  ChatFillTypeActivity,
  ChatPickContextActivity,
  ChatRateReplyActivity,
} from './kinds/oneBehaviour/ChatKindActivities.js';
export {
  TerminalBuildCommandActivity,
  TerminalPickCommandActivity,
  TerminalTypeCommandActivity,
} from './kinds/oneBehaviour/TerminalKindActivities.js';
export {
  DocumentAiJudgeActivity,
  DocumentReadActivity,
  DocumentReflectActivity,
} from './kinds/oneBehaviour/DocumentKindActivities.js';
export {
  QuestionPickManyActivity,
  QuestionPickOneActivity,
  QuestionWriteActivity,
} from './kinds/oneBehaviour/QuestionKindActivities.js';

/* ───────── document · diagram · quiz — Fase D, the last three inline ─────── */
// They had no file to move: they were functions inside the Player's dispatcher,
// which is why Fase C stopped short of them. Together they are 48% of the
// authored library, so until this release a host that was not the Itera Player
// rendered most of the catalogue as an "unsupported kind" placeholder.
//
// `DocumentActivity` is ONE kind with THREE renderers behind it, picked off the
// RUBRIC and the host's ports (`rubric.mode === 'ai-judge'` + `api.judge` →
// AI-judged; a prompt or a `min_words` rubric → reflection; otherwise a
// read-only card). The two inner renderers are NOT exported: which one a
// document is, is a decision the kind makes from data the host already passed,
// and exporting them would invite a host to make it differently.

export { DocumentActivity } from './kinds/DocumentActivity.js';
export { DiagramActivity } from './kinds/DiagramActivity.js';
export { QuizActivity } from './kinds/QuizActivity.js';

/* ───────────── question — the non-grading ask (2026-08-28, ADR-6) ────────── */
// It looks like a member of the choice family and is deliberately NOT one: no
// correct answer, no verdict UI, no shuffle (the asker's order is content), and
// free text always available beside the options. `QUESTION_OTHER_ID` is
// exported because an adapter that round-trips answers through another store
// has to spell the "Outro" sentinel the same way this renderer does, and a
// sentinel re-typed at a call site is a sentinel that can be re-typed wrongly.

// 1.3.0 (plan `20260924-activity-type-one-behavior-rule`, T23, Q-R2-4): the
// CALLER decides "Outro" and the notes box (`callerOptions`), and
// `QuestionActivityBody` is the same body as a controlled component, for a host
// whose chrome owns the state and the save (the plans-app).
export {
  QuestionActivity,
  QuestionActivityBody,
  QUESTION_OTHER_ID,
  resolveQuestionInputs,
} from './kinds/QuestionActivity.js';
export type {
  QuestionActivityBodyProps,
  QuestionBodyOption,
  QuestionCallerOptions,
} from './kinds/QuestionActivity.js';

/* ─────── the scene kinds — xray / live_type / inspect (2026-09-24) ─────── */
// Gesture-gated animated beats over one small page: the learner acts first,
// the concept is named after (a stamp). Ungraded, silent, i18n-only.

export { XrayActivity } from './kinds/XrayActivity.js';
export { LiveTypeActivity } from './kinds/LiveTypeActivity.js';
export { InspectActivity } from './kinds/InspectActivity.js';

/* ── the scene-mechanics batch — batch A of 2 (2026-09-25) ──────────────── */
// `dial`, `plug`, `selector`, `timeline`, `arrange`, `press` — gesture-gated,
// silent, i18n-only, same as the three above. Needs `@iterahq/activity-spec`
// 1.4.0, the first release whose `ActivityKind` union carries them.

export { DialActivity } from './kinds/DialActivity.js';
export { PlugActivity } from './kinds/PlugActivity.js';
export { SelectorActivity } from './kinds/SelectorActivity.js';
export { TimelineActivity } from './kinds/TimelineActivity.js';
export { ArrangeActivity } from './kinds/ArrangeActivity.js';
export { PressActivity } from './kinds/PressActivity.js';

/* ── the scene-mechanics batch — batch B of 2 (2026-09-25) ──────────────── */
// `wire`, `spot`, `bucket`, `intercept`, `query` — same as batch A.

export { WireActivity } from './kinds/WireActivity.js';
export { SpotActivity } from './kinds/SpotActivity.js';
export { BucketActivity } from './kinds/BucketActivity.js';
export { InterceptActivity } from './kinds/InterceptActivity.js';
export { QueryActivity } from './kinds/QueryActivity.js';

/* ───────────────────── chat_sandbox / terminal_sandbox ───────────────────── */
// Fase C step 4. TWO kinds with five activity types behind them: each
// dispatcher picks off the AUTHORED SHAPE, never off a second enum —
// `terminal_sandbox` splits by `inputMode`, `chat_sandbox` by `slots` /
// `choices`. The five are exported individually as well, for the same reason
// the choice kinds are: a host that already knows which one it has should not
// have to go through a switch to mount it.
//
// It needs NO backend port. That is a property of the kind, not an omission:
// the whole thing runs on `@iterahq/activity-spec/runtime`'s pure reducers, so
// a host gets a multi-turn, graded micro-experiment with nothing injected but
// i18n. The AI-judged live twin (`sandbox-live`) is the one that needs `api`,
// and it has not moved yet — see README.

export { ChatSandboxActivity } from './kinds/ChatSandboxActivity.js';
export { TerminalSandboxActivity } from './kinds/TerminalSandboxActivity.js';
export { SandboxAIActivity } from './kinds/sandbox/SandboxAIActivity.js';
export { SandboxAIWithOptionsActivity } from './kinds/sandbox/SandboxAIWithOptionsActivity.js';
export { SandboxAICompleteWordsActivity } from './kinds/sandbox/SandboxAICompleteWordsActivity.js';
export { TerminalFreeTextActivity } from './kinds/terminal/TerminalFreeTextActivity.js';
export { TerminalOptionsActivity } from './kinds/terminal/TerminalOptionsActivity.js';
// The READ-ONLY twin of the two above. A host that mirrors a learner's surface
// (the Itera Player's live class) draws THIS instead of mounting the activity a
// second time — mounting seeds a fresh model from the viewer's own client, which
// projects an empty terminal under the learner's name. See the component header.
export { TerminalScreenMirror } from './kinds/terminal/TerminalScreenMirror.js';
// The same read-only twin for the chat sandbox, and the same rule: the stage
// draws THIS instead of mounting the activity a second time. Mounting seeds a
// fresh `initialModel` from the viewer's client, so the room gets the authored
// opener under the learner's name and none of their conversation.
export { ChatScreenMirror } from './kinds/sandbox/ChatScreenMirror.js';

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
  InquiryAction,
  ReadingAction,
  ScenarioAction,
  SelectionAction,
} from './internal/actionRecorder.js';

/* ──────────── shared primitives — for the not-yet-extracted kinds ────────── */
// ⚠️ PROVISIONAL SURFACE. These exist so the Itera Player's live-sandbox and
// `byoc` trees keep compiling while they wait their turn (the AI-judged half of
// Fase C step 4). They are the seam of an unfinished extraction, not a design
// for outside use.
//
// `code` left this list in step 5. It does NOT re-export from here: the pieces
// it composes with (`DoneButton`, `RichText`) are imported by relative path
// from inside `./code/`, so the `/code` entrypoint depends on the base module
// graph while the base depends on nothing of `/code` — which is the asymmetry
// the entrypoint-isolation assertion checks.

export { ActivityTextarea } from './components/ActivityTextarea.js';
export type { ActivityTextareaProps } from './components/ActivityTextarea.js';
export { AnswerExplanation } from './components/AnswerExplanation.js';
export { InstructionImage } from './components/InstructionImage.js';
// Fase D. `ArtifactVisibilityNotice` reads `identity.artifactAudience` and
// nothing else, so it is safe for any host to compose with; `JudgeHeatmap`
// renders an `ActivityJudgeVerdict` and is exported because the Player's
// Storybook story mounts it directly.
export { ArtifactVisibilityNotice } from './components/ArtifactVisibilityNotice.js';
export { JudgeHeatmap } from './components/JudgeHeatmap.js';
// The chat-sandbox pieces the Player's un-extracted LIVE sandbox still composes
// with (`SandboxScenarioLiveActivity` renders the same window and transcript
// against an AI-backed model). They leave this section when that one moves.
export { SandboxBubble } from './kinds/sandbox/SandboxBubble.js';
export { SandboxChatLog } from './kinds/sandbox/SandboxChatLog.js';
export { SandboxClearButton } from './kinds/sandbox/SandboxClearButton.js';
export { SandboxWindow } from './kinds/sandbox/SandboxWindow.js';
export { useAssistantStream } from './kinds/sandbox/useAssistantStream.js';
// Exported for the same reason as `JudgeHeatmap`: the Player's Storybook mounts
// it directly. A track drawn only inside a running sandbox can't be reviewed
// step by step, and stepping through a whole scenario to see state 2 of 3 is
// what kept it out of design review.
export { SandboxStepHeader } from './components/SandboxStepHeader.js';
export { InstructionPanel } from './components/InstructionPanel.js';
export { RichBlock } from './components/RichBlock.js';
export { RichSpans } from './components/RichSpans.js';
export { RichText } from './components/RichText.js';
export { ActivityShell, DoneButton, KindBadge, SubmitButton } from './components/parts.js';
export { parseInline, parseRichText } from './internal/richText.js';
export type { Block, Inline } from './internal/richText.js';
// O desenho do `diagram` e o parser que o alimenta saem juntos, e por um motivo
// só: `parseMermaidLite` devolve `null` fora do subconjunto, então quem monta o
// `<MermaidLite>` PRECISA do parser para saber quando cair no texto cru. Exportar
// o componente sem o parser entregaria metade de uma decisão.
export { MermaidLite } from './components/MermaidLite.js';
export type { MermaidLiteProps } from './components/MermaidLite.js';
export { normalizeMermaidLabel, parseMermaidLite, wrapLabel } from './internal/mermaidLite.js';
export type {
  MermaidDirection,
  MermaidEdge,
  MermaidGraph,
  MermaidNode,
  MermaidNodeShape,
} from './internal/mermaidLite.js';
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
  ActivityCodeEditorProps,
  EditableRegion,
  ActivityI18n,
  ActivityIdentity,
  ActivityJudgeContext,
  ActivityJudgeCriterion,
  ActivityJudgeVerdict,
  ActivityLiveBufferPort,
  ActivityLocale,
  ActivityTerminalLine,
  ActivityTerminalScreen,
  ActivityChatMessage,
  ActivityChatScreen,
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
  DiagramHighlight,
  DiagramSpec,
  DocumentRubric,
  DocumentSpec,
  I18nText,
  InstructionPanelSpec,
  MatchPair,
  MatchSpec,
  MultiChoiceSpec,
  OrderSpec,
  QuestionFreeTextSpec,
  QuestionOptionSpec,
  QuestionSpec,
  InspectSpec,
  LiveTypeSpec,
  SceneFrameSpec,
  ScenePageElementSpec,
  ScenePageSpec,
  XraySpec,
  ArrangeItemSpec,
  ArrangeSpec,
  DialSpec,
  PlugSpec,
  PlugStylesheetRule,
  PressEffectSpec,
  PressOptionSpec,
  PressSpec,
  SceneCssProperty,
  SelectorElementSpec,
  SelectorSpec,
  TimelineFrameSpec,
  TimelineSpec,
  TimelineStepSpec,
  QuizOption,
  QuizSpec,
  SingleChoiceSpec,
  VideoSpec,
  WireEndSpec,
  WirePairSpec,
  WireSpec,
  SpotTokenSpec,
  SpotBugSpec,
  SpotPageElementSpec,
  SpotSpec,
  BucketChipSpec,
  BucketTone,
  BucketDefSpec,
  BucketSpec,
  InterceptIcon,
  InterceptNodeSpec,
  InterceptSpec,
  QueryRowSpec,
  QueryTableSpec,
  QueryCmp,
  QueryDir,
  QueryClauseSpec,
  QuerySpec,
} from './specs.js';
