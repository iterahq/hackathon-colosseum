-- ============================================================================
-- Itera migration 0066 — the primitives that let TEST IDENTITIES live in a
-- tenant of their own, so that tenant-scoped metrics stop counting them.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- Decision: Tainan, Telegram 2026-08-13 — option **C**, "give the ITERA test
-- identities their own tenant". Option A (exclude the test users at every
-- reader) was REJECTED because it depends on every future query author
-- remembering. So the isolation must be STRUCTURAL: the test identities hold
-- no membership in a real tenant, and the readers need no new clause.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS MEASURED FIRST, BECAUSE IT DECIDES WHETHER C WORKS AT ALL
-- ---------------------------------------------------------------------------
-- Five identities are involved: claude-e2e-prof, claude-e2e-aluno1,
-- claude-e2e-aluno2, itera-smoke@iterahq.dev and
-- taigfs+claudemain-smoke@devfellowship.com. Measured in production
-- 2026-08-13 (read-only, admin path):
--
--   table                rows owned by the five
--   -------------------  ----------------------
--   activity_results     179
--   activity_traces       22
--   progress              36
--   class_answers          5
--   ---------------------------
--   subtotal             242      <- the brief said 223; the e2e suite keeps
--   xp_events             64         running, so this number GROWS. It is not
--   class_attendance      34         a fixed set to be migrated once.
--   learner_personaliz.    1
--   ---------------------------
--   total                341
--
-- NONE of activity_results / activity_traces / progress / class_answers has a
-- `tenant_id` column. There is therefore no such thing as "moving those rows
-- to another tenant" — their tenant is DERIVED, and it is derived two
-- different ways that do not agree:
--
--   (a) USER side    user_id -> itera.memberships -> tenant_id
--   (b) CONTENT side activity_id -> lessons -> units -> programs.tenant_id
--                    (class_answers: session_id -> class_sessions.tenant_id)
--
-- Which one the product actually uses decides whether moving a membership
-- fixes anything. Measured, in itera-player:
--
--   * src/services/admin.service.ts — the tenant-admin dashboard
--     (getAdminRoster / getAdminCompletion / getAdminEngagement) picks the
--     cohort with `tenantLearners(tenantId)`, i.e. `memberships.eq(tenant_id)`,
--     and then reads activity_results/progress with `.in('user_id', ids)`.
--     That is (a). The content-side walk is used ONLY to build the completion
--     DENOMINATOR (which activities count), never to choose which result rows
--     are read.
--   * The RLS policies say the same thing: results_select_admin,
--     progress_select_admin, traces_select_admin and traces_select_instructor
--     are all `user_id in (select m.user_id from itera.memberships m where
--     m.tenant_id in (...))`.
--
-- So the metric surface that matters is USER-scoped, and moving the five
-- memberships does remove them from it — structurally, with no reader change.
-- That is what makes option C sound. It is also why this file adds no
-- filtering anywhere: there is nothing to filter.
--
-- The honest limit, recorded here because it will be asked later: a query
-- written on the CONTENT side still sees the historical rows. 152 of the 179
-- activity_results point at `dfl-batch` programs and 27 at `itera` programs.
-- Those rows cannot be re-pointed — there is no column to re-point. Closing
-- that gap needs the QA tenant to own its own copy of a program, so that
-- FUTURE e2e traffic is content-side clean too; that is content work
-- (`instantiate_program` on the authoring MCP), not schema, and it is not in
-- this file.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A MIGRATION AT ALL, GIVEN THAT MOVING USERS IS *DATA*
-- ---------------------------------------------------------------------------
-- CLAUDE.md is explicit that data goes through an MCP tool with the caller's
-- user-JWT, never a migration. This file inserts and deletes nothing. It
-- exists because that MCP tool has nothing to call: measured on the live
-- database,
--
--   grantee        privileges on itera.tenants   on itera.memberships
--   -------------  ---------------------------   --------------------
--   anon           SELECT                        SELECT
--   authenticated  SELECT                        SELECT
--
-- — no INSERT/UPDATE/DELETE for any end-user role, and every policy on both
-- tables is `for select`. So an authenticated caller cannot create a tenant
-- and cannot add a membership. Migration 0056 hit this exact wall for the
-- REVOKE half and answered it with `itera.revoke_membership(...)`, a
-- SECURITY DEFINER primitive callable by a real user-JWT. This file completes
-- the pair: the CREATE half.
--
-- ---------------------------------------------------------------------------
-- THE TRAP THIS FILE IS MOSTLY ABOUT: SILENT PROMOTION
-- ---------------------------------------------------------------------------
-- `itera.custom_access_token_hook` (migration 0004) publishes ONE `user_role`
-- claim, computed as the MAXIMUM role across ALL of a user's memberships, with
-- no tenant filter:
--
--     max(case m.role when 'owner' then 5 when 'tenant_admin' then 4
--                     when 'author' then 3 when 'instructor' then 2
--                     when 'learner' then 1 else 0 end)
--     from itera.memberships m where m.user_id = itera_uid;
--
-- The obvious way to set up a QA tenant is to make its members `owner` of it.
-- Do that and every one of the five gets `user_role = 'owner'`:
--
--     identity            role today      role if granted owner in QA
--     ------------------  --------------  ---------------------------
--     claude-e2e-aluno1   learner         owner
--     claude-e2e-aluno2   learner         owner
--     claude-e2e-prof     instructor      owner
--     itera-smoke         tenant_admin    owner
--     claudemain-smoke    learner         owner
--
-- e2e/route-access-matrix.spec.ts asserts that `claude-e2e-prof` reaches
-- /author and is DENIED /admin, and that `claude-e2e-aluno1` is denied both.
-- A promoted learner does not make those assertions fail loudly — it makes the
-- suite assert the wrong thing while staying green. So the promotion guard is
-- not a nicety here; it is the difference between an isolation change and a
-- privilege change wearing its clothes.
--
-- `itera.grant_membership` therefore REFUSES, in a test tenant, to grant a
-- role strictly higher than the role the target user already holds somewhere.
-- Each identity keeps the exact `user_role` it has today, and the move is
-- observably role-neutral.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES *NOT* DO
-- ---------------------------------------------------------------------------
-- It does not add a trigger forbidding a user to hold memberships in both a
-- test and a non-test tenant. That invariant is the real goal, but enforcing
-- it as a hard constraint deadlocks its own administration: whoever creates
-- the QA tenant becomes its owner while still being an admin of a real tenant,
-- and `itera-smoke` is `tenant_admin` of the `itera` tenant precisely because
-- e2e/author-activity-kinds.spec.ts asserts what that identity can author
-- there. A constraint that must be worked around on the first use is worse
-- than no constraint. Instead the invariant ships as an ASSERTABLE READ —
-- `itera.test_tenant_isolation_violations()` — restricted to the roles that
-- actually generate metric rows (learner, instructor), so CI and the daily
-- db-drift job can go red on a regression without blocking administration.
--
-- Idempotent: `add column if not exists`, `create or replace function`, and a
-- read-only report. Re-running the series changes nothing (db-migration-check
-- runs it twice and diffs).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The marker. Which tenant is a test tenant becomes DATA, not folklore.
-- ---------------------------------------------------------------------------
alter table itera.tenants
  add column if not exists is_test boolean not null default false;

