-- ============================================================================
-- Itera migration 0024 — reusable activity DEFINITIONS (the Lego atom)
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- Plan: 20260728-itera-back-office  (ADR-11, ADR-12, ADR-3, ADR-4, ADR-16)
-- Decision: Tainan, TG 2026-07-28 — "bora com esse menos impactante!" (Model B)
--
-- WHAT THIS DOES (and, just as importantly, what it does NOT do)
-- --------------------------------------------------------------
-- Today an activity is a row nested under exactly one lesson:
--     programs -> units -> lessons -> activities.lesson_id NOT NULL
-- We want activities to be REUSABLE across many lessons/programs, while
-- completion keeps counting PER CONTEXT ("se ele completar ela em varios
-- lugares diferentes, tem que contar varias vezes" — ADR-11).
--
-- Model B does that by SPLITTING the concept, not by rewiring the existing one:
--   * itera.activities        stays EXACTLY as it is — the per-lesson INSTANCE.
--                             lesson_id stays NOT NULL. Same 7 columns.
--   * itera.activity_defs     NEW — the autonomous, reusable DEFINITION.
--                             Owns tenancy + the library metadata.
--   * activities.def_id       NEW nullable FK: "this instance renders that def".
--
-- Reuse = INSERT another `activities` row into another lesson with the same
-- def_id. `activities` already has (lesson_id, ordinal) — it IS the junction,
-- so no separate junction table is needed.
--
-- ⚠️ DELIBERATELY NOT DONE HERE — these are the load-bearing safety properties:
--   * `itera.activities` is NOT altered except for the additive `def_id`.
--   * The 4 RLS policies on `itera.activities` are NOT touched. They keep
--     deriving tenancy via lesson_id -> units -> programs, which keeps working
--     because lesson_id is never null. (Rewriting them is what could have made
--     an activity invisible to its own author. Model B removes that step.)
--   * `itera.progress` (PK user_id+activity_id, 277 rows) and
--     `itera.activity_results` (455 rows) are NOT touched. Per-context
--     completion is ALREADY true today because each instance has its own
--     activities.id — zero learner-data migration.
--   * No title derivation. title_i18n stays '{}' here on purpose; the
--     per-kind backfill is report-first with human sign-off (ADR-6, Phase 2).
--
-- REVERSAL: alter table itera.activities drop column def_id;
--           drop table itera.activity_defs;
--
-- IDEMPOTENCY: db/scripts/apply-migrations.sh re-runs EVERY file from 0001 in
-- one psql session and there is NO ledger table, so this file must be safely
-- re-runnable. Everything below is `if not exists` / `create or replace` /
-- drop-then-create for policies, and the backfill is guarded on `def_id is
-- null` so a re-run is a no-op (and self-heals any instance still lacking a
-- def).
--
-- ⚠️ Merging this PR applies NOTHING. No CI applies Itera migrations — someone
-- must run db/scripts/apply-migrations.sh by hand. Do not ship code that
-- assumes activity_defs exists until that has been run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The reusable definition
-- ---------------------------------------------------------------------------
create table if not exists itera.activity_defs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references itera.tenants(id) on delete cascade,
  kind               itera.activity_kind not null,
  spec               jsonb not null default '{}'::jsonb,
  rubric             jsonb not null default '{}'::jsonb,
  -- library metadata (ADR-3): first-class columns, NOT inside `spec`, because
  -- `spec` is per-kind and schema-divergent — only sandbox_scenario requires a
  -- title, and @iterahq/activity-spec has no shared base schema. A library has
  -- to sort/filter/search uniformly across all 10 kinds.
  title_i18n         jsonb not null default '{}'::jsonb,
  summary_i18n       jsonb not null default '{}'::jsonb,
  tags               text[] not null default '{}',
  -- ADR-16: v1 cards render a per-kind icon + brand colour, NOT an image
  -- (itera.media has 0 rows and no iterahq bucket exists). Reserved for later.
  thumbnail_media_id uuid references itera.media(id) on delete set null,
  status             itera.activity_status not null default 'draft',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists activity_defs_tenant_idx  on itera.activity_defs (tenant_id);
create index if not exists activity_defs_kind_idx    on itera.activity_defs (tenant_id, kind);
create index if not exists activity_defs_status_idx  on itera.activity_defs (tenant_id, status);
-- GIN for the "filter by content" requirement (tag facets in the card library)
create index if not exists activity_defs_tags_gin    on itera.activity_defs using gin (tags);

-- reuse the existing helper (already used by activity_comments)
drop trigger if exists activity_defs_set_updated_at on itera.activity_defs;
create trigger activity_defs_set_updated_at
  before update on itera.activity_defs
  for each row execute function itera.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. The instance points at its definition (additive, nullable)
-- ---------------------------------------------------------------------------
alter table itera.activities
  add column if not exists def_id uuid references itera.activity_defs(id) on delete set null;

create index if not exists activities_def_id_idx on itera.activities (def_id);

-- ---------------------------------------------------------------------------
-- 3. RLS on the NEW table — keyed on its OWN tenant_id
--
-- Mirrors itera.programs (tenant_id in current_tenant_ids()) rather than the
-- lesson-walking shape used by itera.activities, because a definition is
-- deliberately lesson-independent — there is nothing to walk up to.
-- These are brand-new policies on a brand-new (empty) table, so they cannot
-- change the visibility of any existing row.
-- ---------------------------------------------------------------------------
alter table itera.activity_defs enable row level security;

-- Read: any member of the owning tenant sees PUBLISHED defs; authors of that
-- tenant additionally see drafts. Same two-clause shape as activities_select_tenant.
drop policy if exists activity_defs_select_tenant on itera.activity_defs;
create policy activity_defs_select_tenant on itera.activity_defs
  for select using (
    tenant_id in (select itera.current_tenant_ids())
    and (
      status = 'published'
      or tenant_id in (select itera.current_author_tenant_ids())
    )
  );

-- Write: authors/instructors/tenant_admins/owners of the owning tenant only.
-- (itera.current_author_tenant_ids() already resolves exactly that role set.)
drop policy if exists activity_defs_author_insert on itera.activity_defs;
create policy activity_defs_author_insert on itera.activity_defs
  for insert with check (
    tenant_id in (select itera.current_author_tenant_ids())
  );

drop policy if exists activity_defs_author_update on itera.activity_defs;
create policy activity_defs_author_update on itera.activity_defs
  for update
  using      (tenant_id in (select itera.current_author_tenant_ids()))
  with check (tenant_id in (select itera.current_author_tenant_ids()));

drop policy if exists activity_defs_author_delete on itera.activity_defs;
create policy activity_defs_author_delete on itera.activity_defs
  for delete using (
    tenant_id in (select itera.current_author_tenant_ids())
  );

grant select                 on itera.activity_defs to anon, authenticated;
grant insert, update, delete on itera.activity_defs to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Backfill — one definition per existing activity, 1:1
--
-- Safe as a straight 1:1 because zero duplicate specs exist today (verified
-- 2026-07-28: count(*) = count(distinct spec) for all 10 kinds, 123 rows over
-- 23 lessons). So there is nothing to de-duplicate; reuse is forward-looking.
--
-- tenant_id is resolved through the instance's existing lesson -> unit ->
-- program path — the same walk the current activities RLS policies perform.
--
-- Guarded on `def_id is null`, so re-running is a no-op.
-- ---------------------------------------------------------------------------
-- The def id is generated UP FRONT in `src`, so the same value is used both to
-- INSERT the definition and to point the instance at it. `src` is MATERIALIZED
-- so the volatile gen_random_uuid() is evaluated exactly once per row and both
-- consumers observe identical ids.
--
-- ⚠️ Do NOT "simplify" this by INSERT ... RETURNING id and pairing on
-- row_number(): RETURNING yields rows in insertion order, and re-sorting them
-- by the generated uuid pairs unrelated rows together. That silently mis-paired
-- all 123 rows on the first run of this migration (75 wrong tenants, 123 wrong
-- specs) and was only caught by the tenant/content assertions below.
with src as materialized (
  select a.id              as activity_id,
         gen_random_uuid() as def_id,
         p.tenant_id       as tenant_id,
         a.kind            as kind,
         a.spec            as spec,
         a.rubric          as rubric,
         a.status          as status
  from itera.activities a
  join itera.lessons  l on l.id = a.lesson_id
  join itera.units    u on u.id = l.unit_id
  join itera.programs p on p.id = u.program_id
  where a.def_id is null
),
ins as (
  insert into itera.activity_defs (id, tenant_id, kind, spec, rubric, status)
  select def_id, tenant_id, kind, spec, rubric, status from src
  returning id
)
update itera.activities a
   set def_id = s.def_id
  from src s
 where a.id = s.activity_id;

-- ---------------------------------------------------------------------------
-- 5. Keep instances in sync with their definition (sub-option B1)
--
-- The DEFINITION is the source of truth for spec/rubric. `activities.spec` is
-- kept as a materialised mirror so the player's nested PostgREST embeds
-- (lessons -> activities) stay byte-identical and need NO release. Editing a
-- definition therefore propagates to every lesson that uses it — which is what
-- makes this real reuse rather than the copy-on-link duplication that
-- instantiate_program already does.
--
-- Inert until something actually writes activity_defs (Phase 3, itera-mcp):
-- nothing updates this table today, so this trigger cannot fire yet.
-- ---------------------------------------------------------------------------
create or replace function itera.sync_activity_def_to_instances()
returns trigger
language plpgsql
security definer
set search_path to 'itera', 'public'
as $$
begin
  if new.spec is distinct from old.spec
     or new.rubric is distinct from old.rubric then
    update itera.activities a
       set spec   = new.spec,
           rubric = new.rubric
     where a.def_id = new.id
       and (a.spec is distinct from new.spec or a.rubric is distinct from new.rubric);
  end if;
  return new;
end;
$$;

drop trigger if exists activity_defs_sync_instances on itera.activity_defs;
create trigger activity_defs_sync_instances
  after update on itera.activity_defs
  for each row execute function itera.sync_activity_def_to_instances();

comment on table itera.activity_defs is
  'Reusable activity DEFINITION (the Lego atom). itera.activities rows are per-lesson INSTANCES that reference one of these via def_id. Completion is tracked per instance (itera.progress PK user_id+activity_id), so the same definition used in N lessons counts N times — plan 20260728-itera-back-office, ADR-11/ADR-12.';

comment on column itera.activities.def_id is
  'The reusable definition this instance renders. NULL means a legacy stand-alone activity (backfilled to 1:1 by migration 0024).';
