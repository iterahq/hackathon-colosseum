/**
 * ACTIVITY FAMILIES — the reducer taxonomy, and the action vocabulary it owns.
 *
 * Plan `20260731-itera-padroes-reducer-atividades`, **Fase A** ("nomear as
 * famílias a partir do código real, não de uma tabela"). This module IS that
 * deliverable, expressed as types and maps rather than prose, because a
 * document drifts from the code and a `Record<ActivityKind, …>` cannot.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY FAMILIES AND NOT ONE REDUCER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tainan, 2026-07-31: *"não um reducer só, mas tipo, padrões de reducer
 * reutilizáveis"*. One universal reducer over 13 kinds is a giant `switch` and
 * a state that is the union of everything — the opposite of a pattern. The
 * property worth having is not "a reducer"; it is **determinism**: state as
 * `(state, action) => state` means THE LIST OF ACTIONS RECONSTRUCTS THE STATE.
 * Three things fall out of that at once:
 *
 *   1. replay is literally re-running the list;
 *   2. telemetry stops meaning "instrument ~53 handlers across 23 files" and
 *      starts meaning "dispatch what the reducer already receives";
 *   3. most cases become pure-function tests, no DOM.
 *
 * A family is therefore defined by **the shape of the interaction**, not by the
 * kind's name — because the interaction shape is what determines the ACTION
 * shape, and the action is what becomes the event and the replay.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FALSIFIABLE CRITERION — read before adding a kind
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * > **Adding a new kind INSIDE an existing family must cost data plus
 * > predicates. If it costs a new state machine, the family boundary is
 * > wrong.**
 *
 * ⚠️ And the honest caveat, stated up front so nobody reads this file as a
 * finished proof: *a seam never crossed is an intention, not a fact.* A family
 * is only demonstrated to be generic the day a NEW kind enters it without
 * editing it. Until then every row of `FAMILY_STATE` below is a hypothesis
 * derived from reading the five existing implementations.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DECLARED ≠ EMITTED — the one distinction that keeps this file honest
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `FAMILY_ACTIONS` is the vocabulary a family's reducer ACCEPTS: it is derived
 * from the real handlers in the existing components (each entry is annotated
 * with the exact call site it was read from), so it is a description of the
 * code, not a wish list.
 *
 * `FAMILY_EMITTED` is the strictly smaller set THIS BUILD actually writes to
 * `itera.activity_traces`. The parent plan's own review of the ChatGPT
 * taxonomy found that roughly half of the ~90 proposed event types describe a
 * product Itera is not — so a vocabulary with no emitted/declared distinction
 * is exactly the failure mode being avoided. Wiring a family is a diff that
 * moves entries from declared-only into `FAMILY_EMITTED`, and
 * `activityFamilies.test.ts` asserts the subset relation both ways.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS MODULE OWNS `LearnerActionType`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `src/utils/learningTrace.ts` derives its write-time action union FROM the
 * registry below rather than declaring a parallel list. Two lists would drift,
 * and the drift would be invisible: a type present in the trace union but in no
 * family is an action nobody can attribute to a reducer, which is precisely the
 * ad-hoc instrumentation this plan exists to replace.
 *
 * Layering: this module depends on `@iterahq/activity-spec` only. It is PURE —
 * no React, no DOM, no Supabase — so every rule here is unit-testable.
 */
import type { ActivityKind } from '@/types/content';

/**
 * The five families, named from the code as it exists at `main`.
 *
 * Grouped by the FORM of the interaction. The instance counts are the real
 * `itera.activities` distribution measured on 2026-07-31 and are here to keep
 * effort honest — `reading` is the majority of the catalogue and the poorest in
 * state, `editor` + `scenario` are 16% and hold nearly all the difficulty.
 */
export type ActivityFamily =
  /** 57 instances — a set of choices, a submit, a verdict. */
  | 'selection'
  /** 20 instances — a permutation / a pairing, then a submit. */
  | 'arrangement'
  /** 123 instances — progressive disclosure. No answer, no verdict. */
  | 'reading'
  /** 14 instances — text + autosave + submit against checks. */
  | 'editor'
  /** 24 instances — turns against a world model. Already reducer-shaped. */
  | 'scenario'
  /**
   * 0 instances in `itera.activities`, and there never will be any — see the
   * note under `ACTIVITY_FAMILY.question`. A set of positions plus prose, one
   * submit, and NO VERDICT.
   */
  | 'inquiry';

