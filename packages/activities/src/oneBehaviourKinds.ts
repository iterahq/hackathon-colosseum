/**
 * The ONE-BEHAVIOUR kinds — the renderer half of plan
 * `20260924-activity-type-one-behavior-rule` (tasks T9–T14, ADR-1…ADR-4).
 *
 * One activity type = one behaviour. Each kind below is ONE behaviour of an
 * old kind that held several (`code`, `chat_sandbox`, `terminal_sandbox`,
 * `document`, `question`, and the `spec.byoc` layer on a host kind). The KIND
 * now says what the learner does; no renderer picks a sub-renderer from the
 * shape of the spec for these kinds.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE MIRRORS THE LIST, AND HOW THE MIRROR GOES AWAY
 * ─────────────────────────────────────────────────────────────────────────────
 * `@iterahq/activity-spec` `main` exports these 22 kinds (activity-spec #55,
 * `957e30d`), but the release that carries them (1.4.0, release PR #56) is not
 * published yet. This package must render them BEFORE the data remap (T17)
 * moves production rows onto them, so it cannot wait for the release.
 *
 * So the list is mirrored here, with the names byte-identical to the spec, and
 * two seams make the switch to `^1.4.0` a no-op:
 *
 *  1. TYPES — `KnownActivityKind` is `ActivityKind | OneBehaviourKind`. On a
 *     spec that already exports the new kinds the union collapses into
 *     `ActivityKind`, so nothing downstream changes.
 *  2. VALIDATION — `safeParseKindSpec` asks the INSTALLED spec first
 *     (`kind in SPEC_SCHEMAS`). On 1.4.0 every new kind is answered by the real
 *     Zod schema and the fallback below is dead code. On 1.2.0 the fallback
 *     parses the spec under its TRANSITION parent and then checks the ONE
 *     narrowing that makes the kind (all blanks `bank`, every step `evaluate`,
 *     …) — the same narrowing the spec schemas apply.
 *
 * After the bump: delete `ONE_BEHAVIOUR_FALLBACK` and import the list from the
 * spec. `oneBehaviourKinds.test.ts` pins the names, so a spec rename fails CI
 * here instead of rendering an "unsupported kind" card.
 */
import {
  resolveByocSpec,
  safeParseActivitySpec,
  SPEC_SCHEMAS,
  type ActivityKind,
} from '@iterahq/activity-spec';

/** The 22 one-behaviour kinds, in the order `ACTIVITY_KINDS` lists them. */
export const ONE_BEHAVIOUR_KINDS = [
  // code (T9)
  'code_editor_checks',
  'code_editor_ungraded',
  'code_fill_bank',
  'code_fill_select',
  'code_fill_type',
  // chat_sandbox (T10)
  'chat_compose',
  'chat_fill_select',
  'chat_fill_type',
  'chat_pick_context',
  'chat_rate_reply',
  // terminal_sandbox (T11)
  'terminal_type_command',
  'terminal_pick_command',
  'terminal_build_command',
  // document (T12)
  'document_read',
  'document_reflect',
  'document_ai_judge',
  // the `spec.byoc` layer (T13)
  'byoc_pick_best',
  'byoc_judge_each',
  'byoc_build_context',
  // question (T14) — never stored, no enum label, like `question`
  'question_pick_one',
  'question_pick_many',
  'question_write',
] as const;

export type OneBehaviourKind = (typeof ONE_BEHAVIOUR_KINDS)[number];

/**
 * Every kind a renderer may receive: the installed spec's `ActivityKind` plus
 * the one-behaviour kinds. Collapses into `ActivityKind` on spec `^1.4.0`.
 */
export type KnownActivityKind = ActivityKind | OneBehaviourKind;

/** The old kinds that split. `concept` stands for "a host kind with `spec.byoc`". */
export type TransitionParentKind =
  | 'code'
  | 'chat_sandbox'
  | 'terminal_sandbox'
  | 'document'
  | 'question'
  | 'concept';

/** New kind → the old kind whose rows move onto it (plan v3 table). */
export const ONE_BEHAVIOUR_PARENT: Record<OneBehaviourKind, TransitionParentKind> = {
  code_editor_checks: 'code',
  code_editor_ungraded: 'code',
  code_fill_bank: 'code',
  code_fill_select: 'code',
  code_fill_type: 'code',
  chat_compose: 'chat_sandbox',
  chat_fill_select: 'chat_sandbox',
  chat_fill_type: 'chat_sandbox',
  chat_pick_context: 'chat_sandbox',
  chat_rate_reply: 'chat_sandbox',
  terminal_type_command: 'terminal_sandbox',
  terminal_pick_command: 'terminal_sandbox',
  terminal_build_command: 'terminal_sandbox',
  document_read: 'document',
  document_reflect: 'document',
  document_ai_judge: 'document',
  byoc_pick_best: 'concept',
  byoc_judge_each: 'concept',
  byoc_build_context: 'concept',
  question_pick_one: 'question',
  question_pick_many: 'question',
  question_write: 'question',
};

