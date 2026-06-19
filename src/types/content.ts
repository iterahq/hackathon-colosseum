/**
 * Canonical Itera content model (ADR `frontend-canonical-labels-always`).
 *
 * Entity labels on the front are CANONICAL — Program / Unit / Lesson / Activity.
 * We keep João Oak's visual gamified design, but drop the git-metaphor naming
 * (Feature/Pull/Commit). These shapes map 1:1 to the `itera.*` Supabase schema.
 */

export type ActivityKind = 'diagram' | 'document' | 'quiz' | 'code';

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
