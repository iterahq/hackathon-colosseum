/**
 * Per-UNIT review canvas — activity comments + unit versions
 * (plan 20260706-iterahq-activity-authoring-canvas-testing, Phase 4).
 *
 * Figma-style review system for the `/author/*` surface: authors leave text
 * comments anchored to an activity cell, stamped with the unit's current
 * `itera.unit_versions` row. These camelCase shapes mirror the applied Itera
 * tables `itera.activity_comments` + `itera.unit_versions` (RLS author-scoped);
 * we hand-roll them + cast at the query boundary, same as programs.service.ts.
 *
 * Ported from dfl-lesson-studio's slide-comment subsystem, re-keyed onto Itera
 * entities (program/unit/lesson/activity) — ADR-2/ADR-7.
 */

/** A point-in-time version of a UNIT. "Current" = max(versionNumber). */
export interface UnitVersion {
  id: string;
  unitId: string;
  versionNumber: number;
  label: string | null;
  createdAt: string;
}

/** A single review comment anchored to an activity within a unit version. */
export interface ActivityComment {
  id: string;
  tenantId: string;
  programId: string;
  unitId: string;
  lessonId: string;
  activityId: string;
  unitVersionId: string;
  body: string;
  authorId: string | null;
  resolved: boolean;
  /** Relative anchor within the activity cell, 0..1 (Figma-style pin). */
  anchorX: number | null;
  anchorY: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Raw DB row shapes (snake_case) returned by PostgREST. */
export interface UnitVersionRow {
  id: string;
  unit_id: string;
  version_number: number;
  label: string | null;
  created_at: string;
}

export interface ActivityCommentRow {
  id: string;
  tenant_id: string;
  program_id: string;
  unit_id: string;
  lesson_id: string;
  activity_id: string;
  unit_version_id: string;
  body: string;
  author_id: string | null;
  resolved: boolean;
  anchor_x: number | string | null;
  anchor_y: number | string | null;
  created_at: string;
  updated_at: string;
}
