/**
 * Canonical Itera content model (ADR `frontend-canonical-labels-always`).
 *
 * Entity labels on the front are CANONICAL — Program / Unit / Lesson / Activity.
 * We keep João Oak's visual gamified design, but drop the git-metaphor naming
 * (Feature/Pull/Commit). These shapes map 1:1 to the `itera.*` Supabase schema.
 */
import type { KnownActivityKind as ActivityKind } from '@iterahq/activities';

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
export type { ActivityKind };

/*
 * ⚠️ WIDENED (2026-09-27, plan `20260924-activity-type-one-behavior-rule`, T9–T14):
 * `ActivityKind` here is `@iterahq/activity-spec`'s `ActivityKind` PLUS the 22
 * one-behaviour kinds (`KnownActivityKind` of `@iterahq/activities`). The spec
 * release that exports them (1.4.0) is not published yet, and the Player must
 * render them before the data remap moves rows onto them. On spec `^1.4.0` the
 * union collapses into the spec's own `ActivityKind`, so this line can go back
 * to a plain re-export with no other change. The exhaustiveness traps below
 * (`KIND_VALIDATION`, `ACTIVITY_FAMILY`, `KIND_ARTIFACT_DEFAULTS`) already
 * cover the 22 kinds, which is what makes that bump a no-op.
 */

/**
 * The AUTHORED SPEC SHAPES MOVED to `@iterahq/activities` (Fase C, step 1 of
 * plan `20260803-itera-player-activities-lib`).
 *
 * The split follows ADR-1. What a RENDERER reads out of `activity.spec`
 * (`InstructionPanelSpec`, `ConceptSpec`, `ChoiceOption`, `SingleChoiceSpec`, …)
 * travels with the renderers, because a portable activity that cannot name its
 * own spec is not portable. What describes ITERA'S CONTENT HIERARCHY
 * (`Activity`, `Lesson`, `Unit`, `Program`, `Badge`, `UserStats`,
 * `LessonPosition`) stays here — dragging it into the package is exactly what
 * ADR-1 refuses.
 *
 * Re-exported rather than relocated-and-rewritten so the app's 24
 * `@/types/content` imports keep resolving unchanged.
 */
import type { I18nText } from '@iterahq/activities';

export type {
  ChoiceOption,
  ConceptRevealSpec,
  ConceptSpec,
  I18nText,
  InstructionPanelSpec,
  MatchPair,
  MatchSpec,
  MultiChoiceSpec,
  OrderSpec,
  SingleChoiceSpec,
  VideoSpec,
} from '@iterahq/activities';

export type ProgressStatus = 'todo' | 'in_progress' | 'done';


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
