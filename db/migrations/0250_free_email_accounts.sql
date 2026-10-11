-- 0250: free e-mail accounts on the hackathon build.
--
-- A self-serve e-mail sign-up used to get a personal `plg-<uid>` tenant and land on the Stripe paywall
-- (migrations 0015 / 0075). The hackathon build is free: every account that is not a guest and not a
-- linked wallet joins the shared `dfl-batch` tenant as a learner, exactly like a wallet sign-in does.
-- Body copied from the live `itera.handle_new_federated_user` (0111 + 0141 + 0160 on top of 0026/0015);
-- the only change is the `v_is_plg` line. Accounts created before this file that only hold a personal
-- tenant get the same membership (additive; the personal tenants stay).
-- Undo: restore the previous function body (`v_is_plg := (v_dfl_sub is null) and (v_provider in
-- ('password','google'));`) and delete the backfilled `dfl-batch` learner memberships.

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
  v_is_wallet  boolean;
  v_wallet     text;
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

  -- ===================== WALLET SIGN-IN (hackathon, 0111) =====================
  -- A Sign in with Solana user has NO email, and `itera.users.email` is NOT
  -- NULL: without this branch the insert below raises 23502 and GoTrue answers
  -- the wallet sign-in with HTTP 500 (measured 2026-10-09). The missing email is
  -- the load-bearing signal, for the same INSERT-time-snapshot reason the guest
  -- guard documents: the provider label may not be on the row yet.
  v_is_wallet := new.email is null
                 or coalesce(new.raw_app_meta_data->>'provider', '') = 'web3';
  v_wallet := coalesce(
                nullif(new.raw_user_meta_data->'custom_claims'->>'address', ''),
                nullif(split_part(coalesce(new.raw_user_meta_data->>'sub', ''), ':', 3), '')
              );
  if v_is_wallet then
    v_provider := 'solana';
  end if;
  -- ============================ END WALLET SIGN-IN ============================

  -- ================== LINKED WALLET SIGNS IN (hackathon, 0141) ==================
  -- An e-mail learner linked this wallet (`itera.user_wallets`, written only
  -- after an ed25519 signature by the wallet was verified). The wallet now signs
  -- in on its own: it is the SAME learner. The new auth user becomes one more
  -- identity of that learner and nothing else is created: no second
  -- `itera.users` row, no tenant, no membership. Without this the wallet got a
  -- second learner and its gifts, mints and profile split between the two.
  if v_is_wallet and v_wallet is not null then
    select uw.user_id into v_user_id from itera.user_wallets uw where uw.wallet = v_wallet limit 1;
    if v_user_id is not null then
      insert into itera.identities (user_id, provider, provider_subject)
      values (v_user_id, 'solana'::itera.identity_provider, new.id::text)
      on conflict (provider, provider_subject) do nothing;
      return new;
    end if;
  end if;
  -- ========================= END LINKED WALLET SIGNS IN =========================
  v_dfl_sub  := coalesce(new.raw_app_meta_data->>'dfl_sub', new.raw_user_meta_data->>'dfl_sub');
  -- Wallet users get a synthetic, non-routable address keyed by the auth uid.
  v_email    := coalesce(new.email, 'wallet-' || new.id::text || '@wallets.hackathon.invalid');
  v_name     := coalesce(
                  new.raw_user_meta_data->>'name',
                  new.raw_user_meta_data->>'full_name',
                  case when v_is_wallet and v_wallet is not null
                       then itera.friendly_wallet_name(v_wallet) end, -- 0160: was the shortened address
                  case when v_is_wallet then 'Wallet ' || left(new.id::text, 6) end,
                  split_part(coalesce(v_email,''),'@',1)
                );
  v_avatar   := coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture');

  -- A PLG self-serve signup = a native (password/google) login with NO DFL
  -- subject. These get a PERSONAL tenant so their subscription is isolated (the
  -- billing model is tenant-scoped). Federated/DFL users keep the shared pilot
  -- tenant. NOTE: this heuristic can FALSE-POSITIVE for a federated fellow whose
  -- dfl_sub is not yet on the auth row at INSERT time (see the header). The app
  -- layer (personal-tenant-aware affordances) is the authoritative guard; a
  -- personal `plg-<uid>` owner tenant confers NO professor/admin affordance.
  -- 0250: the hackathon build is free; no personal tenant, no paywall.
  v_is_plg := false;

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
$function$
;

insert into itera.memberships (user_id, tenant_id, role)
select distinct m.user_id, dfl.id, 'learner'::itera.member_role
  from itera.memberships m
  join itera.tenants t on t.id = m.tenant_id and t.slug like 'plg-%'
  join itera.tenants dfl on dfl.slug = 'dfl-batch'
 where not exists (
   select 1 from itera.memberships m2
    join itera.tenants t2 on t2.id = m2.tenant_id
   where m2.user_id = m.user_id and t2.slug not like 'plg-%'
 )
on conflict (user_id, tenant_id) do nothing;
