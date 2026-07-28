-- ============================================================================
-- Itera migration 0026 — guest link for the live class (membership-less guest)
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY. NOT DFL prod.
-- Plan: 20260728-itera-guest-link-aula-sincrona (ADR-1, ADR-2/B5, ADR-4..ADR-13)
--
-- WHY THIS SHAPE (ADR-2, decided 2026-07-28)
-- ------------------------------------------
-- A guest joins ONE live session by link and must read NOTHING else. The cheap
-- option (grant the guest a `learner` membership in the real tenant) was measured
-- against prod with a REAL user JWT under enforced RLS: it hands over 3 programs /
-- 3 lessons / 30 activities of `dfl-batch` where the invariant allows ONE lesson.
--
-- So the guest gets **ZERO memberships**. That already works, because:
--   * `class_sessions_select` (0013) and `itera.can_access_class_topic()` (0022)
--     both read `((scope='global' AND status='live') OR tenant_id IN
--     current_tenant_ids())` — the FIRST leg needs no membership;
--   * the WITH CHECK of `class_answers_insert_self` / `class_attendance_insert_self`
--     (0020) is `user_id = current_itera_user_id() AND session_id IN (SELECT id
--     FROM itera.class_sessions)`, and that subselect is itself RLS-filtered by
--     `class_sessions_select` — so a membership-less guest can write its own answer
--     and attendance for THAT session and no other.
-- Consequence: **no content policy is touched and `realtime.messages` is NOT
-- touched.** The lesson content is served to the guest by itera-api
-- (`GET /v1/live/guest/:code/content`), scoped server-side to the invited session.
-- The guest reading `/rest/v1/lessons` returns [] not because a new policy is
-- correct, but because there is no policy that lets it in at all.
--
-- IDEMPOTENT. The Itera apply script (`db/scripts/apply-migrations.sh`) re-runs
-- EVERY file from 0001 in one psql session and there is NO ledger table, so every
-- statement here is guarded (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF
-- EXISTS). MERGING THE PR APPLIES NOTHING — a human runs the script afterwards.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Mark guests in the data (ADR-4). A guest is a real itera.users row so that
--    FKs (class_answers.user_id, class_attendance.user_id) keep working and so
--    the row survives the class for a later promotion to a real account (ADR-7).
-- ----------------------------------------------------------------------------
alter table itera.users
  add column if not exists is_guest boolean not null default false;

comment on column itera.users.is_guest is
  'True for link-invited live-class guests (migration 0026). Guests hold NO '
  'itera.memberships row — their read scope is empty by construction. Never '
  'delete a guest row: ADR-7 keeps the promotion path open.';

create index if not exists users_is_guest_idx
  on itera.users (is_guest) where is_guest;

-- ----------------------------------------------------------------------------
-- 2. The guest link code (ADR-5). The link carries a SHORT per-session code, not
--    the session UUID: revocable, rotatable, and it dies with the class because
--    every downstream check also requires status='live'.
--    NOTE: no cap on guests per session (ADR-10) — deliberately not modelled.
-- ----------------------------------------------------------------------------
alter table itera.class_sessions
  add column if not exists guest_code text;

comment on column itera.class_sessions.guest_code is
  'Short, rotatable per-session guest-link code (migration 0026, ADR-5). NULL '
  'until the instructor generates a guest link. Resolved server-side by '
  'itera-api; the code alone grants nothing once the session is no longer live.';

-- Partial unique: many sessions may have no code, but a code must resolve to one.
create unique index if not exists class_sessions_guest_code_key
  on itera.class_sessions (guest_code) where guest_code is not null;

