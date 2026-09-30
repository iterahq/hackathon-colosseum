/**
 * The AUTHORED SHAPES the extracted renderers read out of `activity.spec`.
 *
 * These lived in the app at `src/types/content.ts`, mixed in with the Itera
 * content model (`Program`, `Unit`, `Lesson`, `Activity`, `Badge`, …). Fase C
 * splits that file in two along the line ADR-1 draws: the **spec** of an
 * activity is what a renderer reads, so it travels with the renderers; the
 * **content model** is Itera's own hierarchy, so it stays in the app.
 * `src/types/content.ts` now re-exports the half that moved, which is why the
 * app's 24 `@/types/content` imports did not have to change.
 *
 * ⚠️ THESE ARE NOT THE VALIDATION SCHEMAS. `@iterahq/activity-spec` owns the
 * Zod schemas and is the authority on what a valid spec is; these interfaces
 * are the READ VIEW a renderer needs, kept deliberately loose (every field the
 * renderer tolerates being absent is optional) so a renderer degrades into an
 * empty panel instead of throwing on a half-authored row. Validation happens
 * BEFORE the renderer — `ActivityRendererProps.activity` is documented as
 * already validated.
 *
 * They are declared here rather than imported from `@iterahq/activity-spec`
 * because that package is being tightened in parallel; importing its inferred
 * types would couple this extraction to that work. Reconciling the two is a
 * deliberate follow-up, noted in README.md.
 */

/**
 * The shared instruction primitive — a flexible context block reused by most
 * kinds. ANY combination of text · audio · image · video, plus an optional
 * description below. All fields optional: the flexibility is the point.
 */
export interface InstructionPanelSpec {
  text?: string;
  audio_url?: string;
  image_url?: string;
  video_url?: string;
  description?: string;
}

/** `concept` — a no-action display; just an InstructionPanel (read/watch). */
export interface ConceptSpec {
  instruction: InstructionPanelSpec;
}

/** `concept_reveal` — a concept that ends in an ungraded think-first card. */
export interface ConceptRevealSpec {
  instruction: InstructionPanelSpec;
  reveal: { prompt: string; answer: string };
}

/** `video` — a video with an optional InstructionPanel around it. */
export interface VideoSpec {
  video_url: string;
  instruction?: InstructionPanelSpec;
}

/** A selectable option/card — carries text, image, and/or audio. */
export interface ChoiceOption {
  id: string;
  label?: string;
  image_url?: string;
  audio_url?: string;
}

/** `single_choice` — multiple choice, exactly one correct. */
export interface SingleChoiceSpec {
  instruction?: InstructionPanelSpec;
  options: ChoiceOption[];
  correct_option_id: string;
}

/** `multi_choice` — multiple choice, one-or-more correct. */
export interface MultiChoiceSpec {
  instruction?: InstructionPanelSpec;
  options: ChoiceOption[];
  correct_option_ids: string[];
}

/** One authored left↔right correspondence of a `match` activity. */
export interface MatchPair {
  left_id: string;
  right_id: string;
}

/** `match` — connect cards on the left to cards on the right. */
export interface MatchSpec {
  instruction?: InstructionPanelSpec;
  left: ChoiceOption[];
  right: ChoiceOption[];
  pairs: MatchPair[];
}

/** `order` — a scrambled sequence the learner reorders into `correct_order`. */
export interface OrderSpec {
  instruction?: InstructionPanelSpec;
  items: ChoiceOption[];
  correct_order: string[];
}

/** Bilingual bag stored as jsonb (`{ pt, en }`). */
export type I18nText = { pt?: string; en?: string; [k: string]: string | undefined };

/* ─────────── Fase D — the three kinds that were inline in the Player ─────── */
/*
 * `document`, `diagram` and `quiz` never had a file: they were functions inside
 * `src/components/branded/activity/ActivityRenderer.tsx`, and the shapes below
 * were `as` casts written at their top. They are collected here for the same
 * reason the seven above are — a renderer reads them, so they travel with the
 * renderers — and kept just as loose, for the same reason: every field a
 * renderer tolerates being absent is optional, so a half-authored row degrades
 * into an empty panel instead of throwing.
 */

