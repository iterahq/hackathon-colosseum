/**
 * Service layer for the per-UNIT review canvas — activity comments, unit
 * versions, and the publish/unpublish flip
 * (plan 20260706-iterahq-activity-authoring-canvas-testing, Phase 4).
 *
 * All calls go through the itera Supabase client (`@/lib/supabase/client`,
 * default schema `itera`, user-JWT + RLS author-scoped) — the UI talks DIRECTLY
 * to Supabase, NOT through the MCP (architecture rule). The PURE helpers
 * (version resolution + clipboard format) live in `@/lib/comment-format` and
 * are re-exported here for single-import ergonomics.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type {
  ActivityComment,
  ActivityCommentRow,
  UnitVersion,
  UnitVersionRow,
} from '@/types/comments';
import { resolveCurrentVersion, nextVersionNumber } from '@/lib/comment-format';

export {
  resolveCurrentVersion,
  nextVersionNumber,
  id8,
  padNumber,
  pickTitle,
  formatCommentLine,
  formatCommentsForClipboard,
  buildActivityRefs,
  buildVersionNumbers,
  type CommentFormatContext,
  type ActivityRef,
} from '@/lib/comment-format';

function client() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured — live Itera data unavailable.');
  }
  return getSupabase();
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function toNum(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

export function versionRowToVersion(row: UnitVersionRow): UnitVersion {
  return {
    id: row.id,
    unitId: row.unit_id,
    versionNumber: row.version_number,
    label: row.label ?? null,
    createdAt: row.created_at,
  };
}

export function commentRowToComment(row: ActivityCommentRow): ActivityComment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    programId: row.program_id,
    unitId: row.unit_id,
    lessonId: row.lesson_id,
    activityId: row.activity_id,
    unitVersionId: row.unit_version_id,
    body: row.body,
    authorId: row.author_id ?? null,
    resolved: row.resolved,
    anchorX: toNum(row.anchor_x),
    anchorY: toNum(row.anchor_y),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Unit versions
// ---------------------------------------------------------------------------

export async function fetchUnitVersions(unitId: string): Promise<UnitVersion[]> {
  const { data, error } = await client()
    .from('unit_versions')
    .select('*')
    .eq('unit_id', unitId)
    .order('version_number', { ascending: true });

  if (error) throw new Error(error.message);
  return ((data as unknown as UnitVersionRow[]) ?? []).map(versionRowToVersion);
}

/**
 * Ensure a unit has at least one version, returning the current one. If none
 * exist, creates v1. The `(unit_id, version_number)` UNIQUE constraint protects
 * against a racing double-insert (the 23505 is swallowed and we re-read).
 * `tenant_id` is required by the insert RLS `with_check` (author-scoped).
 */
export async function ensureCurrentUnitVersion(
  unitId: string,
  tenantId: string,
): Promise<UnitVersion> {
  const versions = await fetchUnitVersions(unitId);
  const current = resolveCurrentVersion(versions);
  if (current) return current;

  const { data, error } = await client()
    .from('unit_versions')
    .insert({ unit_id: unitId, tenant_id: tenantId, version_number: 1 })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const again = await fetchUnitVersions(unitId);
      const c = resolveCurrentVersion(again);
      if (c) return c;
    }
    throw new Error(error.message);
  }
  return versionRowToVersion(data as unknown as UnitVersionRow);
}

/** Bump the unit to a new version (max + 1). New comments stamp this version. */
export async function bumpUnitVersion(
  unitId: string,
  tenantId: string,
  label?: string,
): Promise<UnitVersion> {
  const versions = await fetchUnitVersions(unitId);
  const next = nextVersionNumber(versions);

  const { data, error } = await client()
    .from('unit_versions')
    .insert({
      unit_id: unitId,
      tenant_id: tenantId,
      version_number: next,
      label: label ?? null,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return versionRowToVersion(data as unknown as UnitVersionRow);
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function fetchUnitComments(unitId: string): Promise<ActivityComment[]> {
  const { data, error } = await client()
    .from('activity_comments')
    .select('*')
    .eq('unit_id', unitId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return ((data as unknown as ActivityCommentRow[]) ?? []).map(commentRowToComment);
}

export interface CreateCommentInput {
  tenantId: string;
  programId: string;
  unitId: string;
  lessonId: string;
  activityId: string;
  unitVersionId: string;
  body: string;
  anchorX?: number | null;
  anchorY?: number | null;
}

export async function createActivityComment(
  input: CreateCommentInput,
): Promise<ActivityComment> {
  const { data, error } = await client()
    .from('activity_comments')
    .insert({
      tenant_id: input.tenantId,
      program_id: input.programId,
      unit_id: input.unitId,
      lesson_id: input.lessonId,
      activity_id: input.activityId,
      unit_version_id: input.unitVersionId,
      body: input.body,
      anchor_x: input.anchorX ?? null,
      anchor_y: input.anchorY ?? null,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return commentRowToComment(data as unknown as ActivityCommentRow);
}

export async function setCommentResolved(
  commentId: string,
  resolved: boolean,
): Promise<ActivityComment> {
  const { data, error } = await client()
    .from('activity_comments')
    .update({ resolved, updated_at: new Date().toISOString() })
    .eq('id', commentId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return commentRowToComment(data as unknown as ActivityCommentRow);
}

export async function deleteActivityComment(commentId: string): Promise<void> {
  const { error } = await client().from('activity_comments').delete().eq('id', commentId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Publish control — flips itera.activities.status directly (RLS author-scoped)
// ---------------------------------------------------------------------------

/** Flip an activity's content status. Author-RLS gated (activities_author_update). */
export async function setActivityStatus(
  activityId: string,
  status: 'draft' | 'published',
): Promise<void> {
  const { error } = await client()
    .from('activities')
    .update({ status })
    .eq('id', activityId);
  if (error) throw new Error(error.message);
}

export const publishActivity = (id: string) => setActivityStatus(id, 'published');
export const unpublishActivity = (id: string) => setActivityStatus(id, 'draft');

/**
 * Write an activity's ARTIFACT POLICY — "does this activity keep what the
 * learner produced, and as what file?".
 *
 * Plan: 20260728-itera-artifact-storage. Migration `0027`.
 *
 * This is the write behind Tainan's core correction: whether work is persisted
 * *"poderia ou deveria ser DEFINIDO lá na ferramenta de autoria"*, with a
 * per-activity-type default — not inferred inside a React renderer. Author-RLS
 * gated by the same `activities_author_update` policy that guards the status
 * flip, so no new grant was needed.
 *
 * Passing `{}` RESETS the activity to its per-kind default, which is why the
 * editor's "automático" option writes an empty object rather than nulling the
 * column (the column is `not null default '{}'`).
 */
export async function setActivityArtifactPolicy(
  activityId: string,
  policy: Record<string, unknown>,
): Promise<void> {
  const { error } = await client()
    .from('activities')
    .update({ artifact_policy: policy })
    .eq('id', activityId);
  if (error) throw new Error(error.message);
}