comment on column itera.tenants.is_test is
  'True for a tenant that exists only to hold automated-test identities '
  '(e2e, smoke, probes). Set by itera.create_test_tenant() and never by hand. '
  'The point of the flag is that isolation stops being remembered and starts '
  'being queryable: a reporting query that wants real learners joins '
  'itera.tenants and filters `not is_test`, and — more importantly — the test '
  'identities hold NO membership in a real tenant, so the membership-scoped '
  'readers (src/services/admin.service.ts, and the results/progress/traces '
  'admin+instructor RLS policies) exclude them with no clause at all. '
  'Distinct from itera.users.is_guest, which marks link-invited live-class '
  'guests: a guest is a real human whose rows are kept but held out of the '
  'class report, whereas a test identity is not a human at all.';

-- ---------------------------------------------------------------------------
-- 2. create_test_tenant — the only sanctioned way a test tenant appears.
--
--    Narrow on purpose. This is NOT `create_tenant`: general tenant creation
--    by any authenticated caller would be a new self-serve surface on a
--    product that deliberately has none (src/pages/auth/AuthPage.tsx: "Access
--    requires a DFL membership or an active Itera subscription"). This
--    function can only ever produce an is_test tenant with a `qa-` slug, and
--    only for a caller who already administers something.
-- ---------------------------------------------------------------------------
create or replace function itera.create_test_tenant(
  p_slug text,
  p_name text default null
)
returns itera.tenants
language plpgsql
security definer
set search_path to 'itera', 'public'
as $function$
declare
  v_caller  uuid;
  v_may     boolean;
  v_tenant  itera.tenants;
begin
  -- 1. Resolve the caller from their own JWT. No parameter can spoof this.
  v_caller := itera.current_itera_user_id();
  if v_caller is null then
    raise exception 'not authenticated as an itera user'
      using errcode = '42501';
  end if;

  if p_slug is null or btrim(p_slug) = '' then
    raise exception 'p_slug is required' using errcode = '22023';
  end if;

  -- 2. The slug is fenced. A test tenant is identifiable from its name alone,
  --    which matters when someone reads a metric query six months from now.
  if p_slug !~ '^qa-[a-z0-9][a-z0-9-]*$' then
    raise exception
      'test tenant slug must match ^qa-[a-z0-9][a-z0-9-]*$ (got %)', p_slug
      using errcode = '22023';
  end if;

  -- 3. Authorize: the caller must already administer SOME tenant. This is not
  --    a self-serve signup path.
  select exists (
    select 1 from itera.memberships m
    where m.user_id = v_caller
      and m.role in ('owner', 'tenant_admin')
  ) into v_may;

  if not v_may then
    raise exception
      'caller must be owner or tenant_admin of some tenant to create a test tenant'
      using errcode = '42501';
  end if;

  -- 4. Idempotent by slug. Calling twice returns the same row rather than
  --    raising on the unique constraint — the tool that calls this is a
  --    setup step and will be re-run.
  select t.* into v_tenant from itera.tenants t where t.slug = p_slug;

  if found then
    if not v_tenant.is_test then
      raise exception
        'tenant % already exists and is NOT a test tenant; refusing to reclassify it',
        p_slug
        using errcode = '42501';
    end if;
  else
    insert into itera.tenants (slug, name, is_test)
    values (p_slug, coalesce(nullif(btrim(p_name), ''), p_slug), true)
    returning * into v_tenant;
  end if;

  -- 5. The caller owns it, so they can grant memberships into it. Note this
  --    deliberately leaves the caller spanning a test and a real tenant; see
  --    the header, and itera.test_tenant_isolation_violations() below, which
  --    scopes the invariant to metric-producing roles for exactly this reason.
  insert into itera.memberships (user_id, tenant_id, role)
  values (v_caller, v_tenant.id, 'owner')
  on conflict (user_id, tenant_id) do nothing;

  return v_tenant;
end;
$function$;

comment on function itera.create_test_tenant(text, text) is
  'Create (or return) a tenant marked is_test, slug fenced to ^qa-. Caller '
  'must be owner/tenant_admin somewhere and becomes owner of the result. '
  'Idempotent. Refuses to reclassify an existing non-test tenant.';

revoke all on function itera.create_test_tenant(text, text) from public;
grant execute on function itera.create_test_tenant(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. grant_membership — the CREATE half of the pair 0056 started.
--
--    itera.grant_author(...) (0051) exists but only ever writes the `author`
--    role, so it cannot reproduce a learner or an instructor in a new tenant.
--    Reproducing the role EXACTLY is the whole requirement here.
-- ---------------------------------------------------------------------------
create or replace function itera.grant_membership(
  p_tenant_id  uuid,
  p_role       itera.member_role,
  p_user_id    uuid default null,
  p_user_email text default null
)
returns itera.memberships
language plpgsql
security definer
set search_path to 'itera', 'public'
as $function$
declare
  v_caller       uuid;
  v_caller_role  itera.member_role;
  v_target       uuid;
  v_found        uuid;
  v_is_test      boolean;
  v_target_max   integer;
  v_new_rank     integer;
  v_row          itera.memberships;
begin
  -- 1. Resolve the caller from their own JWT. No parameter can spoof this.
  v_caller := itera.current_itera_user_id();
  if v_caller is null then
    raise exception 'not authenticated as an itera user'
      using errcode = '42501';
  end if;

  if p_tenant_id is null then
    raise exception 'p_tenant_id is required' using errcode = '22023';
  end if;
  if p_role is null then
    raise exception 'p_role is required' using errcode = '22023';
  end if;

  select t.is_test into v_is_test
  from itera.tenants t where t.id = p_tenant_id;

  if v_is_test is null then
    raise exception 'no tenant with id %', p_tenant_id using errcode = 'P0002';
  end if;

  -- 2. Authorize the caller in the TARGET tenant (mirrors 0056).
  select m.role into v_caller_role
  from itera.memberships m
  where m.user_id = v_caller and m.tenant_id = p_tenant_id;

  if v_caller_role is null then
    raise exception 'caller holds no membership in tenant %', p_tenant_id
      using errcode = '42501';
  end if;

  if v_caller_role not in ('owner', 'tenant_admin') then
    raise exception
      'caller role % may not grant memberships in tenant %',
      v_caller_role, p_tenant_id
      using errcode = '42501';
  end if;

  -- 3. Resolve the target by id, else by email (mirrors 0051 / 0056).
  if p_user_id is not null then
    v_target := p_user_id;
  elsif p_user_email is not null then
    select u.id into v_target
    from itera.users u
    where lower(u.email) = lower(p_user_email);
    if v_target is null then
      raise exception 'no itera user found with email %', p_user_email
        using errcode = 'P0002';
    end if;
  else
    raise exception 'either p_user_id or p_user_email is required'
      using errcode = '22023';
  end if;

  select u.id into v_found from itera.users u where u.id = v_target;
  if v_found is null then
    raise exception 'no itera user found with id %', v_target
      using errcode = 'P0002';
  end if;

  -- 4. THE PROMOTION GUARD. See the header block.
  --
  --    itera.custom_access_token_hook publishes max(role) across ALL of a
  --    user's memberships as a single `user_role` claim. Granting a higher
  --    role inside a test tenant would therefore raise the user's role
  --    EVERYWHERE, and e2e/route-access-matrix.spec.ts would keep passing
  --    while asserting the wrong thing. In a test tenant a user may only be
  --    reproduced at, or below, the rank they already hold.
  if v_is_test then
    select coalesce(max(
      case m.role
        when 'owner' then 5 when 'tenant_admin' then 4 when 'author' then 3
        when 'instructor' then 2 when 'learner' then 1 else 0 end), 0)
    into v_target_max
    from itera.memberships m
    where m.user_id = v_target;

    v_new_rank := case p_role
      when 'owner' then 5 when 'tenant_admin' then 4 when 'author' then 3
      when 'instructor' then 2 when 'learner' then 1 else 0 end;

    if v_new_rank > v_target_max then
      raise exception
        'refusing to grant % in test tenant %: it would raise the user''s '
        'custom_access_token_hook user_role claim above their current highest '
        'role (rank % > %). A test identity must keep the role it already has.',
        p_role, p_tenant_id, v_new_rank, v_target_max
        using errcode = '42501';
    end if;
  end if;

  -- 5. Write. Idempotent, and an existing row is updated to the asked role
  --    (subject to the same guard above).
  insert into itera.memberships (user_id, tenant_id, role)
  values (v_target, p_tenant_id, p_role)
  on conflict (user_id, tenant_id) do update set role = excluded.role
  returning * into v_row;

  return v_row;
end;
$function$;

comment on function itera.grant_membership(uuid, itera.member_role, uuid, text) is
  'Add or update a membership, callable with a real user-JWT. Caller must be '
  'owner/tenant_admin of the target tenant. In an is_test tenant it REFUSES to '
  'grant a role above the target user''s existing highest role, because '
  'itera.custom_access_token_hook publishes max(role) across all memberships '
  'as one user_role claim — so a careless grant silently promotes a test '
  'learner and makes every role assertion pass for the wrong reason. '
  'Companion to itera.revoke_membership (migration 0056).';

revoke all on function itera.grant_membership(uuid, itera.member_role, uuid, text) from public;
grant execute on function itera.grant_membership(uuid, itera.member_role, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The invariant, as an assertable read rather than a constraint.
--
--    Scoped to `learner` and `instructor` — the roles that actually produce
--    activity_results / activity_traces / progress / class_answers rows. An
--    owner or tenant_admin spanning a test and a real tenant is ordinary
--    administration and must not be blocked (see header).
-- ---------------------------------------------------------------------------
create or replace function itera.test_tenant_isolation_violations()
returns table (
  user_id       uuid,
  email         text,
  test_tenant   text,
  real_tenant   text,
  role_in_real  itera.member_role
)
language sql
stable
security definer
set search_path to 'itera', 'public'
as $function$
  select u.id, u.email, tt.slug, rt.slug, mr.role
  from itera.memberships mt
  join itera.tenants     tt on tt.id = mt.tenant_id and tt.is_test
  join itera.memberships mr on mr.user_id = mt.user_id
  join itera.tenants     rt on rt.id = mr.tenant_id and not rt.is_test
  join itera.users       u  on u.id = mt.user_id
  where mr.role in ('learner', 'instructor')
  order by u.email, rt.slug;
$function$;

comment on function itera.test_tenant_isolation_violations() is
  'Rows here mean the isolation has regressed: a member of a test tenant also '
  'holds a metric-producing membership (learner/instructor) in a real tenant, '
  'so its rows are back inside that tenant''s roster, completion and '
  'engagement figures. Expected to return zero rows. Assert it in CI and in '
  'the daily db-drift job. Deliberately a report and not a trigger — see the '
  'header of migration 0066 for why a hard constraint deadlocks its own setup.';

revoke all on function itera.test_tenant_isolation_violations() from public;
grant execute on function itera.test_tenant_isolation_violations() to authenticated;

commit;
