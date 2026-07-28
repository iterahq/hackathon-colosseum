-- ============================================================================
-- 0025 — itera.artifacts becomes a real store for LEARNER-PRODUCED work.
--
-- Plan: 20260728-itera-artifact-storage (Phase 1 — "stop destroying the
-- learner's work"). ADR-2, ADR-3, ADR-9, ADR-10.
--
-- WHY: itera.artifacts has existed since migration 0001 with **0 rows and 0
-- code references**. Meanwhile a learner's reflection text lived in `useState`
-- and died on unmount, the AI-judge document content was sent to the judge and
-- discarded, and code snapshots existed only in one browser's localStorage.
-- This migration gives that table the columns it needs to be the first real
-- writer's destination.
--
-- ⚠️ IRREVERSIBLE STEP — READ BEFORE ROLLING BACK
-- ------------------------------------------------
-- `ALTER TYPE ... ADD VALUE` **cannot be undone** in PostgreSQL. There is no
-- `DROP VALUE`. Reverting 'code'/'text' out of itera.artifact_type would mean
-- recreating the type and rewriting every dependent column. This was authorized
-- explicitly (plan Q4 = A, "incluir 'code' na Fase 1", overriding the master
-- ADR-28 sequencing) — but do NOT assume this file is roll-backable.
--
-- ⚠️ APPLIED MANUALLY. Merging the PR applies NOTHING.
-- ------------------------------------------------------
-- There is no migration CI and no ledger table: db/scripts/apply-migrations.sh
-- re-runs EVERY file from 0001 in one psql session. Hence every statement below
-- is written to be safely re-runnable. Storage (the bucket + its policies) is a
-- SEPARATE script — db/scripts/setup-storage-artifacts.sql — which must be
-- applied too, or uploads will fail while the table accepts rows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Artifact types the activities actually produce.
--    'code'  — the learner's source (the button.tsx case that motivated this).
--    'text'  — free-form reflection / data-spec prose.
--    NOTE: new enum values are NOT used anywhere else in this file, so this is
--    safe even when the file is applied inside a single transaction.
-- ---------------------------------------------------------------------------
alter type itera.artifact_type add value if not exists 'code';
alter type itera.artifact_type add value if not exists 'text';

-- ---------------------------------------------------------------------------
-- 2. Columns for append-only + content-addressed blobs + tenant awareness.
-- ---------------------------------------------------------------------------
alter table itera.artifacts add column if not exists tenant_id      uuid references itera.tenants(id) on delete set null;
alter table itera.artifacts add column if not exists filename       text;
alter table itera.artifacts add column if not exists mime_type      text;
alter table itera.artifacts add column if not exists size_bytes     integer;
alter table itera.artifacts add column if not exists content_sha256 text;

-- `version` shipped as text in 0001 and was never written to (0 rows). The
-- append-only model (ADR-3) needs a monotonic integer per (user_id, activity_id).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'itera' and table_name = 'artifacts'
      and column_name = 'version' and data_type = 'text'
  ) then
    alter table itera.artifacts
      alter column version type integer using nullif(version, '')::integer;
  end if;
end $$;

alter table itera.artifacts alter column version set default 1;

-- ---------------------------------------------------------------------------
-- 3. Indexes — "latest version for this learner+activity" is THE hot read.
-- ---------------------------------------------------------------------------
create index if not exists idx_artifacts_user_activity_version
  on itera.artifacts (user_id, activity_id, version desc);
create index if not exists idx_artifacts_tenant  on itera.artifacts (tenant_id);
create index if not exists idx_artifacts_sha     on itera.artifacts (content_sha256);

-- ---------------------------------------------------------------------------
-- 4. RLS.
--
--    `artifacts_rw_self` (from 0001) already scopes ALL access to the owning
--    learner via itera.current_itera_user_id(). It stays exactly as-is.
--
--    ADR-9 (plan Q2 = B) adds tenant-admin READ over the whole tenant — the
--    admin of the tenant an artifact was produced under can read it, including
--    personal reflections. This was chosen deliberately over the narrower
--    "only activities marked as deliverable" option, with the privacy cost
--    stated in the question. Policies are PERMISSIVE, so this ORs with
--    artifacts_rw_self; it grants SELECT only — never write.
--
--    ⚠️ Because this exposes a learner's personal writing to their employer,
--    the app MUST tell the learner at the moment they write. That notice ships
--    in the same PR as this migration (ArtifactVisibilityNotice).
-- ---------------------------------------------------------------------------
drop policy if exists artifacts_read_tenant_admin on itera.artifacts;
create policy artifacts_read_tenant_admin on itera.artifacts
  for select to authenticated
  using (
    tenant_id is not null
    and exists (
      select 1
      from itera.memberships m
      where m.user_id = itera.current_itera_user_id()
        and m.tenant_id = itera.artifacts.tenant_id
        and m.role in ('tenant_admin', 'owner')
    )
  );

comment on column itera.artifacts.content_sha256 is
  'SHA-256 of the stored blob. Path is content-addressed, so equal content dedups (ADR-3).';
comment on column itera.artifacts.version is
  'Monotonic per (user_id, activity_id). Append-only: every save INSERTs, nothing UPDATEs (ADR-3).';
comment on column itera.artifacts.tenant_id is
  'Tenant the artifact was produced under. Drives tenant-admin read (ADR-9). NULL = no active membership.';