export const ACTIVITY_FAMILIES = [
  'selection',
  'arrangement',
  'reading',
  'editor',
  'scenario',
  'inquiry',
] as const satisfies readonly ActivityFamily[];

/**
 * ⛔ EXHAUSTIVENESS TRAP ⛔ — same device, and the same reasoning, as
 * `KIND_VALIDATION` in `src/utils/activitySpecBoundary.ts`: a value added to
 * the canonical `ActivityKind` enum without a family here is a COMPILE error,
 * and `npm run typecheck` is a build gate.
 *
 * It has to live in this repo rather than in `@iterahq/activity-spec` for the
 * reason written there: the package is vendored as a pre-built `.tgz`, so its
 * internal `satisfies` clauses never recompile in this repo's CI and buy us
 * nothing here.
 *
 * ⚠️ `video` has ZERO rows in the database and `concept_reveal` reached 29 live
 * rows before the union knew about it. Neither fact changes the mapping, but
 * both are reasons the mapping is checked mechanically rather than trusted.
 */
export const ACTIVITY_FAMILY: Record<ActivityKind, ActivityFamily> = {
  // — selection: `answerMachine` + a set of options + one submit —
  single_choice: 'selection',
  multi_choice: 'selection',
  quiz: 'selection',
  // — arrangement: `answerMachine` + a permutation/pairing + one submit —
  order: 'arrangement',
  match: 'arrangement',
  // — reading: no verdict; the only state is how much has been revealed —
  concept: 'reading',
  concept_reveal: 'reading',
  diagram: 'reading',
  document: 'reading',
  video: 'reading',
  // The scene kinds (2026-09-24): no verdict, and the only state is what the
  // gesture has revealed — lens coverage, the learner's own text, found twins.
  // They entered this family with data + predicates, no new machine.
  xray: 'reading',
  live_type: 'reading',
  inspect: 'reading',
  // The scene-mechanics batch (2026-09-25, plan
  // `20260924-itera-scene-mechanics-kinds`) — batch A (`dial`, `plug`,
  // `selector`, `timeline`, `arrange`, `press`) and batch B (`wire`, `spot`,
  // `bucket`, `intercept`, `query`). Same reasoning as the scene kinds right
  // above: no verdict, the only state is what the gesture has revealed so
  // far, and the learner cannot fail — a wrong try is a hint, not a loss.
  dial: 'reading',
  wire: 'reading',
  spot: 'reading',
  bucket: 'reading',
  intercept: 'reading',
  query: 'reading',
  selector: 'reading',
  timeline: 'reading',
  plug: 'reading',
  press: 'reading',
  arrange: 'reading',
  // The system kinds (2026-09-30) — four lenses over one micro-app (parts,
  // composition, state, events). Same reasoning: the gesture reveals, a wrong
  // try is a hint, and the only verdict is "the gesture completed".
  decompose_canvas: 'reading',
  compose_blocks: 'reading',
  state_lab: 'reading',
  event_trace: 'reading',
  // — editor: Monaco + autosave + checks —
  code: 'editor',
  // — scenario: turns against a world model —
  chat_sandbox: 'scenario',
  terminal_sandbox: 'scenario',
  // — inquiry: a position plus prose, one submit, NO verdict —
  //
  // ⚠️ `question` is NOT in `selection`, and the falsifiable criterion at the
  // top of this file is what decides it: *adding a kind inside an existing
  // family must cost data plus predicates; if it costs a new state machine, the
  // family boundary is wrong.* It costs a new state machine. `selection` holds
  // `chosen + submitted` and runs `answerMachine` to decide when a VERDICT may
  // reach the screen; a question has no correct answer for that machine to
  // gate, and it holds two more axes (the "Outro" flag and a free-text draft)
  // that no selection kind has.
  //
  // There is also a consequence that would have been a silent bug. Filing
  // `question` under `selection` makes `stageResponseText` project its free
  // text onto the live-class PROJECTOR — that function admits `selection` and
  // `arrangement`, and its own docblock excludes the `document` reflection for
  // exactly this reason ("um texto pessoal endereçado ao professor"). A
  // question's prose is the same category. `inquiry` gets the right answer by
  // FALLING THROUGH, rather than by someone remembering to add a case.
  //
  // 🔎 This is the FIRST family added since Fase A named the original five.
  // That does NOT discharge the caveat in the header — a family is only
  // demonstrated generic when a NEW kind enters it WITHOUT the family being
  // edited, and `inquiry` has exactly one member. It is a hypothesis like the
  // other five, with one fewer year of evidence.
  question: 'inquiry',
  // — the ONE-BEHAVIOUR kinds (plan `20260924-activity-type-one-behavior-rule`,
  // T9–T14). Each one sits in the family of the old kind it came from: a split
  // changes what the learner does INSIDE the family's machine, never the
  // machine. That is the criterion at the top of this file, applied — and it is
  // why `isScenarioKind` below covers the eight new sandbox kinds for free.
  code_editor_checks: 'editor',
  code_editor_ungraded: 'editor',
  code_fill_bank: 'editor',
  code_fill_select: 'editor',
  code_fill_type: 'editor',
  chat_compose: 'scenario',
  chat_fill_select: 'scenario',
  chat_fill_type: 'scenario',
  chat_pick_context: 'scenario',
  chat_rate_reply: 'scenario',
  terminal_type_command: 'scenario',
  terminal_pick_command: 'scenario',
  terminal_build_command: 'scenario',
  document_read: 'reading',
  document_reflect: 'reading',
  document_ai_judge: 'reading',
  // The BYOC kinds keep the family of the `concept` rows they move from
  // (`reading`): the pedagogical context of the 7 production rows says
  // `reading` today, and the BYOC runtime records no family actions, so a
  // different family would change stored data and gain nothing.
  byoc_pick_best: 'reading',
  byoc_judge_each: 'reading',
  byoc_build_context: 'reading',
  question_pick_one: 'inquiry',
  question_pick_many: 'inquiry',
  question_write: 'inquiry',
};

