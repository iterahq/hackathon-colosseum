-- ============================================================================
-- Itera migration 0006 — DFL federation support + dfl-batch pilot tenant
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY. NOT DFL prod.
-- Plan #7 (20260619-itera-fellowship-e2e-integration). Idempotent.
--
-- 1. itera.users.dfl_subject — opaque DFL auth uid for federated users (ADR-4).
--    NOT an FK to any DFL object; a plain text mirror so we can trace a DFL
--    fellow back to their DFL identity without coupling the two Supabases.
--    The RLS-resolving identity row keys provider_subject on the ITERA auth uid
--    (so itera.current_itera_user_id() resolves auth.uid()::text); the DFL uid
--    lives here, opaque.
-- 2. The dfl-batch pilot tenant (one tenant holds all seeded DFL fellows).
-- ============================================================================

-- 1. Federation: opaque DFL subject on itera.users -----------------------------
alter table itera.users
  add column if not exists dfl_subject text;

-- A given DFL uid maps to at most one Itera-local user (idempotent federation).
create unique index if not exists uq_users_dfl_subject
  on itera.users (dfl_subject)
  where dfl_subject is not null;

comment on column itera.users.dfl_subject is
  'Opaque DFL auth.users.id for federated (provider=dfl) users. NOT an FK (ADR-4) — DFL is a separate Supabase. The RLS-resolving identity row uses the Itera auth uid as provider_subject; this column preserves the DFL uid for traceability/idempotent seeding.';

-- 2. dfl-batch pilot tenant ----------------------------------------------------
insert into itera.tenants (slug, name, branding)
values (
  'dfl-batch',
  'DevFellowship Batch (pilot)',
  jsonb_build_object(
    'primary_color', '#16a34a',
    'logo_url', 'https://learn.devfellowship.com/logo.png',
    'login_bg', '#0a0a0a'
  )
)
on conflict (slug) do update set name = excluded.name;