-- ----------------------------------------------------------------------------
-- 3. session <-> guest link (ADR-7 promotion path, ADR-12 counter, ADR-4 metrics).
--    Written ONLY by itera-api (service_role). No INSERT/UPDATE policy exists, so
--    no end-user JWT can forge a guest registration.
-- ----------------------------------------------------------------------------
create table if not exists itera.class_guests (
  session_id  uuid not null references itera.class_sessions(id) on delete cascade,
  user_id     uuid not null references itera.users(id) on delete cascade,
  display_name text,
  created_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

alter table itera.class_guests enable row level security;

-- Read: the guest sees its own row; the session's instructors see their session's
-- guests (that is the ADR-12 "who is a guest + counter" affordance).
drop policy if exists class_guests_select_self on itera.class_guests;
create policy class_guests_select_self on itera.class_guests
  for select to authenticated
  using (user_id = itera.current_itera_user_id());

drop policy if exists class_guests_select_instructor on itera.class_guests;
create policy class_guests_select_instructor on itera.class_guests
  for select to authenticated
  using (
    session_id in (
      select s.id from itera.class_sessions s
      where s.tenant_id in (select itera.current_instructor_tenant_ids())
    )
  );

grant select on itera.class_guests to authenticated;

-- ----------------------------------------------------------------------------
-- 4. 🔴 THE RISKY ONE — guest guard in the auth provisioning trigger.
--
-- `itera.handle_new_federated_user()` is AFTER INSERT ON auth.users and runs for
-- EVERY Itera signup. An exception here rolls the signup back, so this change is
-- deliberately ADDITIVE: a single early branch keyed on an explicit marker that
-- ONLY our guest endpoint sets (`app_metadata.is_guest = true`). Every existing
-- signup path (DFL federated, google, password, the itera-api embed flow) never
-- sets that key, so it cannot enter the branch and its behaviour is bit-identical.
-- The body below the guard is a VERBATIM copy of the live 0015 body.
--
-- WHY THE GUARD IS NEEDED (drift found 2026-07-28): itera-api creates auth users
-- with `admin.createUser({email, email_confirm:true})` and NO metadata, so
-- provider='email' and dfl_sub is null → `v_is_plg` is TRUE → the PLG branch would
-- give EVERY GUEST a personal tenant `plg-<uid>` with role **owner**. Two harms:
--   (a) owner of a tenant = an authoring affordance, which the plan's invariant
--       explicitly forbids for a guest;
--   (b) `itera.tenants` was world-readable (see section 5), so each guest would
--       publish a public row named `guest+<sessionid>-<nonce>`, LEAKING THE
--       SESSION UUID of a live class to anonymous readers.
-- 0015 noted a trigger-only fix was impossible because there was no INSERT-time
-- signal distinguishing a federated fellow from a PLG signup. That reasoning does
-- not apply here: we control the guest createUser call, so we can stamp an
-- explicit, unambiguous marker.
--
-- ROLLBACK: re-run 0015 (its CREATE OR REPLACE restores the pre-guard body).
-- ----------------------------------------------------------------------------
create or replace function itera.handle_new_federated_user()
returns trigger
language plpgsql
security definer
set search_path = itera, public, auth
as $function$
declare
  v_provider   text;
  v_dfl_sub    text;
  v_email      text;
  v_name       text;
  v_avatar     text;
  v_user_id    uuid;
  v_tenant_id  uuid;
  v_is_plg     boolean;
  v_slug       text;
begin
  -- ===================== GUEST GUARD (migration 0026) =====================
  -- Only ever true for users minted by itera-api POST /v1/live/guest-session.
  -- Creates the itera.users + itera.identities rows the FKs and the RLS resolver
  -- need, then RETURNS — deliberately WITHOUT a tenant and WITHOUT a membership.
  -- That empty membership set IS the guest's security boundary.
  --
  -- ⚠️ WHY TWO SIGNALS, AND WHY THE EMAIL DOMAIN IS THE LOAD-BEARING ONE.
  -- Measured 2026-07-28 against this project: creating a user with
  -- `admin.createUser({email, app_metadata:{is_guest:true}})` DOES end up with
  -- `raw_app_meta_data = {"is_guest": true, "provider": "email", ...}` in the
  -- final row — but the AFTER INSERT trigger does NOT see it. GoTrue inserts the
  -- auth.users row first and merges custom app_metadata in a later statement, so
  -- at INSERT time `new.raw_app_meta_data->>'is_guest'` is NULL and a guard on it
  -- alone silently falls through to the PLG branch (verified: the guest still got
  -- `plg-<uid>:owner`). This is the same INSERT-time-snapshot trap that migration
  -- 0015 documented for `dfl_sub`.
  -- The EMAIL is part of the insert itself, so it is always visible here.
  -- `@guests.iterahq.dev` is a reserved domain that only the guest endpoint mints.
  -- Its failure mode is also the safe direction: anything landing in this branch
  -- gets NO access at all, never extra access.
  if coalesce(new.raw_app_meta_data->>'is_guest', 'false') = 'true'
     or new.email like '%@guests.iterahq.dev' then
    v_email  := new.email;
    v_name   := coalesce(
                  nullif(new.raw_user_meta_data->>'name', ''),
                  'Convidado'
                );
    v_avatar := new.raw_user_meta_data->>'avatar_url';

    insert into itera.users (email, display_name, avatar_url, locale, is_guest)
    values (v_email, v_name, v_avatar, 'pt', true)
    on conflict (email) do update
      set display_name = coalesce(excluded.display_name, itera.users.display_name),
          avatar_url   = coalesce(excluded.avatar_url, itera.users.avatar_url),
          is_guest     = true
    returning id into v_user_id;

    if v_user_id is null then
      select id into v_user_id from itera.users where email = v_email limit 1;
    end if;

    if v_user_id is not null then
      insert into itera.identities (user_id, provider, provider_subject)
      values (v_user_id, 'password'::itera.identity_provider, new.id::text)
      on conflict (provider, provider_subject) do nothing;
    end if;

    -- NO tenant. NO membership. NO PLG branch. This is the whole point.
    return new;
  end if;
  -- =================== END GUEST GUARD — body below is 0015 verbatim ===========

  -- Provider normalization. enum = dfl|google|oidc|password. Supabase labels a
  -- native email/password signup provider='email' -> map to 'password'.
  -- keycloak-slot (DFL IdP) logins map to 'dfl'. Google stays 'google'.
  -- Anything else unknown -> 'dfl'.
  v_provider := coalesce(new.raw_app_meta_data->>'provider', 'dfl');
  v_provider := case
    when v_provider in ('email','password') then 'password'
    when v_provider = 'keycloak' then 'dfl'
    when v_provider not in ('dfl','google','oidc','password') then 'dfl'
    else v_provider
  end;
  v_dfl_sub  := coalesce(new.raw_app_meta_data->>'dfl_sub', new.raw_user_meta_data->>'dfl_sub');
  v_email    := new.email;
  v_name     := coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(coalesce(v_email,''),'@',1));
  v_avatar   := coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture');

  -- A PLG self-serve signup = a native (password/google) login with NO DFL
  -- subject. These get a PERSONAL tenant so their subscription is isolated (the
  -- billing model is tenant-scoped). Federated/DFL users keep the shared pilot
  -- tenant. NOTE: this heuristic can FALSE-POSITIVE for a federated fellow whose
  -- dfl_sub is not yet on the auth row at INSERT time (see the header). The app
  -- layer (personal-tenant-aware affordances) is the authoritative guard; a
  -- personal `plg-<uid>` owner tenant confers NO professor/admin affordance.
  v_is_plg := (v_dfl_sub is null) and (v_provider in ('password','google'));

  -- 1. itera.users — idempotent on email (one Itera-local user per email).
  insert into itera.users (email, display_name, avatar_url, locale, dfl_subject)
  values (v_email, v_name, v_avatar, 'pt', v_dfl_sub)
  on conflict (email) do update
    set dfl_subject  = coalesce(itera.users.dfl_subject, excluded.dfl_subject),
        display_name = coalesce(excluded.display_name, itera.users.display_name),
        avatar_url   = coalesce(excluded.avatar_url, itera.users.avatar_url)
  returning id into v_user_id;

  if v_user_id is null then
    select id into v_user_id from itera.users where email = v_email limit 1;
  end if;

  -- 2. itera.identities — link the ITERA auth uid (NEW.id) so the RLS resolver
  --    itera.current_itera_user_id() (provider_subject = auth.uid()::text) finds it.
  insert into itera.identities (user_id, provider, provider_subject)
  values (v_user_id, v_provider::itera.identity_provider, new.id::text)
  on conflict (provider, provider_subject) do nothing;

  -- 3. Tenant + membership.
  if v_is_plg then
    -- Personal PLG tenant. Slug derived from the auth uid (stable, unique).
    v_slug := 'plg-' || left(replace(new.id::text, '-', ''), 12);
    select id into v_tenant_id from itera.tenants where slug = v_slug limit 1;
    if v_tenant_id is null then
      insert into itera.tenants (slug, name, branding)
      values (v_slug, coalesce(nullif(v_name,''), 'Conta pessoal'), '{}'::jsonb)
      on conflict (slug) do nothing
      returning id into v_tenant_id;
      if v_tenant_id is null then
        select id into v_tenant_id from itera.tenants where slug = v_slug limit 1;
      end if;
    end if;
    -- PLG user OWNS their personal tenant.
    if v_tenant_id is not null and v_user_id is not null then
      insert into itera.memberships (user_id, tenant_id, role)
      values (v_user_id, v_tenant_id, 'owner')
      on conflict (user_id, tenant_id) do nothing;
    end if;
  else
    -- Federated / pilot path: shared dfl-batch tenant as learner.
    select id into v_tenant_id from itera.tenants where slug = 'dfl-batch' limit 1;
    if v_tenant_id is null then
      select id into v_tenant_id from itera.tenants where slug = 'itera' limit 1;
    end if;
    if v_tenant_id is not null and v_user_id is not null then
      insert into itera.memberships (user_id, tenant_id, role)
      values (v_user_id, v_tenant_id, 'learner')
      on conflict (user_id, tenant_id) do nothing;
    end if;
  end if;

  return new;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 5. Close the world-readable tenant-list leak.