/**
 * One line per family describing the STATE its reducer holds — the "signature"
 * the plan's Fase A asks for. Read from the real components, cited.
 *
 * ⚠️ `document` sits in `reading` and is the least comfortable placement in the
 * table: its AI-judge path holds a free-text draft and a verdict, which is
 * closer to `editor` than to disclosure. It stays in `reading` because its
 * dominant surface is prose, and it is FLAGGED here rather than silently filed
 * — this is the boundary most likely to be wrong, and the falsifiable criterion
 * above is how it will be settled.
 */
export const FAMILY_STATE: Record<ActivityFamily, string> = {
  selection:
    'chosen: Set<optionId> + submitted — SingleChoiceActivity.tsx / MultiChoiceActivity.tsx / QuizActivity (ActivityRenderer.tsx)',
  arrangement:
    'permutation: optionId[] | pairs: {left,right}[] + armed + touched + submitted — OrderActivity.tsx / MatchActivity.tsx',
  reading: 'revealed: Set<sectionId> — ConceptRevealActivity.tsx (the only one with any state today)',
  editor:
    'source: string + phase: editing|checking|settled + checkResults — useCodeSnack.ts / useCodeChecks.ts',
  scenario:
    'ChatModel { runs, slots, choicesMade } — sandbox/useSandboxScenario.ts, already `(state, action) => state`',
  inquiry:
    'marked: optionId[] + other: boolean + text: string + submitted — QuestionActivity.tsx. There is no verdict field, and that absence IS the family.',
};