export function isOneBehaviourKind(kind: unknown): kind is OneBehaviourKind {
  return typeof kind === 'string' && (ONE_BEHAVIOUR_KINDS as readonly string[]).includes(kind);
}

/**
 * The kind a CONSUMER should reason about when it only knows the old kinds —
 * `code_fill_bank` → `code`, `terminal_pick_command` → `terminal_sandbox`.
 * Identity for every other kind. Use it for "is this a code/terminal/chat
 * activity?" questions (column width, live mirrors), never for dispatch.
 */
export function transitionKindOf(kind: string): string {
  return isOneBehaviourKind(kind) ? ONE_BEHAVIOUR_PARENT[kind] : kind;
}

/** The testid of a kind's invalid-spec card: `code_fill_bank` → `code-fill-bank-invalid`. */
export function kindInvalidTestId(kind: string): string {
  return `${kind.replace(/_/g, '-')}-invalid`;
}

/** True when the installed `@iterahq/activity-spec` has a schema for `kind`. */
export function specPackageKnowsKind(kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(SPEC_SCHEMAS, kind);
}

/** The subset of Zod's `SafeParseReturnType` the renderers read. */
export type KindSpecParse = { success: true; data: unknown } | { success: false; error: string };

/**
 * Validate `spec` against the schema of `kind`.
 *
 * The installed spec answers when it knows the kind. For a one-behaviour kind
 * it does not know yet (spec < 1.4.0), the fallback answers — see the header.
 * An unknown kind that is not a one-behaviour kind fails, never throws.
 */