--
-- `tenants_select_public USING (true)` was the ONLY select policy on itera.tenants,
-- so ANY anonymous caller could list EVERY tenant — including the personal
-- `plg-<uid>` billing tenants, whose `name` is derived from the user's email
-- local-part. Measured 2026-07-28: 21 tenants readable anonymously, 18 of them
-- personal, named e.g. `samuelstefanodocarmo`, `oisabrinamoreira`, `lidyasouza90`.
-- That is a real-user PII leak that predates this plan.
--
-- The public read exists ON PURPOSE for white-label login: `useTenantBranding`
-- fetches `slug,name,branding` for the `?tenant=<slug>` on the login screen while
-- the caller is still ANONYMOUS. Breaking that to fix the leak would be a bad
-- trade, so we narrow rather than remove: real (white-label) tenants stay public,
-- personal `plg-%` billing containers stop being public. Nobody white-label-logs
-- into `plg-<uid>`.
--
-- A companion MEMBER policy is REQUIRED, not optional: `liveClass.service`
-- (`getEnabledTenantIds`, `hasLiveClassEnabledTenant`) reads the user's own
-- tenants by id to resolve `live_class_enabled`. Without this, a PLG user would
-- stop seeing their own tenant and instructor resolution would silently break.
-- ----------------------------------------------------------------------------
drop policy if exists tenants_select_public on itera.tenants;
create policy tenants_select_public on itera.tenants
  for select to public
  using (slug not like 'plg-%');

