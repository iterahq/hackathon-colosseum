-- ============================================================================
-- Itera live-class / real-time cohort mode v1 — server-authoritative pointer.
-- Plan: 20260702-iterahq-live-class-dogfood-sync-layer.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx). ADR-3 / ADR-26.
--
-- Adds itera.class_sessions (the durable truth for a live cohort class) + a
-- per-tenant `live_class_enabled` gate. A live session carries a
-- server-authoritative `current_activity_id`; when the instructor advances it,
-- ALL joined students re-point to that activity (Kahoot-style force-advance).
-- Result writes stay per-user/unchanged (itera.progress / activity_results) —
-- this table ONLY controls WHICH activity is on screen.
--
-- Scope = GLOBAL class for v1; the `scope` column (global|tenant) lets
-- per-tenant classes become a later enable-flip, not a rebuild.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums (mirrors the 0001 idempotent do-block pattern).
-- ---------------------------------------------------------------------------
do $$ begin
  create type itera.class_session_status as enum ('pending','live','ended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type itera.class_scope as enum ('global','tenant');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Per-tenant enable flag (the whole feature is inert unless a user's tenant has
-- this true). Only the DevFellowship pilot tenant (slug 'dfl-batch') is enabled
-- now — every other tenant defaults to false.
-- ---------------------------------------------------------------------------
alter table itera.tenants
  add column if not exists live_class_enabled boolean not null default false;

update itera.tenants set live_class_enabled = true where slug = 'dfl-batch';

-- ---------------------------------------------------------------------------
-- class_sessions — the durable/reconnect truth for a live cohort class.
-- current_activity_id is nullable (a session may be pending before the first
-- pointer is set) and ON DELETE SET NULL (deleting the activity doesn't drop the
-- session). instructor_id FKs itera.users (the Itera-local id, NOT auth uid).
-- ---------------------------------------------------------------------------
create table if not exists itera.class_sessions (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references itera.tenants(id)    on delete cascade,
  lesson_id           uuid not null references itera.lessons(id)    on delete cascade,
  instructor_id       uuid not null references itera.users(id)      on delete cascade,
  current_activity_id uuid          references itera.activities(id) on delete set null,
  status              itera.class_session_status not null default 'pending',
  scope               itera.class_scope          not null default 'global',
  started_at          timestamptz,
  ended_at            timestamptz,
  created_at          timestamptz not null default now()
);

-- REPLICA IDENTITY FULL so the realtime postgres_changes UPDATE payload carries
-- the full new row (current_activity_id + status) — the durable/reconnect path
-- the broadcast fast-path falls back to.
alter table itera.class_sessions replica identity full;

create index if not exists idx_class_sessions_tenant on itera.class_sessions(tenant_id);
create index if not exists idx_class_sessions_status on itera.class_sessions(status);
-- Hot path: "is there a live class visible to me right now?" (drives the badge).
create index if not exists idx_class_sessions_live
  on itera.class_sessions(scope, status) where status = 'live';

-- ---------------------------------------------------------------------------
-- Staff (instructor / tenant_admin / owner) tenant-id helper — SECURITY DEFINER
-- so the write/read policies don't recurse through RLS. Mirrors the shape of
-- itera.current_tenant_ids() / current_admin_tenant_ids(). Returns the set of
-- tenant_ids where the caller may RUN or OBSERVE a class (start/advance/end a
-- session; read the tenant's roster/completion for the "who's done" view).
-- ---------------------------------------------------------------------------
create or replace function itera.current_instructor_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = itera, public
as $$
  select m.tenant_id
  from itera.memberships m
  where m.user_id = itera.current_itera_user_id()
    and m.role in ('instructor','tenant_admin','owner');
$$;

grant execute on function itera.current_instructor_tenant_ids() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS — class_sessions.
-- ---------------------------------------------------------------------------
alter table itera.class_sessions enable row level security;

-- SELECT: an authenticated user sees
--   (a) any GLOBAL live session (join-the-global-class, v1 scope), OR
--   (b) any session of a tenant they are a member of (covers tenant-scoped
--       classes AND lets staff read their own pending/ended sessions, since a
--       member — including the instructor — is in current_tenant_ids()).
drop policy if exists class_sessions_select on itera.class_sessions;
create policy class_sessions_select on itera.class_sessions
  for select using (
    (scope = 'global' and status = 'live')
    or tenant_id in (select itera.current_tenant_ids())
  );

-- INSERT: only an instructor/admin/owner of the tenant, creating a session that
-- names themselves as the instructor.
drop policy if exists class_sessions_insert_staff on itera.class_sessions;
create policy class_sessions_insert_staff on itera.class_sessions
  for insert to authenticated
  with check (
    instructor_id = itera.current_itera_user_id()
    and tenant_id in (select itera.current_instructor_tenant_ids())
  );

-- UPDATE: instructor/admin/owner of the owning tenant (advance the pointer, end).
drop policy if exists class_sessions_update_staff on itera.class_sessions;
create policy class_sessions_update_staff on itera.class_sessions
  for update to authenticated
  using (tenant_id in (select itera.current_instructor_tenant_ids()))
  with check (tenant_id in (select itera.current_instructor_tenant_ids()));

-- No DELETE policy by design — sessions are ENDED (status='ended'), never deleted
-- (keeps an audit trail of past classes).

-- ---------------------------------------------------------------------------
-- Instructor-scoped READ policies for the "who's done on the current activity"
-- view. An instructor running a live class needs the tenant roster + per-activity
-- completion — but the existing admin READ policies only cover `tenant_admin`.
-- These additive SELECT policies mirror the 0004 admin ones but resolve via
-- current_instructor_tenant_ids() (which also includes admin/owner). PostgREST ORs
-- them with the existing self/admin policies — no write access is granted here.
-- ---------------------------------------------------------------------------

-- users: staff sees every user with a membership in their tenant.
drop policy if exists users_select_instructor on itera.users;
create policy users_select_instructor on itera.users
  for select using (
    id in (
      select m.user_id from itera.memberships m
      where m.tenant_id in (select itera.current_instructor_tenant_ids())
    )
  );

-- memberships: staff sees every membership row in their tenant (roster).
drop policy if exists memberships_select_instructor on itera.memberships;
create policy memberships_select_instructor on itera.memberships
  for select using (
    tenant_id in (select itera.current_instructor_tenant_ids())
  );

-- activity_results: staff sees results of any member of their tenant
-- (no tenant_id on the row — join via memberships).
drop policy if exists results_select_instructor on itera.activity_results;
create policy results_select_instructor on itera.activity_results
  for select using (
    user_id in (
      select m.user_id from itera.memberships m
      where m.tenant_id in (select itera.current_instructor_tenant_ids())
    )
  );

-- progress: same membership-join scoping.
drop policy if exists progress_select_instructor on itera.progress;
create policy progress_select_instructor on itera.progress
  for select using (
    user_id in (
      select m.user_id from itera.memberships m
      where m.tenant_id in (select itera.current_instructor_tenant_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- Grants — RLS still applies; these just allow the roles to attempt access.
-- ---------------------------------------------------------------------------
grant select on itera.class_sessions to anon, authenticated;
grant insert, update on itera.class_sessions to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime durability: add class_sessions to the supabase_realtime publication
-- so postgres_changes (the durable/reconnect path) fires on advance/end.
-- Broadcast + presence need no publication; this is belt for the fast path.
-- Idempotent — ADD TABLE errors if already a member, so guard it.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c     on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'itera'
      and c.relname = 'class_sessions'
  ) then
    alter publication supabase_realtime add table itera.class_sessions;
  end if;
end $$;