/**
 * Actions every family shares, and which no family may redeclare.
 *
 * They are not interactions — they are the ENDS of the trace envelope, and
 * `src/utils/learningTrace.ts` writes them itself (`buildAttemptTrace` /
 * `buildAbandonmentTrace`). They are listed here so the union below is complete
 * in one place.
 *
 * There is ONE opening and TWO possible endings:
 *   `activity_opened`   — the origin, always at offset 0.
 *   `attempt_settled`   — the learner submitted an answer.
 *   `attempt_abandoned` — the learner left without submitting one. Added for
 *                         Fase 1 of the LCPWCI plan; per the rule at the top of
 *                         `learningTrace.ts` a NEW ACTION TYPE IS ADDITIVE, so
 *                         `schema_version` did NOT move for it. Which of the two
 *                         endings a row has is also readable without unnesting
 *                         the jsonb, from `activity_traces.outcome`
 *                         (migration 0040).
 */
export const LIFECYCLE_ACTIONS = [
  'activity_opened',
  'attempt_settled',
  'attempt_abandoned',
] as const;

/**
 * The action union PER FAMILY, read off the existing handlers.
 *
 * `answer_submitted` appears in three families on purpose: it is the same
 * event ("the learner committed") emitted by three different state shapes, and
 * collapsing it into the lifecycle set would be wrong because `reading` has no
 * submit at all. The test asserts it is the ONLY action shared across families
 * — a second shared name would mean two families are describing the same
 * machine and should be one.
 */
