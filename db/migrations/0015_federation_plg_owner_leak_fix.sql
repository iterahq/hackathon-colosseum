-- ============================================================================
-- Itera migration 0015 — fix the federated-learner PLG-owner affordance leak
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY. NOT DFL prod.
-- Plan: 20260619-itera-app-foundation / 20260624-itera-plg-subscribe-flow.
--
-- CONTEXT / BUG
-- -------------
-- `itera.handle_new_federated_user()` (AFTER INSERT on auth.users, trigger
-- `on_auth_user_created_provision_itera`) provisions a PERSONAL PLG tenant
-- (slug `plg-<uid>`) with an `owner` membership for self-serve signups, and a
-- `dfl-batch` learner membership for federated DFL fellows.
--
-- The branch is decided from `v_is_plg := (dfl_sub IS NULL) AND
-- (provider IN ('password','google'))`. BUT this trigger fires on the
-- auth.users INSERT — BEFORE the DFL federation code (itera-api
-- `POST /v1/embed/session`) attaches the `dfl` identity + dfl-batch membership.
-- itera-api creates a federated fellow via the admin API as a plain
-- `provider='email'` auth user with NO `dfl_sub` in raw_app_meta_data (the DFL
-- subject is written to itera.users.dfl_subject AFTERWARD). So at INSERT time a
-- federated fellow is INDISTINGUISHABLE from a genuine PLG signup, and the
-- trigger MIS-GRANTS federated fellows a personal `plg-<uid>` OWNER tenant.
--
-- Downstream, the player treated "owns ANY tenant" as tenant-admin → a federated
-- dfl-batch LEARNER saw the Admin link, the "Iniciar aula ao vivo" host button,
-- and a paywall bypass. (Confirmed: the orphaned `plg-*` tenants in this project
-- are named after federated / e2e users — taigfs+7, claude-e2e-*.)
--
-- FIX LAYERING (why this migration is the SECONDARY half)
-- -------------------------------------------------------
-- A trigger-only fix is IMPOSSIBLE: there is no reliable INSERT-time signal to
-- tell a federated fellow from a PLG signup (both look like `provider=email`,
-- no dfl_sub). The PRIMARY, durable fix is APP-SIDE (itera-player
-- src/services/membership.service.ts): every affordance resolver now IGNORES
-- personal `plg-<uid>` tenants, so owning a personal billing tenant confers no
-- admin/host/paywall-exempt affordance in another tenant. That closes the leak
-- regardless of the trigger.
--
-- THIS migration does two safe, versioned things:
--   1. Reconciles the committed trigger with the live DB. The repo's 0009 still
--      held the pre-PLG (learner-only) body while the live function had the PLG
--      branch — a schema drift. We re-assert the canonical branched body here so
--      db/migrations/ is the source of truth again. (Idempotent CREATE OR REPLACE;
--      matches live behaviour — no functional change.)
--   2. Idempotently STRIPS any leaked personal-`plg-*` OWNER membership from
--      FEDERATED users (users that hold a `dfl` identity). This codifies the
--      one-off manual cleanup (taigfs+7 and 7 others) into a repeatable rule:
--      a `dfl` identity is a RELIABLE post-hoc signal (it exists by the time the
--      federation exchange completes) — unlike anything available at INSERT time.
--      A genuine solo PLG user has NO `dfl` identity, so their owner membership is
--      PRESERVED.
--
-- FOLLOW-UP (different repo, tracked separately): have itera-api stamp
-- raw_app_meta_data.provider='dfl' (or dfl_sub) at admin.createUser() time for
-- federated fellows, so the trigger routes them correctly and stops creating
-- orphan `plg-*` tenants for them. Until then, (1) neutralizes the affordance
-- impact and (2) keeps existing leaks cleaned.
-- ============================================================================

-- 1. Canonical (branched) provisioning trigger — reconcile committed vs live.
create or replace function itera.handle_new_federated_user()
returns trigger
language plpgsql
security definer
set search_path = itera, public, auth
as $$
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
$$;

comment on function itera.handle_new_federated_user() is
  'AFTER INSERT trigger fn on auth.users: idempotently provisions itera.users + itera.identities + a default membership. PLG self-serve signups (native provider, no dfl_sub) get a personal plg-<uid> OWNER tenant; federated DFL fellows get a dfl-batch LEARNER membership. WARNING: the PLG branch can false-positive for a federated fellow whose dfl_sub is not yet on the auth row at INSERT time; the itera-player app layer (personal-tenant-aware affordances) is the authoritative guard — a personal plg-<uid> owner tenant confers NO professor/admin/paywall-exempt affordance. Migration 0015.';

drop trigger if exists on_auth_user_created_provision_itera on auth.users;
create trigger on_auth_user_created_provision_itera
  after insert on auth.users
  for each row execute function itera.handle_new_federated_user();

-- 2. Idempotent cleanup — strip leaked personal-`plg-*` OWNER memberships from
--    FEDERATED users (those holding a `dfl` identity). Reliable post-hoc signal;
--    genuine solo PLG users (no dfl identity) are UNTOUCHED. Codifies the manual
--    taigfs+7 cleanup as a repeatable rule.
delete from itera.memberships m
using itera.tenants t
where m.tenant_id = t.id
  and t.slug like 'plg-%'
  and m.role = 'owner'
  and exists (
    select 1 from itera.identities i
    where i.user_id = m.user_id
      and i.provider = 'dfl'::itera.identity_provider
  );
