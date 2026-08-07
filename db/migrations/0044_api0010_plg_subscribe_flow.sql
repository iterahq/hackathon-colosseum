-- ============================================================================
-- CONSOLIDATED FROM `iterahq/itera-api` — original path `migrations/0010_plg_subscribe_flow.sql`.
-- Moved here 2026-08-04. Renumbered 0010 -> 0044.
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
-- `itera-api` around 2026-06-24, long before it arrived here. Every object it
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
-- Itera PLG self-serve subscription flow — DB layer
-- Plan: 20260624-itera-plg-subscribe-flow  (Phase 1)
--
-- 1. Extend the existing auth.users provisioning trigger so a NATIVE PLG signup
--    (password/google, NO dfl_sub) gets its OWN personal tenant + owner
--    membership (subscriptions are tenant-scoped). Federated/DFL signups keep
--    the shared dfl-batch behavior unchanged.
-- 2. Add itera.my_subscription — a caller-scoped gating view over billing.*
--    (which is NOT REST-exposed). The player reads THIS, never billing.* .
--
-- Idempotent + safe to re-run. Itera project (kjefmwlopzeaqgqtlbdn) — ours.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Provisioning trigger — personal tenant for PLG signups
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
  v_user_id    uuid;
  v_tenant_id  uuid;
  v_is_plg     boolean;
  v_slug       text;
begin
  -- Provider normalization:
  -- enum = dfl|google|oidc|password. Supabase labels a native email/password
  -- signup provider='email' -> map to 'password'. keycloak-slot (DFL IdP) logins
  -- map to 'dfl'. Google stays 'google'. Anything else unknown -> 'dfl'.
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

  -- A PLG self-serve signup = a native (password/google) login with NO DFL
  -- subject. These get a PERSONAL tenant so their Stripe subscription is
  -- isolated (the billing model is tenant-scoped). Federated/DFL users keep
  -- the shared pilot tenant.
  v_is_plg := (v_dfl_sub is null) and (v_provider in ('password','google'));

  -- 1. itera.users — idempotent on email (one Itera-local user per email).
  insert into itera.users (email, display_name, locale, dfl_subject)
  values (v_email, v_name, 'pt', v_dfl_sub)
  on conflict (email) do update
    set dfl_subject = coalesce(itera.users.dfl_subject, excluded.dfl_subject),
        display_name = coalesce(itera.users.display_name, excluded.display_name)
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
    -- Federated / pilot path (unchanged): shared dfl-batch tenant as learner.
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
-- 2. itera.my_subscription — caller-scoped gating view
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER semantics: the view runs with the OWNER's rights so it can
-- read the private billing.* schema, but its body filters to the CALLER's own
-- tenant(s) via itera.current_itera_user_id() — so it never leaks another
-- user's subscription. The player queries this from the REST-exposed `itera`
-- schema with the user's anon-key + session JWT.
--
-- security_invoker is intentionally OFF (default) so the view reads billing.*
-- with definer rights; the WHERE clause is the authorization boundary.
DROP VIEW IF EXISTS itera.my_subscription;
CREATE VIEW itera.my_subscription
WITH (security_invoker = false)
AS
SELECT
  s.tenant_id,
  s.status,
  s.seat_count,
  s.current_period_end,
  s.cancel_at_period_end,
  (s.status IN ('active','trialing')) AS is_active
FROM billing.subscriptions s
WHERE s.tenant_id IN (
  SELECT m.tenant_id
  FROM itera.memberships m
  WHERE m.user_id = itera.current_itera_user_id()
)
AND s.status NOT IN ('canceled','incomplete_expired');

COMMENT ON VIEW itera.my_subscription IS
  'PLG gating: the calling user''s subscription status, scoped via itera.current_itera_user_id() over their tenant memberships. Reads private billing.* with definer rights; the WHERE clause is the authz boundary. Player reads this (REST-exposed itera schema); never billing.* directly. Plan 20260624-itera-plg-subscribe-flow.';

-- Expose to the authenticated role (anon gets nothing — gating needs a session).
GRANT SELECT ON itera.my_subscription TO authenticated;
