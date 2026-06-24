-- ============================================================================
-- Itera migration 0009 — DFL-federation auto-provisioning trigger
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY. NOT DFL prod.
-- Plan: 20260619-itera-app-foundation (ADR-103 / ADR-4 federated IdP).
--
-- PROBLEM this solves: when a fellow signs in "with DFL" (Supabase-as-IdP,
-- "forma 1"), GoTrue creates an auth.users row in the ITERA project, but there
-- is NO itera.users / itera.identities / itera.memberships row — so
-- itera.current_itera_user_id() resolves NULL and the user is authenticated but
-- orphaned (no tenant, no progress, RLS denies everything).
--
-- FIX: an AFTER INSERT trigger on auth.users that idempotently provisions the
-- Itera-local user + identity + a default membership. Keyed on the ITERA auth
-- uid (NEW.id) for identities.provider_subject (matches the RLS resolver in
-- 0002_itera_rls.sql: provider_subject = auth.uid()::text). The opaque DFL uid
-- (app_metadata.dfl_sub, set by the federation exchange) is mirrored into
-- itera.users.dfl_subject for traceability (ADR-4 — NOT an FK to DFL).
--
-- Idempotent: re-running the migration replaces the function/trigger; the
-- function itself uses ON CONFLICT DO NOTHING so repeated logins are no-ops.
-- ============================================================================

-- Default tenant new federated learners join. The dfl-batch pilot tenant
-- (created in 0006) holds DFL fellows. If absent, fall back to 'itera'.
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
  v_user_id    uuid;
  v_tenant_id  uuid;
begin
  -- Only provision for federated/email identities we recognize. We accept any
  -- new auth user here (password signups also get an Itera-local user so the
  -- player works for them too); the provider label distinguishes them.
  -- itera.identity_provider enum = dfl|google|oidc|password. Supabase labels a
  -- federated (keycloak-slot) login 'keycloak'; map every DFL-IdP login onto
  -- 'dfl'. Password signups stay 'password'; Google stays 'google'.
  v_provider := coalesce(new.raw_app_meta_data->>'provider', 'dfl');
  v_provider := case
    when v_provider = 'keycloak' then 'dfl'
    when v_provider not in ('dfl','google','oidc','password') then 'dfl'
    else v_provider
  end;
  v_dfl_sub  := coalesce(new.raw_app_meta_data->>'dfl_sub', new.raw_user_meta_data->>'dfl_sub');
  v_email    := new.email;
  v_name     := coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(coalesce(v_email,''),'@',1));

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

  -- 3. Default membership in the dfl-batch pilot tenant as a learner.
  select id into v_tenant_id from itera.tenants where slug = 'dfl-batch' limit 1;
  if v_tenant_id is null then
    select id into v_tenant_id from itera.tenants where slug = 'itera' limit 1;
  end if;

  if v_tenant_id is not null and v_user_id is not null then
    insert into itera.memberships (user_id, tenant_id, role)
    values (v_user_id, v_tenant_id, 'learner')
    on conflict (user_id, tenant_id) do nothing;
  end if;

  return new;
end;
$$;

comment on function itera.handle_new_federated_user() is
  'AFTER INSERT trigger fn on auth.users: idempotently provisions itera.users + itera.identities (provider_subject = the ITERA auth uid, matching the RLS resolver) + a default dfl-batch learner membership. Enables "Sign in with DFL" (forma 1, ADR-103) — a federated fellow lands fully provisioned, not orphaned.';

drop trigger if exists on_auth_user_created_provision_itera on auth.users;
create trigger on_auth_user_created_provision_itera
  after insert on auth.users
  for each row execute function itera.handle_new_federated_user();

-- Backfill: provision any EXISTING auth.users that lack an Itera identity
-- (e.g. users created before this trigger, including the federation smoke user).
insert into itera.users (email, display_name, locale, dfl_subject)
select au.email,
       coalesce(au.raw_user_meta_data->>'name', split_part(au.email,'@',1)),
       'pt',
       coalesce(au.raw_app_meta_data->>'dfl_sub', au.raw_user_meta_data->>'dfl_sub')
from auth.users au
where au.email is not null
  and not exists (select 1 from itera.identities i where i.provider_subject = au.id::text)
on conflict (email) do nothing;

insert into itera.identities (user_id, provider, provider_subject)
select u.id,
       (case
          when coalesce(au.raw_app_meta_data->>'provider','dfl') = 'keycloak' then 'dfl'
          when coalesce(au.raw_app_meta_data->>'provider','dfl') not in ('dfl','google','oidc','password') then 'dfl'
          else coalesce(au.raw_app_meta_data->>'provider','dfl')
        end)::itera.identity_provider,
       au.id::text
from auth.users au
join itera.users u on u.email = au.email
where au.email is not null
  and not exists (select 1 from itera.identities i where i.provider_subject = au.id::text)
on conflict (provider, provider_subject) do nothing;

insert into itera.memberships (user_id, tenant_id, role)
select u.id, t.id, 'learner'
from auth.users au
join itera.users u on u.email = au.email
cross join lateral (
  select id from itera.tenants where slug = 'dfl-batch'
  union all select id from itera.tenants where slug = 'itera'
  limit 1
) t
where au.email is not null
on conflict (user_id, tenant_id) do nothing;