drop policy if exists tenants_select_member on itera.tenants;
create policy tenants_select_member on itera.tenants
  for select to authenticated
  using (id in (select itera.current_tenant_ids()));

comment on policy tenants_select_public on itera.tenants is
  'White-label login branding is public by design (useTenantBranding reads '
  'slug,name,branding anonymously for ?tenant=<slug>). Personal plg-% billing '
  'tenants are excluded (migration 0026) — their names are user email '
  'local-parts. Members still read their own tenant via tenants_select_member.';

-- ----------------------------------------------------------------------------
-- 6. Deprivilege the claude-main smoke account.
--
-- `itera-smoke@iterahq.dev` held `author` on `dfl-batch` — authoring rights on the
-- REAL DFL pilot tenant for an account whose whole purpose is unattended smoke
-- runs. Dropped here. Its `itera` tenant_admin membership is deliberately LEFT IN
-- PLACE (that is the house/demo tenant and smoke runs exercise admin surfaces);
-- whether to downgrade that too is a Question on the plan, not an agent call.
--
-- ROLLBACK (if a smoke run turns out to need it):
--   insert into itera.memberships (user_id, tenant_id, role)
--   select u.id, t.id, 'author' from itera.users u, itera.tenants t
--   where u.email='itera-smoke@iterahq.dev' and t.slug='dfl-batch'
--   on conflict (user_id, tenant_id) do nothing;
-- ----------------------------------------------------------------------------
delete from itera.memberships m
using itera.users u, itera.tenants t
where m.user_id = u.id
  and m.tenant_id = t.id
  and u.email = 'itera-smoke@iterahq.dev'
  and t.slug = 'dfl-batch'
  and m.role = 'author';