export function safeParseKindSpec(kind: string, spec: unknown): KindSpecParse {
  if (specPackageKnowsKind(kind)) {
    const parsed = safeParseActivitySpec(kind as ActivityKind, spec);
    return parsed.success
      ? { success: true, data: parsed.data }
      : { success: false, error: parsed.error.message };
  }
  if (isOneBehaviourKind(kind)) return ONE_BEHAVIOUR_FALLBACK[kind](spec);
  return { success: false, error: `unknown activity kind "${kind}"` };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE FALLBACK — spec < 1.4.0 only. Dead code once the spec knows the kinds.
 *
 * Each entry = the transition parent's own schema (structure) + the one
 * narrowing that makes the kind (behaviour). The narrowings are the ones
 * `activity-spec` `src/schemas/*-kinds.ts` apply, read off the raw input so a
 * parent default (`allow_other: true`) cannot hide an authored key.
 * ═══════════════════════════════════════════════════════════════════════════ */

type Raw = Record<string, unknown>;

function asRaw(spec: unknown): Raw | null {
  return spec && typeof spec === 'object' && !Array.isArray(spec) ? (spec as Raw) : null;
}

function list(value: unknown): Raw[] {
  return Array.isArray(value) ? (value.filter((v) => asRaw(v)) as Raw[]) : [];
}

function absent(raw: Raw, ...keys: string[]): boolean {
  return keys.every((k) => raw[k] === undefined);
}

function fail(kind: OneBehaviourKind, why: string): KindSpecParse {
  return { success: false, error: `${kind}: ${why}` };
}

/** Parse under the transition parent, then apply the kind's narrowing. */
function narrowed(
  kind: OneBehaviourKind,
  parent: ActivityKind,
  fits: (raw: Raw) => string | null,
  parentInput: (raw: Raw) => unknown = (raw) => raw,
): (spec: unknown) => KindSpecParse {
  return (spec) => {
    const raw = asRaw(spec);
    if (!raw) return fail(kind, 'spec is not an object');
    const why = fits(raw);
    if (why) return fail(kind, why);
    const parsed = safeParseActivitySpec(parent, parentInput(raw));
    return parsed.success ? { success: true, data: spec } : fail(kind, parsed.error.message);
  };
}

/* ── code ────────────────────────────────────────────────────────────────── */

function codeEditor(raw: Raw, graded: boolean): string | null {
  if (list(raw.blanks).length > 0 || raw.word_bank !== undefined) return 'the open editor has no blanks';
  if (raw.byoc !== undefined) return 'spec.byoc is not accepted';
  const checks = list(raw.checks).length;
  if (graded && checks === 0) return 'at least one DOM check is required';
  if (!graded && checks > 0) return 'an ungraded editor has no checks';
  return null;
}

function codeFill(raw: Raw, blankKind: 'bank' | 'select' | 'text'): string | null {
  const blanks = list(raw.blanks);
  if (blanks.length === 0) return 'at least one blank is required';
  if (blanks.some((b) => b.kind !== blankKind)) return `every blank must be "${blankKind}"`;
  if (list(raw.checks).length > 0) return 'a fill kind has no DOM checks';
  if (raw.byoc !== undefined) return 'spec.byoc is not accepted';
  if (blankKind !== 'bank' && raw.word_bank !== undefined) return 'word_bank belongs to code_fill_bank';
  if (typeof raw.starter !== 'string' || raw.starter.length === 0) return 'starter is required';
  return null;
}

/* ── chat ────────────────────────────────────────────────────────────────── */

const LIVE_MODEL_KEYS = [
  'live',
  'prompt',
  'placeholder',
  'system',
  'ratePrompt',
  'goodLabel',
  'badLabel',
  'seedMessages',
];

function chatBase(raw: Raw): string | null {
  if (!absent(raw, ...LIVE_MODEL_KEYS)) return 'the live-model layer is not accepted';
  if (!absent(raw, 'evaluation', 'byoc')) return 'spec.evaluation and spec.byoc are not accepted';
  if (raw.openness === 'byoc') return 'openness "byoc" is a live model';
  return null;
}

function chatSteps(raw: Raw, mode: 'compose' | 'evaluate', expose: 'slots' | 'choices' | null) {
  const steps = list(raw.steps);
  if (steps.length === 0) return 'at least one step is required';
  for (const step of steps) {
    const stepMode = step.mode ?? 'compose';
    if (stepMode !== mode) return `every step must be "${mode}"`;
    const exposed = asRaw(step.expose);
    if (!exposed) continue;
    if (!expose) return 'a step of this kind exposes nothing';
    if (Object.keys(exposed).some((k) => k !== expose)) return `a step may expose only "${expose}"`;
  }
  return null;
}

function chatFill(raw: Raw, slotKind: 'select' | 'text'): string | null {
  const slots = list(raw.slots);
  if (slots.length === 0) return 'at least one slot is required';
  if (slots.some((s) => s.kind !== slotKind)) return `every slot must be "${slotKind}"`;
  if (raw.choices !== undefined) return 'choices belong to chat_pick_context';
  return chatBase(raw) ?? chatSteps(raw, 'compose', 'slots');
}

/* ── terminal ────────────────────────────────────────────────────────────── */

function terminalBase(raw: Raw): string | null {
  if (!absent(raw, 'slots', 'choices', 'evaluation', 'byoc')) {
    return 'slots, choices, spec.evaluation and spec.byoc are not accepted';
  }
  if (list(raw.steps).some((s) => s.mode !== undefined)) return 'a terminal step has no mode';
  return null;
}

function terminalOptions(raw: Raw, granularity: 'command' | 'token'): string | null {
  const base = terminalBase(raw);
  if (base) return base;
  if (raw.inputMode !== undefined && raw.inputMode !== 'options') return 'inputMode must be "options"';
  const other = granularity === 'command' ? 'tokens' : 'commands';
  for (const step of list(raw.steps)) {
    const exposed = asRaw(step.expose);
    if (!exposed) continue;
    if (exposed[other] !== undefined) return `a step may not offer ${other}`;
    const g = exposed.optionGranularity;
    if (g !== undefined && g !== granularity) return `every step must be "${granularity}"`;
  }
  return null;
}

/* ── document ────────────────────────────────────────────────────────────── */

function documentEvaluation(raw: Raw, mode: 'word-count' | 'ai-judge' | null): string | null {
  if (raw.byoc !== undefined) return 'spec.byoc is not accepted';
  const evaluation = asRaw(raw.evaluation);
  if (raw.evaluation === undefined) return null;
  if (!mode) return 'a read-only document has no evaluation';
  if (!evaluation || evaluation.mode !== mode) return `evaluation must be "${mode}"`;
  return null;
}

/* ── byoc ────────────────────────────────────────────────────────────────── */

function byocKind(kind: OneBehaviourKind, interaction: string) {
  return (spec: unknown): KindSpecParse => {
    const raw = asRaw(spec);
    if (!raw) return fail(kind, 'spec is not an object');
    if (!asRaw(raw.instruction)) return fail(kind, 'instruction is required');
    if (!asRaw(raw.byoc)) return fail(kind, 'byoc is required');
    const resolved = resolveByocSpec(raw);
    if (resolved.ok === false) return fail(kind, resolved.reason);
    const harness = resolved.spec.harness as { interaction?: string };
    if (harness.interaction !== interaction) return fail(kind, `harness.interaction must be "${interaction}"`);
    const fallback = resolved.spec.fallback as { interaction?: string } | undefined;
    if (fallback && fallback.interaction !== interaction) {
      return fail(kind, `fallback.interaction must be "${interaction}"`);
    }
    return { success: true, data: spec };
  };
}

/* ── question ────────────────────────────────────────────────────────────── */

function questionPick(raw: Raw): string | null {
  if (!absent(raw, 'mode', 'allow_other', 'free_text', 'byoc')) {
    return 'mode, allow_other, free_text and byoc are not accepted — the kind says it';
  }
  return null;
}

function questionWrite(spec: unknown): KindSpecParse {
  const raw = asRaw(spec);
  if (!raw) return fail('question_write', 'spec is not an object');
  if (!absent(raw, 'mode', 'allow_other', 'options', 'recommended_option_id', 'byoc')) {
    return fail('question_write', 'options, mode, allow_other and byoc are not accepted');
  }
  if (absent(raw, 'title', 'description', 'instruction')) {
    return fail('question_write', 'a question needs `title`, `description` or `instruction`');
  }
  const freeText = raw.free_text;
  if (freeText !== undefined && !asRaw(freeText)) return fail('question_write', 'free_text is an object');
  return { success: true, data: spec };
}

export const ONE_BEHAVIOUR_FALLBACK: Record<OneBehaviourKind, (spec: unknown) => KindSpecParse> = {
  code_editor_checks: narrowed('code_editor_checks', 'code', (r) => codeEditor(r, true)),
  code_editor_ungraded: narrowed('code_editor_ungraded', 'code', (r) => codeEditor(r, false)),
  code_fill_bank: narrowed('code_fill_bank', 'code', (r) => codeFill(r, 'bank')),
  code_fill_select: narrowed('code_fill_select', 'code', (r) => codeFill(r, 'select')),
  code_fill_type: narrowed('code_fill_type', 'code', (r) => codeFill(r, 'text')),
  chat_compose: narrowed('chat_compose', 'chat_sandbox', (r) =>
    !absent(r, 'slots', 'choices')
      ? 'slots and choices belong to the fill and pick kinds'
      : (chatBase(r) ?? chatSteps(r, 'compose', null)),
  ),
  chat_fill_select: narrowed('chat_fill_select', 'chat_sandbox', (r) => chatFill(r, 'select')),
  chat_fill_type: narrowed('chat_fill_type', 'chat_sandbox', (r) => chatFill(r, 'text')),
  chat_pick_context: narrowed('chat_pick_context', 'chat_sandbox', (r) =>
    list(r.choices).length === 0
      ? 'at least one choice is required'
      : r.slots !== undefined
        ? 'slots belong to the fill kinds'
        : (chatBase(r) ?? chatSteps(r, 'compose', 'choices')),
  ),
  chat_rate_reply: narrowed('chat_rate_reply', 'chat_sandbox', (r) =>
    !absent(r, 'slots', 'choices')
      ? 'a rated reply has no slots or choices'
      : (chatBase(r) ?? chatSteps(r, 'evaluate', null)),
  ),
  terminal_type_command: narrowed('terminal_type_command', 'terminal_sandbox', (r) => {
    const base = terminalBase(r);
    if (base) return base;
    if (r.inputMode !== undefined && r.inputMode !== 'freeText') return 'inputMode must be "freeText"';
    return list(r.steps).some((s) => s.expose !== undefined) ? 'a typed command exposes no palette' : null;
  }),
  terminal_pick_command: narrowed('terminal_pick_command', 'terminal_sandbox', (r) =>
    terminalOptions(r, 'command'),
  ),
  terminal_build_command: narrowed('terminal_build_command', 'terminal_sandbox', (r) =>
    terminalOptions(r, 'token'),
  ),
  document_read: narrowed('document_read', 'document', (r) => documentEvaluation(r, null)),
  document_reflect: narrowed('document_reflect', 'document', (r) => documentEvaluation(r, 'word-count')),
  document_ai_judge: narrowed('document_ai_judge', 'document', (r) => documentEvaluation(r, 'ai-judge')),
  byoc_pick_best: byocKind('byoc_pick_best', 'pick_best'),
  byoc_judge_each: byocKind('byoc_judge_each', 'judge_each'),
  byoc_build_context: byocKind('byoc_build_context', 'build_context'),
  // The parent `question` requires `mode`; the kind supplies it, the author does not.
  question_pick_one: narrowed('question_pick_one', 'question', questionPick, (r) => ({
    ...r,
    mode: 'single',
  })),
  question_pick_many: narrowed('question_pick_many', 'question', questionPick, (r) => ({
    ...r,
    mode: 'multi',
  })),
  question_write: questionWrite,
};