/**
 * `document` — a prompt with an optional body. THREE renderers read this one
 * shape, and which of them runs is decided by the RUBRIC, not by the spec:
 * `rubric.mode === 'ai-judge'` (with the judge port present) is the AI-judged
 * open-scope variant, a `prompt` or a `min_words` rubric is the reflection
 * variant, and anything else is the read-only card.
 */
export interface DocumentSpec {
  prompt?: string;
  body?: string;
  title?: string;
}

/**
 * The `document` rubric, reduced to the two fields the renderers read.
 *
 * It is a RUBRIC and not a spec: `min_words` is a grading threshold and
 * `mode` selects the grader. `PortableActivity.rubric` is where it arrives.
 */
export interface DocumentRubric {
  mode?: string;
  min_words?: number;
}

/** One labelled callout beside a `diagram`. */
export interface DiagramHighlight {
  term: string;
  caption?: string;
}

/** `diagram` — an image OR a mermaid source, plus optional highlighted terms. */
export interface DiagramSpec {
  prompt?: string;
  mermaid?: string;
  imageUrl?: string;
  highlights?: DiagramHighlight[];
}

/**
 * One `quiz` option.
 *
 * ⚠️ Correctness rides on the OPTION (`isCorrect`), not on a top-level
 * `correct_option_id` the way `single_choice` does — that is the reason `quiz`
 * is a separate contract rather than a variation of the choice family. And the
 * id is OPTIONAL, which is why the quiz keys its trace on the index: it is the
 * one kind in the selection family with no authored id to key on, and the one
 * kind that does not shuffle, so the index IS the authored position.
 */
export interface QuizOption {
  id?: string;
  label?: string;
  text?: string;
  isCorrect?: boolean;
}

/** `quiz` — the hero kind: one question, options carrying their own verdict. */
export interface QuizSpec {
  prompt?: string;
  question?: string;
  label?: string;
  options?: QuizOption[];
  explanation?: string;
}

/* ─────────── `question` — the non-grading ask (2026-08-28, ADR-6) ────────── */
/*
 * The read view of the kind that has no correct answer. It is NOT a variation
 * of `SingleChoiceSpec`: `QuestionOptionSpec` carries a `description` (what
 * choosing this option MEANS), `label` is required rather than optional, and
 * there is no `correct_option_id` for a renderer to grade against.
 *
 * Kept as loose as its neighbours — every field a renderer tolerates being
 * absent is optional — so a half-authored question degrades into a panel with
 * no options instead of throwing. `@iterahq/activity-spec` remains the
 * authority on what a VALID question is.
 */

/** One answerable option. `label` is required — a question is read, not looked at. */
export interface QuestionOptionSpec {
  id: string;
  label?: string;
  /** What choosing this option means — the trade-off, in a sentence or two. */
  description?: string;
  image_url?: string;
}

/** Wording overrides for the free-text field. Its PRESENCE is not optional. */
export interface QuestionFreeTextSpec {
  label?: string;
  placeholder?: string;
}

/**
 * `question` — options and/or free text, no correct answer, no verdict.
 *
 * ⚠️ `allow_other` is optional HERE and defaults to `true` in the Zod schema.
 * The renderer therefore tests `allow_other !== false`, never `=== true`: a
 * spec that arrived without passing through the schema must still get the
 * permissive reading.
 */
export interface QuestionSpec {
  title?: string;
  description?: string;
  instruction?: InstructionPanelSpec;
  mode?: 'single' | 'multi';
  options: QuestionOptionSpec[];
  recommended_option_id?: string;
  allow_other?: boolean;
  free_text?: QuestionFreeTextSpec;
}

/* ───────── the scene kinds — `xray`, `live_type`, `inspect` (2026-09-24) ──────── */
/*
 * Read views of the three gesture-gated kinds. Loose like their neighbours;
 * `@iterahq/activity-spec` (`schemas/scene.ts`) is the authority on validity.
 * Text fields may arrive as a plain string or a `{ pt, en }` bag.
 */

export type SceneLocalizedText = string | { pt?: string; en?: string };

export type SceneTag = 'h1' | 'h2' | 'h3' | 'p' | 'a' | 'button' | 'li' | 'strong' | 'em' | 'span';

