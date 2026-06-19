-- ============================================================================
-- Itera schema v1 — content + tenancy + Itera-local IAM + gamification + results
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx). ADR-3 / ADR-26.
-- Idempotent: safe to re-run.
-- ============================================================================

create schema if not exists itera;

-- Expose the itera schema via PostgREST (the client uses db.schema = 'itera').
grant usage on schema itera to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type itera.activity_kind as enum ('diagram','document','quiz','code');
exception when duplicate_object then null; end $$;

do $$ begin
  create type itera.identity_provider as enum ('dfl','google','oidc','password');
exception when duplicate_object then null; end $$;

do $$ begin
  create type itera.member_role as enum ('learner','instructor','tenant_admin','owner');
exception when duplicate_object then null; end $$;

do $$ begin
  create type itera.progress_status as enum ('not_started','in_progress','completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type itera.artifact_type as enum ('diagram','document','site');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tenancy + Itera-local IAM (ADR-26 — Itera owns its own; NO FK out to DFL)
-- ---------------------------------------------------------------------------
create table if not exists itera.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  branding    jsonb not null default '{}'::jsonb,  -- logo_url / primary_color / login_bg
  created_at  timestamptz not null default now()
);

create table if not exists itera.users (
  id            uuid primary key default gen_random_uuid(),  -- Itera-local id
  email         text not null unique,
  display_name  text,
  locale        text not null default 'pt',
  created_at    timestamptz not null default now()
);

-- Federation join table (ADR-4). DFL is ONE provider; ids stay Itera-local.
create table if not exists itera.identities (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references itera.users(id) on delete cascade,
  provider          itera.identity_provider not null,
  provider_subject  text not null,   -- e.g. Supabase auth.users.id, or OIDC sub
  created_at        timestamptz not null default now(),
  unique (provider, provider_subject)
);

create table if not exists itera.memberships (
  user_id     uuid not null references itera.users(id) on delete cascade,
  tenant_id   uuid not null references itera.tenants(id) on delete cascade,
  role        itera.member_role not null default 'learner',
  created_at  timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

-- ---------------------------------------------------------------------------
-- Content (canonical model, ADR-2/22): programs -> units(stage) -> lessons -> activities
-- ---------------------------------------------------------------------------
create table if not exists itera.programs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references itera.tenants(id) on delete cascade,
  slug        text not null,
  title_i18n  jsonb not null default '{}'::jsonb,  -- {"pt": "...", "en": "..."}
  created_at  timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table if not exists itera.units (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references itera.programs(id) on delete cascade,
  ordinal     int not null default 0,
  title_i18n  jsonb not null default '{}'::jsonb
);

create table if not exists itera.lessons (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references itera.units(id) on delete cascade,
  ordinal     int not null default 0,
  title_i18n  jsonb not null default '{}'::jsonb
);

create table if not exists itera.activities (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references itera.lessons(id) on delete cascade,
  ordinal     int not null default 0,
  kind        itera.activity_kind not null,
  spec        jsonb not null default '{}'::jsonb,
  rubric      jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Gamification (ADR-14 minimal; hearts/streaks deferred)
-- ---------------------------------------------------------------------------
create table if not exists itera.progress (
  user_id       uuid not null references itera.users(id) on delete cascade,
  activity_id   uuid not null references itera.activities(id) on delete cascade,
  status        itera.progress_status not null default 'not_started',
  completed_at  timestamptz,
  primary key (user_id, activity_id)
);

create table if not exists itera.xp_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references itera.users(id) on delete cascade,
  tenant_id   uuid not null references itera.tenants(id) on delete cascade,
  amount      int not null,
  reason      text,
  created_at  timestamptz not null default now()
);

create table if not exists itera.badges (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references itera.tenants(id) on delete cascade,
  slug        text not null,
  title_i18n  jsonb not null default '{}'::jsonb,
  icon        text,
  unique (tenant_id, slug)
);

create table if not exists itera.user_badges (
  user_id     uuid not null references itera.users(id) on delete cascade,
  badge_id    uuid not null references itera.badges(id) on delete cascade,
  awarded_at  timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- ---------------------------------------------------------------------------
-- Results + artifacts (ADR-15/16/28 — internal-only scores; Diagram+Document P1)
-- ---------------------------------------------------------------------------
create table if not exists itera.activity_results (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references itera.users(id) on delete cascade,
  activity_id     uuid not null references itera.activities(id) on delete cascade,
  attempt         int not null default 1,
  passed          boolean not null default false,
  score_internal  numeric,        -- INTERNAL only — never exposed to the learner (ADR-15)
  feedback        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create table if not exists itera.artifacts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references itera.users(id) on delete cascade,
  activity_id   uuid not null references itera.activities(id) on delete cascade,
  type          itera.artifact_type not null,
  storage_path  text,
  repo_url      text,           -- versioned on our GitHub org (ADR-9)
  version       text,
  created_at    timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_units_program       on itera.units(program_id);
create index if not exists idx_lessons_unit         on itera.lessons(unit_id);
create index if not exists idx_activities_lesson    on itera.activities(lesson_id);
create index if not exists idx_programs_tenant      on itera.programs(tenant_id);
create index if not exists idx_memberships_tenant   on itera.memberships(tenant_id);
create index if not exists idx_results_user         on itera.activity_results(user_id);
create index if not exists idx_artifacts_user       on itera.artifacts(user_id);
