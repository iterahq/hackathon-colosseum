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