-- ----------------------------------------------------------------------------
-- 7. Make the guest grant EXPLICIT and independent of `scope`.
--
-- WHY THIS EXISTS (conflict found 2026-07-28, before merge): sections 1-6 rely on
-- the `scope='global' AND status='live'` leg of `class_sessions_select` (0013) and
-- `can_access_class_topic()` (0022) to admit a membership-less guest. Open PR #185
-- ("aula ao vivo nasce tenant-scoped") flips `startClassSession` /
-- `scheduleClassSession` to create sessions with `scope='tenant'` by default —
-- and it is RIGHT to: `scope='global'` means ANY authenticated user in the project
-- can see and join ANY live class, which is a real hole. But it removes exactly the
-- leg the guest was riding on, so the guest link would silently stop working for
-- every newly created class the day #185 merges.
--
-- Rather than ask for that fix to be reverted, the guest grant becomes what it
-- should have been from the start: a PER-SESSION grant, keyed on the
-- `itera.class_guests` row that the guest endpoint writes. This is strictly
-- tighter than the global-scope loophole (it names the one session) and it works
-- for tenant-scoped classes.
--
-- Additive: a NEW `or` leg that can only match a row in `class_guests`. A user who
-- is not a registered guest of that session is unaffected in every direction.
-- `realtime.messages` POLICIES ARE NOT TOUCHED — 0022/0023 own those; we only
-- extend the shared predicate FUNCTION they already call, so PR #188's control
-- topic keeps working regardless of merge order.
--
-- SECURITY DEFINER helper (not an inline subquery) so the policy does not recurse:
-- class_guests' own instructor policy selects from class_sessions.
-- ----------------------------------------------------------------------------
create or replace function itera.is_current_user_guest_of(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = itera, public
as $$
  select exists (
    select 1
    from itera.class_guests g
    where g.session_id = p_session_id
      and g.user_id = itera.current_itera_user_id()
  );
$$;

grant execute on function itera.is_current_user_guest_of(uuid) to authenticated;

comment on function itera.is_current_user_guest_of(uuid) is
  'True when the calling user holds a class_guests row for this session '
  '(migration 0026). The guest grant is per-session and does NOT depend on '
  'class_sessions.scope, so it survives classes becoming tenant-scoped.';

-- Session row: add the guest leg. First two legs are the 0013 original, verbatim.
drop policy if exists class_sessions_select on itera.class_sessions;
create policy class_sessions_select on itera.class_sessions
  for select
  using (
    (scope = 'global' and status = 'live')
    or tenant_id in (select itera.current_tenant_ids())
    or itera.is_current_user_guest_of(id)
  );

-- Realtime topic predicate: same third leg. Only the FUNCTION body changes; the
-- realtime.messages policies that call it are left exactly as 0022/0023 wrote them.
create or replace function itera.can_access_class_topic(topic_name text)
returns boolean
language sql
stable
security definer
set search_path = itera, public
as $$
  select exists (
    select 1
    from itera.class_sessions cs
    where cs.id::text = split_part(topic_name, ':', 2)
      and (
        (cs.scope = 'global' and cs.status = 'live')
        or cs.tenant_id in (select itera.current_tenant_ids())
        or itera.is_current_user_guest_of(cs.id)
      )
  );
$$;

grant execute on function itera.can_access_class_topic(text) to authenticated;
