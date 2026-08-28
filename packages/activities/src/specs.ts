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