export const FAMILY_ACTIONS = {
  selection: [
    /** An option became chosen. `{ option_id }` — the AUTHORED id (`data-option-id`), never the post-shuffle index. */
    'option_selected',
    /** A chosen option was un-chosen. `multi_choice` toggle only. `{ option_id }`. */
    'option_deselected',
    /** "Enviar" accepted. `{ option_ids: string[] }` in click order. */
    'answer_submitted',
  ],
  arrangement: [
    /** One item changed position. `{ item_id, from, to, via: 'drag' | 'button' }` — `OrderActivity.move()`. */
    'item_moved',
    /** A left card was armed, awaiting its right card. `{ left_id }` — `MatchActivity.tapLeft()`. */
    'pair_armed',
    /** A pair was formed. `{ left_id, right_id }` — `MatchActivity.tapRight()`. */
    'pair_made',
    /** An existing pair was undone by tapping either of its cards. `{ left_id, right_id }`. */
    'pair_broken',
    /** "Enviar" accepted. `{ order: string[] }` or `{ pairs: [left,right][] }`. */
    'answer_submitted',
  ],
  reading: [
    /** The hidden answer was opened. `ConceptRevealActivity` — the learner's own button, self-paced only. */
    'reveal_opened',
    /** …and closed again. The button stays mounted and toggles, so this is reachable. */
    'reveal_closed',
    /** A scene element was found for the first time. `{ element_id }` — the AUTHORED id. `inspect`, and reused by `spot` for a bug find. */
    'element_found',
    /** The learner's own text changed (debounced). `{ length }` — NEVER the text. `live_type`. */
    'text_edited',
    /** The gesture that completes a scene beat. `{ coverage_goal }` · `{ length }` · `{ found }` · kind-specific completion payload for the scene-mechanics batch. */
    'gate_opened',
    // — the scene-mechanics batch (2026-09-25) adds one entry per GESTURE
    // SHAPE, never per kind name, plus `wrong_try` for every kind whose B2
    // can miss. Mirrors `ACTIVITY_TRACE_ACTIONS.reading` in
    // `@iterahq/activities` (`packages/activities/src/internal/actionRecorder.ts`)
    // verbatim — `activityTraceVocabulary.test.ts` asserts the package never
    // emits outside this list.
    /** A slider settled on a value. `dial`. `{ value }` — the AUTHORED numeric value. */
    'value_set',
    /** A cable was pulled or plugged back in. `plug`. `{ connected: boolean }`. */
    'cable_toggled',
    /** A CSS selector option was picked. `selector`. `{ option }` — a closed-grammar token, never free text. */
    'option_picked',
    /** A timeline frame was stepped into. `timeline`. `{ index }`. */
    'step_visited',
    /** One drag settled the permutation into a new order. `arrange`. `{ order: string[] }` — the AUTHORED ids. */
    'order_changed',
    /** The dead button was pressed. `press`. `{ count }` — presses so far. */
    'pressed',
    /** Two ends were connected. `wire`. `{ left_id, right_id }` — both AUTHORED ids. */
    'wire_connected',
    /** A chip landed in a bucket. `bucket`. `{ chip_id, bucket_id }` — both AUTHORED ids. */
    'chip_placed',
    /** A SQL clause chip was switched on or off. `query`. `{ clause_id, enabled: boolean }`. */
    'clause_toggled',
    /** Any gate kind whose gesture can miss. `{ kind-specific AUTHORED id }` — e.g. `{ option }` for `selector`, `{ option_id }` for `press`, `{ left_id, right_id }` for `wire`, `{ bug_id }` for `spot`, `{ chip_id, bucket_id }` for `bucket`, `{ node_id }` for `intercept` — never the hint text. */
    'wrong_try',
    // — the system kinds (2026-09-30): one entry per new gesture shape.
    /** Selected leaves were named as one part. `decompose_canvas`. `{ part_id, node_ids }` — AUTHORED ids. */
    'part_assigned',
    /** A block was placed under a parent. `compose_blocks`. `{ block_id, parent_block }`. */
    'block_placed',
    /** A placed block was taken out of the tree. `compose_blocks`. `{ block_id }`. */
    'block_removed',
    /** A state control was operated. `state_lab`. `{ control_id }` — never the typed value. */
    'state_changed',
    /** The trigger node fired the traced event. `event_trace`. `{ node_id }`; each step then is `step_visited`. */
    'event_triggered',
  ],
  editor: [
    /** A debounced batch of edits landed. `{ length }` — NEVER the source text; see the privacy note below. */
    'code_edited',
    /** The learner ran the checks. `useCodeChecks.submit()`. */
    'checks_submitted',
    /** The checks came back. `{ passed: number, failed: number }` — `useCodeChecks.receiveResults()`. */
    'checks_returned',
    /** "Tentar de novo" — back to editing, code KEPT. `useCodeSnack.retry`. */
    'attempt_retried',
    /** "Recomeçar do código inicial" — code DISCARDED. `useCodeSnack.resetToStarter`. */
    'reset_to_starter',
    /** "Concluir" accepted. `useCodeSnack.complete()`. */
    'answer_submitted',
  ],
  scenario: [
    /** A slot was filled. `{ slot, value }` — `useSandboxScenario.onSet`. */
    'slot_set',
    /** An exposed choice chip was picked (single-select; re-tapping clears). `{ choice_id }` — `onChoose`. */
    'choice_picked',
    /** The seed chip was toggled into/out of the composer. `{ step_id, inserted }` — `onToggleSeed`. */
    'seed_toggled',
    /** The composed turn was sent to the world model. `{ step_id, with_context }` — a new `model.runs` entry. */
    'message_sent',
    /** "Limpar" — the composer inputs were reset. `resetInputs`. */
    'inputs_cleared',
    /**
     * A command was run in the TERMINAL sandbox (`spec.sandboxKind ===
     * 'terminal'`).
     * `{ step_id, command, matched, unlocked, source }` where
     *   • `command` is the NORMALIZED form — see the free-text carve-out below;
     *   • `matched` is whether it lit the current step;
     *   • `unlocked` is the step ids it completed (usually 0 or 1);
     *   • `source` is `'typed' | 'option' | 'tokens'`, i.e. WHICH input surface
     *     produced it. Without it, the two input modes are indistinguishable in
     *     the data and the question "does the options mode actually help?"
     *     cannot be asked.
     */
    'command_run',
    /** "Recomeçar" — the world was reset to `initialState`; the trace was NOT. `{ step_id, resets }`. */
    'sandbox_reset',
  ],
  inquiry: [
    /**
     * An option became part of the answer. `{ option_id }` — the AUTHORED id.
     *
     * ⚠️ NOT `option_selected`, and the verbs carry the difference: in
     * `selection` a learner marks the option they believe is CORRECT; here a
     * person states a position on something that has no correct answer. Sharing
     * the name would also break the "`answer_submitted` is the ONLY shared
     * action" invariant asserted in `activityFamilies.test.ts` — which exists to
     * catch precisely the case of two families being one machine under two
     * labels.
     */
    'option_marked',
    /** …and stopped being part of it. `{ option_id }`. Both modes toggle. */
    'option_unmarked',
    /** The "Outro" escape hatch went on or off. `{ on: boolean }`. */
    'other_toggled',
    /**
     * The free-text field changed. `{ length }` — NEVER the text, under the
     * privacy rule below. The same shape `code_edited` carries.
     */
    'note_edited',
    /**
     * "Enviar" accepted. `{ option_ids: string[], other: boolean, has_text:
     * boolean }`. `option_ids` includes the reserved `OTHER` sentinel when the
     * escape hatch was used, so the payload round-trips through the plans-app's
     * `selected_option_letters[]` with no translation step.
     *
     * ⚠️ The TEXT ITSELF is deliberately absent. It rides in
     * `ActivityCompletion.response`, its one home, per the privacy rule below.
     */
    'answer_submitted',
  ],
} as const satisfies Record<ActivityFamily, readonly string[]>;