export interface ScenePageElementSpec {
  id: string;
  tag: SceneTag;
  attrs?: Record<string, string>;
  text: string;
  name: SceneLocalizedText;
  job?: SceneLocalizedText;
}

export interface ScenePageSpec {
  url_label?: string;
  elements: ScenePageElementSpec[];
}

export interface SceneFrameSpec {
  guide?: { name: SceneLocalizedText };
  prompt: SceneLocalizedText;
  reaction: SceneLocalizedText;
  stamp: SceneLocalizedText;
  page: ScenePageSpec;
}

export interface XraySpec extends SceneFrameSpec {
  coverage_goal?: number;
}

export interface LiveTypeSpec extends SceneFrameSpec {
  target_id: string;
  min_length?: number;
}

export type InspectSpec = SceneFrameSpec;

/* ── the scene-mechanics batch — `dial`, `plug`, `selector`, `timeline`, ────
 * `arrange`, `press` (batch A) + `wire`, `spot`, `bucket`, `intercept`, ──────
 * `query` (batch B) — plan `20260924-itera-scene-mechanics-kinds` ───────────
 *
 * Read views of the eleven gesture-gated beats, ported from dfl-labs
 * (`mechanics/*Beat.tsx`). Loose like their `xray`/`live_type`/`inspect`
 * neighbours — `@iterahq/activity-spec` (PR #54, head 061a0a0) is the
 * authority on validity.
 *
 * `@iterahq/activity-spec` 1.4.0 carries all eleven names in `ActivityKind`,
 * their schemas and the `/runtime` helpers (`runQuery`, `matchSelector`, …).
 */

/** One CSS property the renderer restyles — mirrors `CSS_PROPERTIES` in `scene-mechanics.ts`. */
export type SceneCssProperty =
  | 'font-size'
  | 'padding'
  | 'margin'
  | 'gap'
  | 'border-radius'
  | 'width'
  | 'opacity'
  | 'line-height'
  | 'color'
  | 'background'
  | 'border'
  | 'text-decoration';

/** `dial` — drag a slider until the styled element settles inside `target`. */
export interface DialSpec {
  guide?: { name: SceneLocalizedText };
  prompt: SceneLocalizedText;
  reaction: SceneLocalizedText;
  stamp: SceneLocalizedText;
  page: ScenePageSpec;
  target_id: string;
  property: SceneCssProperty;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  start: number;
  target: [number, number];
  target_hint?: SceneLocalizedText;
}

/** One `plug.stylesheet[]` rule. */
export interface PlugStylesheetRule {
  target_id: string;
  property: SceneCssProperty;
  value: string;
}

/** `plug` — pull the cable and the page collapses; plug it back and it heals. */
export interface PlugSpec {
  guide?: { name: SceneLocalizedText };
  prompt: SceneLocalizedText;
  reaction: SceneLocalizedText;
  stamp: SceneLocalizedText;
  page: ScenePageSpec;
  stylesheet: PlugStylesheetRule[];
  cable_name: string;
  on_label: SceneLocalizedText;
  off_label: SceneLocalizedText;
}

/** One `selector.elements[]` entry — a flat element the matcher can hit. */
export interface SelectorElementSpec {
  id: string;
  tag: string;
  classes: string[];
}

/** `selector` — pick the CSS selector that names exactly `targets`. */
export interface SelectorSpec {
  guide?: { name: SceneLocalizedText };
  prompt: SceneLocalizedText;
  reaction: SceneLocalizedText;
  stamp: SceneLocalizedText;
  elements: SelectorElementSpec[];
  options: string[];
  targets: string[];
  rule: { property: SceneCssProperty; value: string };
}

/** One `timeline.steps[]` frame — a page or a block of source lines, never both. */
export type TimelineFrameSpec =
  | { type: 'page'; page: ScenePageSpec }
  | { type: 'code'; lines: string[] };

export interface TimelineStepSpec {
  label: SceneLocalizedText;
  note: SceneLocalizedText;
  frame: TimelineFrameSpec;
}

