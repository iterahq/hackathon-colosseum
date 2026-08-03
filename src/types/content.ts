/**
 * Canonical Itera content model (ADR `frontend-canonical-labels-always`).
 *
 * Entity labels on the front are CANONICAL — Program / Unit / Lesson / Activity.
 * We keep João Oak's visual gamified design, but drop the git-metaphor naming
 * (Feature/Pull/Commit). These shapes map 1:1 to the `itera.*` Supabase schema.
 */
import type { ActivityKind } from '@iterahq/activity-spec';

/**
 * Canonical `itera.activity_kind` enum values.
 *
 * ⚠️ **RE-EXPORT, não cópia** (2026-07-28). Este arquivo mantinha uma união
 * literal escrita à mão que *dizia* espelhar o `ACTIVITY_KINDS` do pacote — mas
 * espelho à mão é justamente o drift de 3 pontos que o `@iterahq/activity-spec`
 * foi criado pra colapsar: um kind novo no pacote NÃO aparecia aqui, e
 * `Activity.kind` seguia estreito. Agora é a MESMA união, por construção.
 *
 * Efeito colateral desejado (ADR-15 / trap de exaustividade): adicionar um valor
 * ao enum do pacote passa a repercutir em `Activity.kind` e, com ele, no
 * `Record<ActivityKind, …>` de `src/utils/activitySpecBoundary.ts` — ou seja,
 * kind novo sem cobertura de validação **quebra `npm run typecheck`**, que é
 * gate de build desde a PR #195.
 *
 * A ponta do banco (`itera.activity_kind` no projeto `kjefmwlopzeaqgqtlbdn`,
 * migrations `0014_activity_kinds_v1.sql` + `0016_activity_kind_sandbox_scenario.sql`)
 * e o `ACTIVITY_KINDS` do `iterahq/itera-mcp` continuam sendo os outros dois
 * pontos da mudança coordenada.
 */
export type { ActivityKind } from '@iterahq/activity-spec';

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
  /**
   * The AUTHORED answer to "does this activity keep what the learner produced?"
   * (`itera.activities.artifact_policy`, migration 0027).
   *
   * Left `undefined`/`{}` this resolves to the per-kind default, which is why
   * every pre-0027 activity keeps behaving exactly as before. Never read this
   * raw — go through `resolveArtifactPolicy` in
   * `@/services/artifactPolicy`, which merges it with the kind default and is
   * the single place that decision is made.
   */
  artifactPolicy?: Record<string, unknown> | null;
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

/**
 * Where the self-paced player is inside a lesson. The completion screen is the
 * position AFTER the last activity — not a separate mode — which is what lets
 * "step back from the trophy" fall out of the same arithmetic as every other
 * step. See `src/utils/lessonNavigation.ts`.
 */
export interface LessonPosition {
  /** Index of the activity on screen. Meaningless while `completed`. */
  index: number;
  /** The completion screen is showing. */
  completed: boolean;
}
