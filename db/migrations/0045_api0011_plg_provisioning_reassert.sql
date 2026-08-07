-- ============================================================================
-- CONSOLIDATED FROM `iterahq/itera-api` — original path `migrations/0011_plg_provisioning_reassert.sql`.
-- Moved here 2026-08-04. Renumbered 0011 -> 0045.
--
-- Tainan, TG 2026-08-04: *"deleta /migrations nesses dois repos e não permite
-- mais criar via CI check"*. `itera-player` is now the SINGLE owner of the Itera
-- schema; `itera-api` and `itera-mcp` no longer carry a `migrations/` directory
-- and a CI guard in each fails if one reappears. This file exists so the DDL
-- behind live production objects keeps a home in a repository — deleting it
-- outright would have destroyed the provenance of objects that are still there.
--
-- ⚠️ ALREADY APPLIED BEFORE CONSOLIDATION — merging it applies NOTHING.
-- It was applied to the Itera database (kjefmwlopzeaqgqtlbdn) by hand out of
-- `itera-api` around 2026-06-25, long before it arrived here. Every object it
-- creates was confirmed present by a read-only SELECT on 2026-08-04, and it is
-- recorded in `itera.schema_migrations` as applied WITHOUT being executed, via
-- `db/scripts/apply-migrations.sh baseline-add`. Do NOT "re-apply" it.
--
-- The new number is the order in which it was ACTUALLY applied, which is also
-- its dependency order — the old numbers could not be: itera-api's 0003 landed
-- after its 0010/0011, and itera-mcp's 0002 must precede itera-api's 0012, which
-- calls itera.current_author_tenant_ids(). Three independent 00NN sequences
-- against one database is exactly the collision this consolidation ends.
--
-- THE SQL BELOW IS BYTE-FOR-BYTE THE ORIGINAL. Nothing was edited — an edited
-- migration and a live database that disagree is the failure this file guards.
-- ============================================================================

-- ============================================================================
-- Itera PLG provisioning — RE-ASSERT the personal-tenant trigger + self-test
-- Plan: 20260624-itera-plg-subscribe-flow (Phase 1 fix) ·
--       20260625-iterahq-loop-engineering-quality (round-1 HARD blocker)
--
-- WHY THIS EXISTS
-- ---------------
-- The PLG trigger from 0010_plg_subscribe_flow.sql was NOT live: production's
-- itera.handle_new_federated_user() was still the federation-only version
-- (every new self-serve signup got only a `learner` membership in the shared
-- `dfl-batch` tenant, NO personal tenant). So `/plg/checkout` →
-- resolvePlgIdentity() found no owner/tenant_admin membership and threw
-- "no personal tenant for this user (provisioning pending)" — Stripe checkout
-- never opened. (The 0010 VIEW had been applied; the 0010 TRIGGER had not.)
--
-- This migration re-asserts the trigger body (identical semantics to 0010) and
-- adds an INLINE, TRANSACTIONAL SELF-TEST so a fresh PLG signup is proven to
-- get an `owner` membership in a `plg-<uid>` tenant. Idempotent + safe to
-- re-run. Itera project (kjefmwlopzeaqgqtlbdn) — ours.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Provisioning trigger — personal tenant for PLG signups (re-assert)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION itera.handle_new_federated_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'itera', 'public', 'auth'
AS $function$
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
  -- subject. These get a PERSONAL tenant so their Stripe subscription is
  -- isolated (the billing model is tenant-scoped). Federated/DFL users keep
  -- the shared pilot tenant.
  v_is_plg := (v_dfl_sub is null) and (v_provider in ('password','google'));

  -- 1. itera.users — idempotent on email (one Itera-local user per email).
  --    Refresh display_name + avatar_url from the incoming metadata when present.
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
    -- Reuse an already-provisioned personal tenant if the user re-enters
    -- (idempotent on slug).
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
    -- Federated / pilot path (UNCHANGED): shared dfl-batch tenant as learner.
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

-- ---------------------------------------------------------------------------
-- 2. INLINE SELF-TEST — prove a fresh PLG signup is provisioned correctly.
--    Runs in this migration's transaction and ROLLS BACK its own fixtures via
--    an exception-guarded block; raises if the contract is violated so a bad
--    re-application can never land silently.
-- ---------------------------------------------------------------------------
DO $selftest$
declare
  v_uid    uuid := gen_random_uuid();
  v_email  text := 'selftest-plg-' || replace(v_uid::text,'-','') || '@example.invalid';
  v_role   text;
  v_slug   text;
  v_uid_user uuid;
begin
  -- Directly exercise the trigger via a synthetic auth.users insert.
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated','authenticated',
          v_email, '{"provider":"email"}'::jsonb, '{"name":"Self Test"}'::jsonb, now(), now());

  -- Assert: the resolver query used by resolvePlgIdentity() finds an owner
  -- membership in a plg-<uid> tenant.
  select m.role, t.slug, u.id
    into v_role, v_slug, v_uid_user
    from itera.identities i
    join itera.users u       on u.id = i.user_id
    join itera.memberships m on m.user_id = u.id
    join itera.tenants t     on t.id = m.tenant_id
   where i.provider_subject = v_uid::text
     and m.role in ('owner','tenant_admin')
   order by m.created_at asc
   limit 1;

  if v_role is null then
    raise exception 'PLG provisioning self-test FAILED: no owner/tenant_admin membership for a fresh native signup';
  end if;
  if v_slug is null or v_slug not like 'plg-%' then
    raise exception 'PLG provisioning self-test FAILED: expected a plg-* personal tenant, got slug=%', v_slug;
  end if;

  -- Clean up the synthetic fixtures (do not pollute prod).
  delete from itera.memberships where user_id = v_uid_user;
  delete from itera.identities  where provider_subject = v_uid::text;
  delete from itera.tenants     where slug = v_slug;
  delete from itera.users       where id = v_uid_user;
  delete from auth.users        where id = v_uid;

  raise notice 'PLG provisioning self-test PASSED: role=% tenant=%', v_role, v_slug;
end;
$selftest$;
