-- ============================================================================
-- Itera tenant-admin observability — role + RLS + access-token claim hook.
-- Plan: 20260619-itera-tenant-admin-metrics (ADR-1/2/6/7/8).
--
-- Adds a READ-ONLY, single-tenant `tenant_admin` role that can observe its OWN
-- tenant's learners + results/progress — NO writes anywhere, NO cross-tenant
-- visibility, NO authoring (authoring lives in dfl-lms-admin, a different app).
--
-- Tenant scoping is via the membership-join (ADR-6): tenant_id lives ONLY on
-- itera.memberships, NOT on activity_results/progress. The admin's tenant set is
-- resolved from auth.uid() -> identities -> users -> memberships (role-filtered),
-- mirroring the existing itera.current_tenant_ids() / current_author_tenant_ids().
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Role enum value (ADR-7). No-op if already present (sibling #5 / foundation
--    may have added it). ALTER TYPE ... ADD VALUE cannot run inside a multi-stmt
--    transaction in older PG; IF NOT EXISTS makes it a clean no-op here.
-- ---------------------------------------------------------------------------
alter type itera.member_role add value if not exists 'tenant_admin';

-- ---------------------------------------------------------------------------
-- 2. Admin tenant-id helper (ADR-6 membership-join). SECURITY DEFINER so the
--    policy join doesn't recurse through RLS. search_path pinned for safety.
--    Returns the set of tenant_ids where the caller is a tenant_admin.
-- ---------------------------------------------------------------------------
create or replace function itera.current_admin_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = itera, public
as $$
  select m.tenant_id
  from itera.memberships m
  where m.user_id = itera.current_itera_user_id()
    and m.role = 'tenant_admin';
$$;

grant execute on function itera.current_admin_tenant_ids() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tenant-admin READ policies (ADR-1/2). RLS is the authority; the app ALSO
--    filters by tenant_id (belt + suspenders). These are additive SELECT-only
--    policies — the existing self-scoped policies stay; PostgREST ORs them, so a
--    tenant_admin sees their own rows AND every row in their tenant. No INSERT/
--    UPDATE/DELETE policy is added for tenant_admin (read-only by construction).
-- ---------------------------------------------------------------------------

-- users: admin sees every user that has a membership in the admin's tenant.
drop policy if exists users_select_admin on itera.users;
create policy users_select_admin on itera.users
  for select using (
    id in (
      select m.user_id
      from itera.memberships m
      where m.tenant_id in (select itera.current_admin_tenant_ids())
    )
  );

-- memberships: admin sees every membership row in the admin's tenant
-- (needed to roster learners + their role within the tenant).
drop policy if exists memberships_select_admin on itera.memberships;
create policy memberships_select_admin on itera.memberships
  for select using (
    tenant_id in (select itera.current_admin_tenant_ids())
  );

-- activity_results: admin sees results of any user who is a member of the
-- admin's tenant (activity_results has NO tenant_id — join via memberships).
drop policy if exists results_select_admin on itera.activity_results;
create policy results_select_admin on itera.activity_results
  for select using (
    user_id in (
      select m.user_id
      from itera.memberships m
      where m.tenant_id in (select itera.current_admin_tenant_ids())
    )
  );

-- progress: same membership-join scoping.
drop policy if exists progress_select_admin on itera.progress;
create policy progress_select_admin on itera.progress
  for select using (
    user_id in (
      select m.user_id
      from itera.memberships m
      where m.tenant_id in (select itera.current_admin_tenant_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Custom access-token hook (ADR-7). Surfaces the caller's role + tenant_id
--    into the JWT claims so the app gate / RLS can read them without a round
--    trip. Wiring it live requires enabling the hook in the Supabase Auth
--    config (Dashboard: Authentication > Hooks > Customize Access Token, point
--    at itera.custom_access_token_hook) — the function lands here idempotently
--    regardless. The app gate ALSO reads role from itera.memberships directly
--    (via memberships_select_self), so it does not hard-depend on the hook
--    being enabled.
--
--    Shape: takes the standard hook `event` jsonb, returns it with
--    claims.user_role + claims.tenant_ids merged in.
-- ---------------------------------------------------------------------------
create or replace function itera.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = itera, public
as $$
declare
  claims     jsonb;
  uid        uuid;
  itera_uid  uuid;
  v_role     text;
  v_tenants  uuid[];
begin
  claims := coalesce(event->'claims', '{}'::jsonb);

  -- The Supabase auth uid is provided by the hook event (user_id), which maps
  -- to itera.identities.provider_subject.
  uid := nullif(event->>'user_id', '')::uuid;

  if uid is not null then
    select i.user_id into itera_uid
    from itera.identities i
    where i.provider_subject = uid::text
    limit 1;
  end if;

  if itera_uid is not null then
    -- Highest-privilege role across the user's memberships (admin > author >
    -- instructor > learner) + the set of tenant_ids the user belongs to.
    select
      coalesce(
        max(case m.role
              when 'owner'        then 5
              when 'tenant_admin' then 4
              when 'author'       then 3
              when 'instructor'   then 2
              when 'learner'      then 1
              else 0 end),
        0),
      array_agg(distinct m.tenant_id)
    into v_role, v_tenants
    from itera.memberships m
    where m.user_id = itera_uid;

    claims := jsonb_set(
      claims,
      '{user_role}',
      to_jsonb(
        case v_role::int
          when 5 then 'owner'
          when 4 then 'tenant_admin'
          when 3 then 'author'
          when 2 then 'instructor'
          when 1 then 'learner'
          else 'none'
        end
      )
    );

    if v_tenants is not null then
      claims := jsonb_set(claims, '{tenant_ids}', to_jsonb(v_tenants));
    end if;
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Supabase auth (the `supabase_auth_admin` role) invokes the hook; grant it.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function itera.custom_access_token_hook(jsonb) to supabase_auth_admin';
    execute 'grant usage on schema itera to supabase_auth_admin';
  end if;
end $$;