/** Every action name this codebase knows, lifecycle included. */
export type LearnerActionType =
  | (typeof LIFECYCLE_ACTIONS)[number]
  | (typeof FAMILY_ACTIONS)[ActivityFamily][number];

/** The actions a given family may emit — the type-level half of the guard. */
export type FamilyAction<F extends ActivityFamily> = (typeof FAMILY_ACTIONS)[F][number];

/**
 * What THIS BUILD actually writes. Strict subset of `FAMILY_ACTIONS`.
 *
 * `selection` and `arrangement` are wired first for the reason the parent plan
 * gives: their state is small and their actions are discrete, so the replay is
 * trivially correct. `editor` and `scenario` are the two that carry real
 * difficulty (a keystroke-level `code_edited` would be thousands of events per
 * attempt — the editor wants snapshot+diff, not a per-key action), and
 * `reading` produces no trace at all today because `ConceptRevealActivity`
 * never calls `onComplete`, so there is no attempt to hang a trace on.
 *
 * ⚠️ KEEP THIS IN STEP WITH THE COMPONENTS. `activityTraceEmission.test.tsx`
 * drives each wired kind through the DOM and asserts the recorded sequence, so
 * a family listed here that stopped emitting turns the suite red rather than
 * quietly writing two-action traces again.
 */
export const FAMILY_EMITTED = {
  selection: ['option_selected', 'option_deselected', 'answer_submitted'],
  arrangement: ['item_moved', 'pair_armed', 'pair_made', 'pair_broken', 'answer_submitted'],
  // `reading` is PARTIALLY wired: the scene kinds (`xray`, `live_type`,
  // `inspect`, 2026-09-24) and the scene-mechanics batch (`dial`, `wire`,
  // `spot`, `bucket`, `intercept`, `query`, `selector`, `timeline`, `plug`,
  // `press`, `arrange`, 2026-09-25) arrived with their instrumentation;
  // `concept_reveal`'s `reveal_opened`/`reveal_closed` still do not emit.
  // Filter on `kind` — `isSceneKind` in this module is the registry.
  reading: [
    'element_found',
    'text_edited',
    'gate_opened',
    'value_set',
    'cable_toggled',
    'option_picked',
    'step_visited',
    'order_changed',
    'pressed',
    'wire_connected',
    'chip_placed',
    'clause_toggled',
    'wrong_try',
    'part_assigned',
    'block_placed',
    'block_removed',
    'state_changed',
    'event_triggered',
  ],
  editor: [],
  // `scenario` is PARTIALLY wired: the TERMINAL sandbox emits, the CHAT sandbox
  // still does not. That asymmetry is deliberate and it is why this is a ledger
  // and not a target — the terminal is new, so there is no history to lose by
  // instrumenting it late, whereas retrofitting the 29 live chat rows is its
  // own change with its own regression surface. Anyone querying
  // `activity_traces` for the scenario family must therefore filter on
  // `spec.sandboxKind`, not assume the family is uniform.
  scenario: ['command_run', 'sandbox_reset'],
  // `inquiry` ships FULLY wired: the kind and its instrumentation arrived in the
  // same change, so there is no history to lose by instrumenting it late, and
  // nothing is declared here that does not emit.
  inquiry: [
    'option_marked',
    'option_unmarked',
    'other_toggled',
    'note_edited',
    'answer_submitted',
  ],
} as const satisfies Record<ActivityFamily, readonly LearnerActionType[]>;

