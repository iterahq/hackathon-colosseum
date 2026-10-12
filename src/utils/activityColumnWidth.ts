/**
 * SHARED rule for how wide the focused activity column may get, keyed on the
 * ACTIVITY KIND.
 *
 * ── Why this lives in `src/utils/` and not inside a page ──────────────────────
 *
 * The rule was born inside `LessonPlayer` (the ASYNC study path). The live-class
 * surfaces — `LiveSessionPage` (student) and `live/InstructorClassPage`
 * (professor) — render the SAME activities through the same components, but they
 * carried their OWN copy of the width ternary, so the widening never reached the
 * synchronous class: a `code` snack stayed squeezed at `max-w-2xl` in the exact
 * surface a whole cohort is looking at. One module, three consumers — the rule
 * cannot silently diverge per surface again.
 *
 * ── The measurement behind `max-w-7xl` ───────────────────────────────────────
 *
 * The default column is `max-w-2xl` (672px) because that is the comfortable
 * measure for text, prompts and stacked options. A `code` snack, though, is a
 * SPLIT PANE (Monaco on the left, live preview on the right) nested inside that
 * same column, so it only gets HALF of it.
 *
 * Measured at 1440x900 with the real Monaco build (each pane =
 * `(min(vw, cap) − page padding − 48 card padding − 16 grid gap) / 2`):
 *
 *   | column cap    | pane  | Monaco content | `<h1 className="…">` wraps into |
 *   |---------------|-------|----------------|---------------------------------|
 *   | max-w-2xl 672 | 280px | 212px          | 4 visual lines                  |
 *   | max-w-5xl1024 | 456px | 388px          | 2 visual lines                  |
 *   | max-w-6xl1152 | 520px | 452px          | 2 visual lines                  |
 *   | max-w-7xl1280 | 584px | 516px          | 1 — no wrap                     |
 *
 * `max-w-7xl` is therefore the smallest cap that stops the reference starter
 * line from wrapping at all, which is the whole point: a beginner reads a
 * wrapped line as "my code is broken".
 *
 * Widening is opt-in PER KIND (not "any kind that embeds an editor") so the
 * prose measure of every other activity is untouched.
 */
import type { ActivityKind } from '@/types/content';

/** Prose measure — the default for every kind that is text/prompt/options. */
export const DEFAULT_COLUMN_MAX_WIDTH = 'max-w-2xl';

/** The wide cap, sized off the Monaco split-pane measurement above. */
export const WIDE_COLUMN_MAX_WIDTH = 'max-w-7xl';

/**
 * Activity kinds that need a WIDE reading column instead of the prose measure.
 * Kept as a set (not a lone `=== 'code'`) so adding a future split-pane kind is
 * a one-line change that lands on all three surfaces at once.
 */
export const WIDE_COLUMN_KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  'code',
  // Every one-behaviour code kind is the same split pane (plan T9).
  'code_editor_checks',
  'code_editor_ungraded',
]);

/**
 * The fill-in code kinds are a LOCKED template beside its preview — no Monaco,
 * and lesson code is written to 34 columns. In the wide cap the template used a
 * quarter of its pane and the exercise read as an empty 1232 px slab, so they
 * take the same middle cap as the scenes.
 */
export const GUIDED_COLUMN_KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  'code_fill_bank',
  'code_fill_select',
  'code_fill_type',
]);

/**
 * The scene kinds put a page and its source SIDE BY SIDE (`live_type`,
 * `inspect`) or need a stage wide enough to sweep (`xray`). In the prose
 * measure the source column truncates, so they get a middle cap — on every
 * surface, which is why it lives here and not in a page's overrides.
 */
export const SCENE_COLUMN_MAX_WIDTH = 'max-w-5xl';
export const SCENE_COLUMN_KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  'xray',
  'live_type',
  'inspect',
  // The scene-mechanics batch (2026-09-25) — every one of them pairs a stage
  // (page, board, editor or table) with a second column of controls, so the
  // prose measure truncates them the same way it truncates `live_type`.
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
  // The system kinds (2026-09-30) put the interface beside its state, tree or trace.
  'decompose_canvas',
  'compose_blocks',
  'state_lab',
  'event_trace',
]);

/**
 * Per-surface caps for kinds that are NOT in `WIDE_COLUMN_KINDS`.
 *
 * The live surfaces give the sandbox kinds a roomier `max-w-4xl` because the
 * scenario runs on a projector; the solo player does not. That is a legitimate
 * per-surface difference, so it stays at the call site instead of being baked in
 * here (baking it in would silently widen the solo player too).
 */
export type ColumnMaxWidthOverrides = Partial<Record<ActivityKind, string>>;

/**
 * Tailwind max-width for the focused activity column.
 *
 * `max-w-*` only CAPS the width — the column still shrinks to the viewport below
 * the cap, so the wide variant stays responsive (on a phone the split pane just
 * stacks, `grid-cols-1`) and never overflows horizontally. Pair it with `w-full`
 * and `mx-auto`; never with a fixed `w-[…px]`.
 *
 * `undefined` kind (loading / error / completion chrome — plain prose cards)
 * resolves to the prose measure.
 *
 * NOTE ON PRECEDENCE: `WIDE_COLUMN_KINDS` wins over `overrides` BY DESIGN. A
 * surface may widen an extra kind, but it may not re-narrow `code` back into the
 * prose measure — that regression is exactly what this module exists to prevent.
 */
export function columnMaxWidthClass(
  kind: ActivityKind | undefined,
  overrides?: ColumnMaxWidthOverrides
): string {
  if (!kind) return DEFAULT_COLUMN_MAX_WIDTH;
  if (WIDE_COLUMN_KINDS.has(kind)) return WIDE_COLUMN_MAX_WIDTH;
  if (GUIDED_COLUMN_KINDS.has(kind)) return SCENE_COLUMN_MAX_WIDTH;
  if (SCENE_COLUMN_KINDS.has(kind)) return overrides?.[kind] ?? SCENE_COLUMN_MAX_WIDTH;
  return overrides?.[kind] ?? DEFAULT_COLUMN_MAX_WIDTH;
}

/**
 * The override map both LIVE surfaces (student + instructor) use — the
 * pre-existing sandbox = `max-w-4xl` rule, preserved verbatim.
 */
export const LIVE_COLUMN_OVERRIDES: ColumnMaxWidthOverrides = {
  // Os dois kinds de sandbox: a regra é sobre a LARGURA da janela do sandbox, que
  // a divisão do 0.11.0 não mudou.
  chat_sandbox: 'max-w-4xl',
  terminal_sandbox: 'max-w-4xl',
};