/** `timeline` — scrub through every step of a frame. Ungraded (reading family). */
export interface TimelineSpec {
  /** activity-spec PR #54 (head 061a0a0): `spot`/`timeline`/`press` gained an optional guide. */
  guide?: { name: SceneLocalizedText };
  prompt: SceneLocalizedText;
  reaction: SceneLocalizedText;
  stamp: SceneLocalizedText;
  axis: SceneLocalizedText;
  steps: TimelineStepSpec[];
}

/** One `arrange.items[]` entry. */
export interface ArrangeItemSpec {
  id: string;
  label: SceneLocalizedText;
  sub?: SceneLocalizedText;
}

/** `arrange` — drag items until they settle in the right order. */
export interface ArrangeSpec {
  prompt: SceneLocalizedText;
  reaction: SceneLocalizedText;
  stamp: SceneLocalizedText;
  items: ArrangeItemSpec[];
  correct: string[];
  start: string[];
  item_style?: 'code' | 'card';
}

/** One `press.options[]` choice. */
export interface PressOptionSpec {
  id: string;
  label: SceneLocalizedText;
  code: string;
}

/** The closed effect union `press.effect` carries. */
export type PressEffectSpec =
  | { type: 'counter' }
  | { type: 'toggle_class'; target_id: string; class_name: string }
  | { type: 'append_text'; target_id: string; text: SceneLocalizedText };

/** `press` — pick the reaction, then press until `goal` is reached. */
export interface PressSpec {
  /** activity-spec PR #54 (head 061a0a0): `spot`/`timeline`/`press` gained an optional guide. */
  guide?: { name: SceneLocalizedText };
  prompt: SceneLocalizedText;
  reaction: SceneLocalizedText;
  stamp: SceneLocalizedText;
  file: string;
  before?: string[];
  options: PressOptionSpec[];
  correct: string;
  wrong_hint: SceneLocalizedText;
  button: SceneLocalizedText;
  goal: number;
  effect: PressEffectSpec;
  page?: ScenePageSpec;
}

/* ── batch B — `wire`, `spot`, `bucket`, `intercept`, `query` ──────────────
 * (plan `20260924-itera-scene-mechanics-kinds`, 2026-09-25) ─────────────────
 *
 * Shapes below are read off `@iterahq/activity-spec` PR #54 (head 061a0a0)
 * `WireSpecSchema` / `SpotSpecSchema` / `BucketSpecSchema` /
 * `InterceptSpecSchema` / `QuerySpecSchema` directly (`z.infer` introspected
 * against the local build), not from the PLAN.md sketch — `spot.bugs` in
 * particular is an ARRAY of `{ id, fixed_text, note? }`, not a map keyed by
 * bug id.
 */

/** One `wire.left[]` / `wire.right[]` end. */
export interface WireEndSpec {
  id: string;
  label: SceneLocalizedText;
  sub?: SceneLocalizedText;
}

/** One authored left↔right correspondence of a `wire` activity. */
export interface WirePairSpec {
  left_id: string;
  right_id: string;
}

/** `wire` — connect every left end to its right end. Wrong wire → `wrong_hint`. */
export interface WireSpec {
  guide?: { name: SceneLocalizedText };
  prompt: SceneLocalizedText;
  reaction: SceneLocalizedText;
  stamp: SceneLocalizedText;
  left: WireEndSpec[];
  right: WireEndSpec[];
  pairs: WirePairSpec[];
  left_title: SceneLocalizedText;
  right_title: SceneLocalizedText;
  wrong_hint: SceneLocalizedText;
}

/** One token of a `spot.lines[]` code line. */
export interface SpotTokenSpec {
  text: string;
  bug_id?: string;
}

/** One `spot.bugs[]` entry — what the token becomes once tapped. */
export interface SpotBugSpec {
  id: string;
  fixed_text: string;
  note?: SceneLocalizedText;
}

/** One element of `spot.page` — carries `broken_by` while its bug is unfixed. */
export interface SpotPageElementSpec {
  id: string;
  tag: SceneTag;
  text: string;
  name: SceneLocalizedText;
  broken_by?: string;
}

