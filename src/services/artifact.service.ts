/**
 * Persist what the learner PRODUCES — the first writer `itera.artifacts` has
 * ever had.
 *
 * Plan: 20260728-itera-artifact-storage (Phase 1). ADR-2, ADR-3, ADR-9.
 *
 * Before this module, produced work never left the browser: a reflection lived
 * in `useState` and died on unmount, the AI-judge document was sent to the judge
 * and discarded, and code snapshots sat in one browser's localStorage. The table
 * had existed since migration 0001 with 0 rows and 0 code references.
 *
 * DESIGN
 * ------
 * - **Append-only (ADR-3).** Every save is an INSERT with a monotonic `version`
 *   per (user_id, activity_id). Nothing ever UPDATEs. The UI shows only the
 *   latest, so today there is no "versioning" for the learner — but the history
 *   is already being recorded, so switching it on later is a query, not a
 *   migration.
 * - **Content-addressed blobs (ADR-3).** The object path is
 *   `<auth-uid>/<activity-id>/<sha256>.<ext>`. Identical content therefore
 *   dedups to the same object instead of piling up copies.
 * - **Private bucket (ADR-2).** `artifacts` is `public = false`. Reads go
 *   through short-lived signed URLs, never a public URL. Contrast `avatars`,
 *   which is public-read on purpose.
 * - **Best-effort.** A failed artifact save must NEVER block the learner from
 *   completing an activity. Callers ignore the `false` return; progress is the
 *   source of truth for completion.
 *
 * ⚠️ TWO DIFFERENT USER IDS — the classic footgun here.
 * `storage` paths are keyed by the SUPABASE AUTH uid (that is what the storage
 * RLS predicate compares). `itera.artifacts.user_id` is the ITERA user id
 * (itera.users.id), resolved from auth.uid() through itera.identities. Mixing
 * them up silently FK-fails on the table or 403s on the bucket.
 *
 * ⚠️ ADR-12 (author TEST harness must never persist). This module is NOT called
 * from `ActivityRenderer`. Activities hand their produced content UP through
 * `onComplete(correct, detail)`, and only the learner-facing player calls
 * `saveArtifact`. The author test harness keeps its in-memory sink and writes
 * nothing — the same boundary that already protects itera.progress.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getIteraUserId } from '@/services/iteraUser';

const BUCKET = 'artifacts';

/** Artifact types a learner activity can produce (itera.artifact_type). */
export type ArtifactType = 'code' | 'text' | 'document' | 'diagram' | 'site';

/**
 * What an activity hands up when it produced something worth keeping.
 * Deliberately transport-agnostic: the activity says WHAT it made, not HOW it
 * is stored.
 */
export interface ProducedArtifact {
  type: ArtifactType;
  /** The produced content itself. */
  content: string;
  /** File name shown in "My repository" (e.g. `reflection.md`, `button.tsx`). */
  filename: string;
  /** Defaults to text/plain when omitted. */
  mimeType?: string;
}

/** SHA-256 of a UTF-8 string, lowercase hex. Web Crypto — no dependency. */
async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Extension for the object key — derived from the filename, defaulting to txt. */
function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'txt';
}

/**
 * The tenant the artifact was produced under, from the learner's membership.
 * Null when the learner has no membership — the row is still written (the
 * column is nullable); it simply is not visible to any tenant admin.
 */
export async function resolveTenantId(iteraUserId: string): Promise<string | null> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from('memberships')
      .select('tenant_id')
      .eq('user_id', iteraUserId)
      .limit(1)
      .maybeSingle();
    return (data as { tenant_id?: string } | null)?.tenant_id ?? null;
  } catch {
    return null;
  }
}

/** Next monotonic version for this (learner, activity). Starts at 1. */
async function nextVersion(iteraUserId: string, activityId: string): Promise<number> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from('artifacts')
      .select('version')
      .eq('user_id', iteraUserId)
      .eq('activity_id', activityId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const current = (data as { version?: number } | null)?.version;
    return typeof current === 'number' && Number.isFinite(current) ? current + 1 : 1;
  } catch {
    return 1;
  }
}

/**
 * Upload the blob and INSERT the row. Returns true when the artifact was
 * persisted, false on ANY failure — the caller treats this as best-effort and
 * never blocks the learner on it.
 */
export async function saveArtifact(
  activityId: string,
  artifact: ProducedArtifact
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  if (!activityId) return false;
  const content = artifact.content ?? '';
  if (content.trim() === '') return false; // nothing produced — nothing to keep

  try {
    const sb = getSupabase();

    // The storage folder is keyed by the AUTH uid (storage RLS compares that),
    // while the table row is keyed by the ITERA user id. Both are required.
    const { data: auth } = await sb.auth.getUser();
    const authUid = auth.user?.id;
    if (!authUid) return false;

    const iteraUserId = await getIteraUserId();
    if (!iteraUserId) return false;

    const sha = await sha256Hex(content);
    const path = `${authUid}/${activityId}/${sha}.${extensionOf(artifact.filename)}`;
    const mimeType = artifact.mimeType ?? 'text/plain';
    const blob = new Blob([content], { type: mimeType });

    // upsert:true — the path is content-addressed, so a re-upload is byte-identical.
    // It makes re-saving unchanged content a no-op instead of a duplicate-object error.
    const { error: uploadError } = await sb.storage
      .from(BUCKET)
      .upload(path, blob, { upsert: true, contentType: mimeType });
    if (uploadError) return false;

    const [tenantId, version] = await Promise.all([
      resolveTenantId(iteraUserId),
      nextVersion(iteraUserId, activityId),
    ]);

    // INSERT, never UPDATE (ADR-3) — this is what keeps history available later.
    const { error: insertError } = await sb.from('artifacts').insert({
      user_id: iteraUserId,
      activity_id: activityId,
      tenant_id: tenantId,
      type: artifact.type,
      storage_path: path,
      filename: artifact.filename,
      mime_type: mimeType,
      size_bytes: blob.size,
      content_sha256: sha,
      version,
    });
    if (insertError) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Whether anything this learner writes would be readable by a tenant admin
 * (ADR-9). Drives the learner-visible notice — we only make the claim when it
 * is actually true, i.e. the learner belongs to a tenant.
 */
export async function hasTenantAudience(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const iteraUserId = await getIteraUserId();
    if (!iteraUserId) return false;
    return (await resolveTenantId(iteraUserId)) !== null;
  } catch {
    return false;
  }
}

/**
 * The learner's latest artifact for an activity, so reopening it restores what
 * they wrote — the cross-device behaviour localStorage could never provide.
 * Returns null when there is none (or anything fails).
 */
export async function loadLatestArtifact(
  activityId: string
): Promise<{ content: string; filename: string; version: number } | null> {
  if (!isSupabaseConfigured || !activityId) return null;
  try {
    const sb = getSupabase();
    const iteraUserId = await getIteraUserId();
    if (!iteraUserId) return null;

    const { data } = await sb
      .from('artifacts')
      .select('storage_path, filename, version')
      .eq('user_id', iteraUserId)
      .eq('activity_id', activityId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = data as { storage_path?: string; filename?: string; version?: number } | null;
    if (!row?.storage_path) return null;

    const { data: file, error } = await sb.storage.from(BUCKET).download(row.storage_path);
    if (error || !file) return null;

    return {
      content: await file.text(),
      filename: row.filename ?? 'artifact.txt',
      version: row.version ?? 1,
    };
  } catch {
    return null;
  }
}
