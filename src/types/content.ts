/**
 * Canonical Itera content model (ADR `frontend-canonical-labels-always`).
 *
 * Entity labels on the front are CANONICAL — Program / Unit / Lesson / Activity.
 * We keep João Oak's visual gamified design, but drop the git-metaphor naming
 * (Feature/Pull/Commit). These shapes map 1:1 to the `itera.*` Supabase schema.
 */

/**
 * Canonical `itera.activity_kind` enum values.
 *
 * The first four are the original dev/coding-flavored kinds. The rest are the
 * v1 GENERAL learning-activity taxonomy (plan `20260703-itera-activity-types-system`,
 * Q4 = Itera-native names). Adding a value here is 1 of the COORDINATED 3-point
 * change — it must stay in sync with (a) the `itera.activity_kind` enum in the
 * Itera Supabase project (`kjefmwlopzeaqgqtlbdn`, migration `0014_activity_kinds_v1.sql`)
 * and (b) `ACTIVITY_KINDS` in `iterahq/itera-mcp:src/tools/activities.ts`.
 */
export type ActivityKind =
  | 'diagram'
  | 'document'
  | 'quiz'
  | 'code'
  // v1 general learning-activity taxonomy (no-judge set):
  | 'concept'
  | 'single_choice'
  | 'multi_choice'
  | 'match'
  | 'order'
  | 'video';

/**
 * The shared `InstructionPanel` primitive spec — a flexible context block reused
 * by most general activity types. ANY combination of text · audio · image · video
 * plus an optional description below. All fields optional (the flexibility is the
 * point: text-only, image-only, all-media, etc.).
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

/** `match` — connect cards on the left to cards on the right. */
export interface MatchPair {
  left_id: string;
  right_id: string;
}
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

export type ProgressStatus = 'todo' | 'in_progress' | 'done';

/** Bilingual title bag stored as jsonb `title_i18n` ({ pt, en }). */
export type I18nText = { pt?: string; en?: string; [k: string]: string | undefined };

export interface Activity {
  id: string;
  lessonId: string;
  ordinal: number;
  kind: ActivityKind;
  spec: Record<string, unknown>;
  rubric: Record<string, unknown> | null;
  /** Derived from itera.progress for the current user. */
  status?: ProgressStatus;
  /**
   * Content lifecycle (`itera.activities.status`): 'draft' | 'published'.
   * Only populated on the author review canvas (getUnitCanvas); the student
   * read paths leave it undefined. Students only ever read 'published' rows.
   */
  publishStatus?: 'draft' | 'published';
}

export interface Lesson {
  id: string;
  unitId: string;
  ordinal: number;
  title: I18nText;
  activities?: Activity[];
}

export interface Unit {
  id: string;
  programId: string;
  ordinal: number;
  title: I18nText;
  lessons?: Lesson[];
}

export interface Program {
  id: string;
  tenantId: string;
  slug: string;
  title: I18nText;
  createdAt: string;
  /** Derived counts/progress for cards (optional — filled by the dashboard query). */
  unitCount?: number;
  lessonCount?: number;
  activityCount?: number;
  completedCount?: number;
  /** Stable accent so each program card gets a consistent evergreen-family glow. */
  accent?: string;
  icon?: string;
}

export interface ProgramDetail extends Program {
  units: Unit[];
}

export interface Badge {
  id: string;
  slug: string;
  title: I18nText;
  icon: string | null;
  earned?: boolean;
}

export interface UserStats {
  totalXp: number;
  streakDays: number;
  badgeCount: number;
  completedActivities: number;
}