/** `spot` — tap the exact token that broke the page; a miss shows `miss_hint`. */
export interface SpotSpec {
  guide?: { name: SceneLocalizedText };
  prompt: SceneLocalizedText;
  reaction: SceneLocalizedText;
  stamp: SceneLocalizedText;
  file: string;
  lines: SpotTokenSpec[][];
  bugs: SpotBugSpec[];
  miss_hint: SceneLocalizedText;
  page?: { elements: SpotPageElementSpec[] };
}

/** One `bucket.chips[]` entry. */
export interface BucketChipSpec {
  id: string;
  label: SceneLocalizedText;
  bucket: string;
  hint: SceneLocalizedText;
}

/** The closed tone palette a `bucket.buckets[]` entry paints with. */
export type BucketTone = 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'pink' | 'red' | 'gray';

/** One `bucket.buckets[]` entry. */
export interface BucketDefSpec {
  id: string;
  label: SceneLocalizedText;
  tone: BucketTone;
}

/** `bucket` — drag every chip into its bucket. Wrong bucket → the chip's own `hint`. */
export interface BucketSpec {
  guide?: { name: SceneLocalizedText };
  prompt: SceneLocalizedText;
  reaction: SceneLocalizedText;
  stamp: SceneLocalizedText;
  chips: BucketChipSpec[];
  buckets: BucketDefSpec[];
}

/** The closed icon set `intercept.nodes[].icon` may use. */
export type InterceptIcon =
  | '🧠' | '📱' | '🖥️' | '⌨️' | '🌐' | '🎨' | '📄' | '⚙️' | '⬆️' | '🌍'
  | '💻' | '📦' | '📒' | '🔍' | '🔒' | '🔓' | '🗄️' | '🏢' | '📶' | '👉';

/** One `intercept.nodes[]` entry, positioned on the board in percent. */
export interface InterceptNodeSpec {
  id: string;
  label: SceneLocalizedText;
  sub?: SceneLocalizedText;
  icon: InterceptIcon;
  x: number;
  y: number;
}

/** `intercept` — a packet loops the diagram; tap the node where it is caught. */
export interface InterceptSpec {
  guide?: { name: SceneLocalizedText };
  prompt: SceneLocalizedText;
  reaction: SceneLocalizedText;
  stamp: SceneLocalizedText;
  nodes: InterceptNodeSpec[];
  edges: [string, string][];
  path: string[];
  packet: string;
  answer: string;
  wrong_hint: SceneLocalizedText;
  packet_at?: Record<string, string>;
}

/** One row of `query.table`. `null` cells render as `NULL`, never blank. */
export interface QueryRowSpec {
  id: string;
  cells: (string | number | null)[];
}

/** `query`'s little in-memory table. */
export interface QueryTableSpec {
  name: string;
  columns: string[];
  rows: QueryRowSpec[];
}

export const QUERY_CMPS = ['=', '!=', '<', '<=', '>', '>='] as const;
export type QueryCmp = (typeof QUERY_CMPS)[number];
export type QueryDir = 'asc' | 'desc';

/** One toggleable SQL clause chip — a closed, typed union, never a raw SQL string. */
export type QueryClauseSpec =
  | { type: 'where'; id: string; chip: SceneLocalizedText; column: string; cmp: QueryCmp; value: string | number | null }
  | { type: 'order_by'; id: string; chip: SceneLocalizedText; column: string; dir: QueryDir }
  | { type: 'limit'; id: string; chip: SceneLocalizedText; n: number };

/** `query` — toggle clause chips until the assembled query reaches `goal`. */
export interface QuerySpec {
  guide?: { name: SceneLocalizedText };
  prompt: SceneLocalizedText;
  reaction: SceneLocalizedText;
  stamp: SceneLocalizedText;
  table: QueryTableSpec;
  base_sql: string;
  clauses: QueryClauseSpec[];
  goal: { row_ids: string[]; ordered: boolean };
}

