-- ============================================================================
-- Itera RLS — tenant isolation (ADR-103 / ADR-F3).
-- A learner can only read/write rows belonging to tenants they are a member of.
-- Tenant membership is resolved from the caller's Supabase auth uid -> the
-- linked itera.users row (via itera.identities, provider='dfl'|'password'|...)
-- -> itera.memberships.tenant_id.
-- Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Identity helpers (SECURITY DEFINER so policies can read across the join
-- without recursive RLS). search_path pinned for safety.
-- ---------------------------------------------------------------------------

-- The Supabase auth uid of the caller (auth.uid()), as the identities.provider_subject.
create or replace function itera.current_itera_user_id()
returns uuid
language sql
stable
security definer
set search_path = itera, public
as $$
  select i.user_id
  from itera.identities i
  where i.provider_subject = (auth.uid())::text
  limit 1;
$$;

create or replace function itera.current_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = itera, public
as $$
  select m.tenant_id
  from itera.memberships m
  where m.user_id = itera.current_itera_user_id();
$$;

grant execute on function itera.current_itera_user_id() to anon, authenticated;
grant execute on function itera.current_tenant_ids() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table.
-- ---------------------------------------------------------------------------
alter table itera.tenants            enable row level security;
alter table itera.users              enable row level security;
alter table itera.identities         enable row level security;
alter table itera.memberships        enable row level security;
alter table itera.programs           enable row level security;
alter table itera.units              enable row level security;
alter table itera.lessons            enable row level security;
alter table itera.activities         enable row level security;
alter table itera.progress           enable row level security;
alter table itera.xp_events          enable row level security;
alter table itera.badges             enable row level security;
alter table itera.user_badges        enable row level security;
alter table itera.activity_results   enable row level security;
alter table itera.artifacts          enable row level security;

-- ---------------------------------------------------------------------------
-- Policy helper: drop-if-exists then create (idempotent).
-- ---------------------------------------------------------------------------

-- tenants: branding is readable anonymously for the white-label login screen.
drop policy if exists tenants_select_public on itera.tenants;
create policy tenants_select_public on itera.tenants
  for select using (true);

-- users: a user sees only their own row.
drop policy if exists users_select_self on itera.users;
create policy users_select_self on itera.users
  for select using (id = itera.current_itera_user_id());

-- identities: a user sees only their own identities.
drop policy if exists identities_select_self on itera.identities;
create policy identities_select_self on itera.identities
  for select using (user_id = itera.current_itera_user_id());

-- memberships: a user sees only their own memberships.
drop policy if exists memberships_select_self on itera.memberships;
create policy memberships_select_self on itera.memberships
  for select using (user_id = itera.current_itera_user_id());

-- Content tables: readable only by members of the owning tenant.
drop policy if exists programs_select_tenant on itera.programs;
create policy programs_select_tenant on itera.programs
  for select using (tenant_id in (select itera.current_tenant_ids()));

drop policy if exists units_select_tenant on itera.units;
create policy units_select_tenant on itera.units
  for select using (
    program_id in (
      select p.id from itera.programs p
      where p.tenant_id in (select itera.current_tenant_ids())
    )
  );

drop policy if exists lessons_select_tenant on itera.lessons;
create policy lessons_select_tenant on itera.lessons
  for select using (
    unit_id in (
      select u.id from itera.units u
      join itera.programs p on p.id = u.program_id
      where p.tenant_id in (select itera.current_tenant_ids())
    )
  );

drop policy if exists activities_select_tenant on itera.activities;
create policy activities_select_tenant on itera.activities
  for select using (
    lesson_id in (
      select l.id from itera.lessons l
      join itera.units u on u.id = l.unit_id
      join itera.programs p on p.id = u.program_id
      where p.tenant_id in (select itera.current_tenant_ids())
    )
  );

-- Per-user gamification + results: own rows only.
drop policy if exists progress_rw_self on itera.progress;
create policy progress_rw_self on itera.progress
  for all using (user_id = itera.current_itera_user_id())
  with check (user_id = itera.current_itera_user_id());

drop policy if exists xp_select_self on itera.xp_events;
create policy xp_select_self on itera.xp_events
  for select using (user_id = itera.current_itera_user_id());

drop policy if exists badges_select_tenant on itera.badges;
create policy badges_select_tenant on itera.badges
  for select using (tenant_id in (select itera.current_tenant_ids()));

drop policy if exists user_badges_select_self on itera.user_badges;
create policy user_badges_select_self on itera.user_badges
  for select using (user_id = itera.current_itera_user_id());

drop policy if exists results_rw_self on itera.activity_results;
create policy results_rw_self on itera.activity_results
  for all using (user_id = itera.current_itera_user_id())
  with check (user_id = itera.current_itera_user_id());

drop policy if exists artifacts_rw_self on itera.artifacts;
create policy artifacts_rw_self on itera.artifacts
  for all using (user_id = itera.current_itera_user_id())
  with check (user_id = itera.current_itera_user_id());

-- ---------------------------------------------------------------------------
-- Grants — RLS still applies; these just allow the roles to attempt access.
-- ---------------------------------------------------------------------------
grant select on all tables in schema itera to anon, authenticated;
grant insert, update, delete on
  itera.progress, itera.activity_results, itera.artifacts
  to authenticated;
