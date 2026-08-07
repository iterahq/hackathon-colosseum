-- ============================================================================
-- fresh-apply-bootstrap.sql — the Supabase runtime objects that exist in the
-- ITERA production database but NOT in the `supabase/postgres` Docker image.
--
-- WHAT BELONGS IN HERE, AND WHAT DOES NOT
-- ---------------------------------------
-- ONLY objects that are created by a Supabase SERVICE rather than by a file in
-- db/migrations/. The image already ships the roles (`anon`, `authenticated`,
-- `service_role`, `supabase_admin`, `supabase_auth_admin`), the `auth` schema
-- with `auth.users` / `auth.uid()` / `auth.role()` / `auth.jwt()`, the
-- `supabase_realtime` publication, and `pg_cron` in shared_preload_libraries —
-- so none of that is repeated here. Verified against
-- supabase/postgres:17.6.1.160 on 2026-08-07.
--
-- ⚠️ NEVER put a `create table itera.…` in this file. Anything in the `itera`
-- or `billing` schema is the migrations' job, and pre-creating it here would
-- make the check pass for a migration that cannot actually build it. That is
-- the exact failure this whole workflow exists to prevent.
--
-- WHY realtime.messages IS NOT IN THE IMAGE
-- -----------------------------------------
-- It is created by the `realtime` (Elixir) service at boot, not by Postgres.
-- Migrations 0022 / 0023 / 0029 / 0036 attach RLS policies to it, so without it
-- they fail with `relation "realtime.messages" does not exist` — measured, not
-- assumed. The shape below mirrors the real one closely enough for a policy to
-- compile and for `realtime.topic()` to be callable; it is deliberately NOT
-- partitioned, because nothing in db/migrations/ depends on the partitioning.
-- ============================================================================

create schema if not exists realtime;

create table if not exists realtime.messages (
  topic       text        not null,
  extension   text        not null,
  payload     jsonb,
  event       text,
  private     boolean     default false,
  updated_at  timestamp   not null default now(),
  inserted_at timestamp   not null default now(),
  id          uuid        not null default gen_random_uuid()
);

alter table realtime.messages enable row level security;

-- The real one reads the per-connection setting that the realtime service sets
-- for the channel being joined. Same signature, same volatility.
create or replace function realtime.topic() returns text
  language sql stable
as $$ select nullif(current_setting('realtime.topic', true), '')::text $$;

grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert on realtime.messages to anon, authenticated, service_role;
