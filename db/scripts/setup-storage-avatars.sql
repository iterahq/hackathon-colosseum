-- ============================================================================
-- Itera storage setup — `avatars` bucket for learner-uploaded profile photos
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY. NOT DFL prod.
-- Plan: 20260721-itera-profile-ux-upgrades (item 4 — upload a photo, not a link).
--
-- ⚠️ NOT run by db/scripts/apply-migrations.sh. That flow connects as the
-- `postgres` role, which is NOT a member of `supabase_storage_admin` (the owner
-- of storage.objects), so `CREATE POLICY ... ON storage.objects` fails there.
-- Apply this script with elevated privileges instead — the Supabase Dashboard
-- SQL editor OR the Management API (POST /v1/projects/:ref/database/query), both
-- of which run with sufficient rights. It is idempotent, so re-running is safe.
--
-- SECURITY (skill app-security)
-- -----------------------------
-- - Bucket is PUBLIC-READ only (avatars are shown to the whole cohort in the
--   roster/ranking). No secret content lives here.
-- - Writes are least-privilege: an authenticated user may INSERT/UPDATE/DELETE
--   ONLY inside a top-level folder named after their own auth uid — enforced by
--   `(storage.foldername(name))[1] = auth.uid()::text`. A user cannot write into
--   another user's folder.
-- - Server-enforced size + mime whitelist on the bucket (2 MiB, images only) so a
--   malicious client cannot upload arbitrary/oversized/script payloads.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MiB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read of avatar objects (bucket is public; explicit policy documents it).
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select
  using (bucket_id = 'avatars');

-- Owner-scoped writes: the first path segment must equal the caller's auth uid.
drop policy if exists "avatars owner insert" on storage.objects;
create policy "avatars owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
