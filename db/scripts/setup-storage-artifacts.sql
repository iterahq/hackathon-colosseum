-- ============================================================================
-- Itera storage setup — PRIVATE `artifacts` bucket for LEARNER-PRODUCED work.
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY. NOT DFL prod.
-- Plan: 20260728-itera-artifact-storage (Phase 1). ADR-2, ADR-8→D.
--
-- ⚠️ NOT run by db/scripts/apply-migrations.sh — same convention as
-- setup-storage-avatars.sql. Keeping storage OUT of the numbered migration
-- chain means a privilege problem here cannot halt every later migration
-- (apply-migrations.sh runs with ON_ERROR_STOP=1).
--
-- Apply it with: the Supabase Dashboard SQL editor, the Management API, OR
-- plain psql as `postgres` via the pooler. NOTE: the sibling avatars script
-- warns that `postgres` lacks the rights for `CREATE POLICY ON storage.objects`
-- — that is STALE for this project. Verified empirically 2026-07-28: `postgres`
-- over the session pooler creates and drops these policies successfully.
-- Idempotent, so re-running is safe.
--
-- SECURITY — why this bucket is PRIVATE while `avatars` is public
-- ---------------------------------------------------------------
-- `avatars` is public-read because a profile photo is shown to the whole cohort.
-- An ARTIFACT IS THE OPPOSITE. Under BYOC the learner's work is, by
-- construction, about their real employer's business, and reflections are
-- personal writing. The canvas ADR-11 posture ("treat every upload as
-- world-readable; no PII/secrets") was written for AUTHOR MEDIA and does NOT
-- apply here — reusing it for learner artifacts would be a data leak.
-- Therefore: public = false, and reads go through short-lived signed URLs.
--
-- Least-privilege writes: an authenticated user may write ONLY inside a
-- top-level folder named after their own auth uid — enforced by
-- `(storage.foldername(name))[1] = auth.uid()::text`, the same predicate the
-- avatars bucket uses.
--
-- ⚠️ auth.uid() vs itera.users.id — THESE ARE DIFFERENT IDS.
-- The storage folder is the SUPABASE AUTH uid. The itera.artifacts.user_id
-- column is the ITERA user id (itera.users.id), mapped from auth.uid() through
-- itera.identities by itera.current_itera_user_id(). Writing the wrong one
-- silently FK-fails (table) or 403s (storage). artifact.service.ts resolves
-- both deliberately.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'artifacts',
  'artifacts',
  false,                                        -- PRIVATE. See SECURITY above.
  5242880,                                      -- 5 MiB per object
  array[
    'text/plain',
    'text/markdown',
    'application/json',
    'text/x-typescript',
    'text/javascript',
    'text/html',
    'text/css',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Owner-scoped READ. No public-read policy exists for this bucket by design —
-- the object is reachable only by its owner (or via a signed URL the app mints).
drop policy if exists "artifacts owner read" on storage.objects;
create policy "artifacts owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'artifacts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner-scoped INSERT: the first path segment must equal the caller's auth uid.
drop policy if exists "artifacts owner insert" on storage.objects;
create policy "artifacts owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'artifacts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner-scoped UPDATE. Blobs are content-addressed and effectively immutable
-- (ADR-3), so this exists only so an upsert of IDENTICAL content is not an error.
drop policy if exists "artifacts owner update" on storage.objects;
create policy "artifacts owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'artifacts'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'artifacts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner-scoped DELETE — a learner may remove their own object.
drop policy if exists "artifacts owner delete" on storage.objects;
create policy "artifacts owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'artifacts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