/** Families whose activities hand a rich sequence up through `onComplete`. */
export const WIRED_FAMILIES: readonly ActivityFamily[] = ACTIVITY_FAMILIES.filter(
  (f) => FAMILY_EMITTED[f].length > 0
);

/**
 * ⚠️ PRIVACY RULE FOR PAYLOADS — applies to every family, forever.
 *
 * A trace payload carries WHICH thing the learner touched and WHEN, never WHAT
 * they wrote. The learner's answer text has exactly one home
 * (`activity_results.feedback.response`, capped at `MAX_RESPONSE_CHARS`, one
 * table over, written in the same call), and duplicating it into the trace
 * would mean two places to keep in step and two places to purge.
 *
 * Concretely: `code_edited` carries `{ length }`, not the source;
 * `slot_set` carries the slot's authored value (a fixed vocabulary item), not
 * free text. An action type that cannot be described without free text does not
 * belong in this vocabulary.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE CARVE-OUT: `command_run.command` (Tainan, 2026-08-06)
 * ─────────────────────────────────────────────────────────────────────────────
 * A shell command typed into the terminal sandbox IS free text by the letter of
 * the rule above, and it is recorded anyway. This is a decision, not an
 * oversight, and it is written here so the next reader does not "fix" it:
 *
 *   • **What is recorded** is the NORMALIZED form only —
 *     `normalizeCommand(raw).join(' ')`, quote-aware. Never the raw line. The
 *     raw line exists in the browser for the transcript echo and dies there.
 *   • **Why** — it is the only datum that can tell a genuine mistake apart from
 *     a matcher that is too strict. Without it, a learner who typed a perfectly
 *     good variant the author forgot to list appears in the data as an ordinary
 *     error, indistinguishable from someone who does not know the command; the
 *     activity reads as broken to them and as fine to us. The proxy that finds
 *     those — commands that ran and matched no step, grouped — is impossible to
 *     build if the command is not there.
 *   • **The reading that makes it consistent** — a terminal command is TOOL
 *     VOCABULARY, the same category as `slot_set`'s authored value, not the
 *     learner's prose. The thing the rule protects against is a learner's
 *     answer text living in two places; a terminal has no answer text. Its
 *     answer is which commands were run, and that is the shape of the payload.
 *   • **Question Q3 → B** on plan
 *     `20260806-itera-terminal-sandbox-activity`. Options A ("do not record")
 *     and C ("record only in options mode") were both rejected: C is the worst
 *     of both, since the options mode is exactly where a false negative CANNOT
 *     happen and free text is where it does.
 *
 * The flag below stays `true`: it is the default and it governs every other
 * action type. This carve-out is scoped to one key of one action.
 */
export const PAYLOADS_CARRY_NO_FREE_TEXT = true;

/**
 * The single documented exception to `PAYLOADS_CARRY_NO_FREE_TEXT`, as data
 * rather than prose, so a checker or an audit can enumerate it instead of
 * grepping a comment. `<action>.<payload key>`.
 */
export const FREE_TEXT_PAYLOAD_CARVE_OUTS: readonly string[] = ['command_run.command'];

/** Which family a kind belongs to. Total by construction (the trap above). */
export function familyOf(kind: ActivityKind): ActivityFamily {
  return ACTIVITY_FAMILY[kind];
}

/**
 * True for EVERY sandbox kind — `chat_sandbox` and `terminal_sandbox`.
 *
 * ⚠️ USE ISTO EM VEZ DE COMPARAR COM UM LITERAL DE KIND. Um site que testa um
 * kind só trata o OUTRO sandbox como um kind comum — e a falha nunca é um
 * crash, é o sandbox perdendo em silêncio o comportamento que aquele site
 * controla. O pior caso era o
 * `src/services/programs.service.ts`: ele colapsa os bags bilíngues de todo kind
 * não-sandbox, e o runtime do sandbox precisa deles NÃO colapsados, então virar
 * a coluna `kind` transformaria os 24 sandboxes vivos em card de spec inválido.
 *
 * Anda sobre o `ACTIVITY_FAMILY`, então herda a trap de exaustividade daquele
 * mapa: um quarto kind de sandbox não entra no enum sem ser classificado, e
 * classificá-lo como `scenario` é o que o torna verdadeiro aqui.
 */
