-- ============================================================================
-- Itera migration 0010 — itera.users.avatar_url (DFL profile picture mirror)
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY. NOT DFL prod.
-- Plan: 20260619-itera-fellowship-e2e-integration (profile-sync on federated login).
--
-- WHY: "Sign in with DFL" federation now provisions the Itera user, but did NOT
-- pull the fellow's DFL profile picture. Tainan: "não puxou todos dados do meu
-- user lá da DFL … profile picture, nome/sobrenome e email é suficiente".
--   - email      → already stored (itera.users.email).
--   - name       → already stored (itera.users.display_name).
--   - avatar     → THIS migration adds itera.users.avatar_url.
--
-- The itera-api /v1/embed/session route is the authoritative writer: on every
-- federated login it reads DFL public.profiles (canonical name + USER-UPLOADED
-- avatar, via the fellow's own token / RLS self-read) and upserts display_name +
-- avatar_url (refresh-on-conflict so a changed DFL photo/name propagates).
-- We ALSO teach the DB-side auto-provision trigger (0009) to seed avatar_url from
-- the auth metadata on first insert, so the avatar shows even on the very first
-- login before the route's REST enrichment runs.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
-- ============================================================================

-- 1) The new column. Nullable text URL (DFL avatars are public storage URLs).
alter table itera.users
  add column if not exists avatar_url text;

comment on column itera.users.avatar_url is
  'DFL profile picture URL, mirrored on federated login from DFL public.profiles.avatar_url (user-uploaded), JWT user_metadata.avatar_url/picture fallback. Refreshed on every login by the itera-api /v1/embed/session route.';

-- 2) Re-define the auto-provision trigger fn to ALSO seed avatar_url from the
--    auth user metadata on first insert (best-effort; the route refreshes it
--    with the canonical DFL profiles avatar). Refresh display_name + avatar_url
--    on conflict ONLY when the incoming value is non-null (never clobber a good
--    value with a blank), matching the route's COALESCE-refresh semantics.
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
begin
  v_provider := coalesce(new.raw_app_meta_data->>'provider', 'dfl');
  v_provider := case
    when v_provider = 'keycloak' then 'dfl'
    when v_provider not in ('dfl','google','oidc','password') then 'dfl'
    else v_provider
  end;
  v_dfl_sub  := coalesce(new.raw_app_meta_data->>'dfl_sub', new.raw_user_meta_data->>'dfl_sub');
  v_email    := new.email;
  v_name     := coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(coalesce(v_email,''),'@',1));
  v_avatar   := coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture');

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

  -- 2. itera.identities — link the ITERA auth uid (NEW.id) for the RLS resolver.
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

-- 3) Backfill avatar_url for existing federated users from their auth metadata
--    (best-effort; the route will refresh with the canonical DFL profiles avatar
--    on their next login). Only fill rows that currently have no avatar.
update itera.users u
set avatar_url = coalesce(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture')
from auth.users au
where au.email = u.email
  and u.avatar_url is null
  and coalesce(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture') is not null;