/* ── the system kinds — `decompose_canvas`, `compose_blocks`, `state_lab`, ──
 * `event_trace` (2026-09-30, Tainan's Week 1 proposal) ──────────────────────
 *
 * Four lenses over one micro-app (parts, composition, state, events). Same
 * envelope and gate as the scene family; the shared `SystemView` renders a
 * declarative `ViewNode` tree from data and is component reuse, not a kind.
 *
 * ⚠️ RELEASE GATE: `@iterahq/activity-spec` has not released these four names
 * yet (sibling PR `feat/system-kinds`). Until it does, `SYSTEM_KINDS` below is
 * this package's own closed set of literals, `KnownActivityKind` widens with
 * `SystemKind` (it collapses back into `ActivityKind` once the spec carries
 * them), and `safeParseKindSpec` answers them with the structural fallback in
 * `systemKindsFallback.ts`. After the bump: drop the fallback and import the
 * list from the spec.
 */

export const SYSTEM_KINDS = ['decompose_canvas', 'compose_blocks', 'state_lab', 'event_trace'] as const;
export type SystemKind = (typeof SYSTEM_KINDS)[number];

export interface ViewBind {
  bind: string;
}

export type ViewNode =
  | { id: string; type: 'box'; label?: SceneLocalizedText; children: ViewNode[] }
  | { id: string; type: 'heading'; text: SceneLocalizedText | ViewBind }
  | { id: string; type: 'text'; text: SceneLocalizedText | ViewBind }
  | { id: string; type: 'input'; placeholder?: SceneLocalizedText; value?: ViewBind }
  | { id: string; type: 'button'; text: SceneLocalizedText }
  | { id: string; type: 'checkbox_item'; text: ViewBind; checked: ViewBind }
  | { id: string; type: 'list'; bind: string; item: ViewNode; empty?: SceneLocalizedText };

interface SystemSceneEnvelope {
  guide?: { name: SceneLocalizedText };
  prompt: SceneLocalizedText;
  reaction: SceneLocalizedText;
  stamp: SceneLocalizedText;
}

export interface DecomposePartSpec {
  id: string;
  label: SceneLocalizedText;
  color?: string;
  inside?: string;
}

/** `decompose_canvas` — group the leaves of a working interface into named parts. Judged by constraints. */
export interface DecomposeCanvasSpec extends SystemSceneEnvelope {
  wrong_hint?: SceneLocalizedText;
  view: ViewNode;
  state?: Record<string, unknown>;
  parts: DecomposePartSpec[];
  must_group?: { ids: string[]; hint?: SceneLocalizedText }[];
  must_separate?: { ids: [string, string]; hint?: SceneLocalizedText }[];
  require_all_assigned?: boolean;
}

export interface ComposeTargetNode {
  block: string;
  children?: ComposeTargetNode[];
}

export interface ComposeBlockSpec {
  id: string;
  label: SceneLocalizedText;
  view: ViewNode;
  max?: number;
}

/** `compose_blocks` — build a containment tree from blocks until it equals `target`. */
export interface ComposeBlocksSpec extends SystemSceneEnvelope {
  wrong_hint?: SceneLocalizedText;
  blocks: ComposeBlockSpec[];
  root: string;
  target: ComposeTargetNode;
  sibling_order_matters?: boolean;
  item_style?: 'code' | 'card';
}

export interface StateLabControlSpec {
  id: string;
  path: string;
  type: 'toggle' | 'text' | 'add_item' | 'remove_item';
  label?: SceneLocalizedText;
  template?: Record<string, unknown>;
}

export interface StateLabGoalSpec {
  path: string;
  equals: unknown;
  label: SceneLocalizedText;
}

/** `state_lab` — operate the state until every goal holds at once. */
export interface StateLabSpec extends SystemSceneEnvelope {
  state: Record<string, unknown>;
  view: ViewNode;
  controls: StateLabControlSpec[];
  goals: StateLabGoalSpec[];
}

export type EventTraceLens = 'event' | 'action' | 'state' | 'render';
export type EventTracePanel = 'structure' | 'state' | 'flow';

export interface EventTraceStepSpec {
  id: string;
  lens: EventTraceLens;
  label: SceneLocalizedText;
  highlight?: string;
  state_after?: Record<string, unknown>;
}

/** `event_trace` — trigger an event, then step through event → action → state → render. */
export interface EventTraceSpec extends SystemSceneEnvelope {
  state: Record<string, unknown>;
  view: ViewNode;
  trigger: { node: string; input?: { node: string; value: string } };
  steps: EventTraceStepSpec[];
  lenses?: EventTracePanel[];
}