export function isScenarioKind(kind: string): boolean {
  return kind in ACTIVITY_FAMILY && ACTIVITY_FAMILY[kind as ActivityKind] === 'scenario';
}

/**
 * The scene kinds (2026-09-24): reading-family kinds whose completion is GATED
 * on a gesture. A shell must not offer "Continuar" before the gesture, and must
 * hold the solved screen (reaction + stamp) instead of jumping ahead on it.
 */
export const SCENE_KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  'xray',
  'live_type',
  'inspect',
  // The scene-mechanics batch (2026-09-25) — batch A + batch B.
  'dial',
  'wire',
  'spot',
  'bucket',
  'intercept',
  'query',
  'selector',
  'timeline',
  'plug',
  'press',
  'arrange',
  // The system kinds (2026-09-30).
  'decompose_canvas',
  'compose_blocks',
  'state_lab',
  'event_trace',
]);

export function isSceneKind(kind: string | null | undefined): boolean {
  return !!kind && SCENE_KINDS.has(kind as ActivityKind);
}

/** The kinds in one family, in enum order. */
export function kindsOfFamily(family: ActivityFamily): ActivityKind[] {
  return (Object.keys(ACTIVITY_FAMILY) as ActivityKind[]).filter(
    (k) => ACTIVITY_FAMILY[k] === family
  );
}

/**
 * Runtime half of the family/action guard.
 *
 * The type-level half (`FamilyAction<F>` on the recorder) already makes a
 * selection activity unable to record `pair_made`. This exists for the read
 * side — a stored row's `type` is widened to `string` on purpose
 * (`StoredLearnerAction`), so anything attributing an old row to a family has
 * to ask rather than assume.
 */
export function isActionOfFamily(family: ActivityFamily, type: string): boolean {
  return (FAMILY_ACTIONS[family] as readonly string[]).includes(type);
}

/**
 * One action AS CAPTURED BY AN ACTIVITY, before it knows the trace origin.
 *
 * 🔑 IT LIVES HERE, NOT IN `learningTrace.ts`, AND THAT IS AN ARCHITECTURAL
 * BOUNDARY, NOT FILING. `src/test/traceEmissionBoundary.test.ts` forbids the
 * whole activity tree from importing `@/utils/learningTrace` or
 * `@/services/progress.service`, because `ActivityTestHarness` mounts those
 * very components and the absence of those imports is what guarantees a curator
 * testing an activity writes nothing. An activity has to name the type it
 * produces; this module is the half of the contract it is allowed to see —
 * vocabulary, no envelope, no writer.
 *
 * 🔑 THE `at` IS WALL CLOCK, NOT AN OFFSET, and the split is not cosmetic. The
 * trace origin is `settledAt - elapsedMs`, and neither number exists inside an
 * activity: the origin lives in the player (`activityStartedAt`, held behind
 * the resume gate) and `elapsedMs` is only sampled at settle. An activity
 * emitting offsets would need the player's clock threaded down through
 * `ActivityRenderer` into every kind, for a value that is one subtraction away.
 * So the activity stamps `Date.now()` and `buildAttemptTrace` rebases the list.
 *
 * Absolute milliseconds also survive the durable outbox intact
 * (`src/utils/answerOutbox.ts`): an entry that waits out a network outage in
 * localStorage still rebases onto the instant the learner actually answered,
 * not onto the reconnection.
 */
export interface RecordedAction {
  type: LearnerActionType;
  /** Wall clock (`Date.now()`) at the moment the learner did this. */
  at: number;
  /** Type-specific detail. NEVER free text — see the privacy rule above. */
  payload?: Record<string, unknown>;
}

/** True for the two envelope actions `buildAttemptTrace` writes itself. */
export function isLifecycleAction(type: string): boolean {
  return (LIFECYCLE_ACTIONS as readonly string[]).includes(type);
}
