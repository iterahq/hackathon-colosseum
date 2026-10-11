-- 0270: a server-side cache of the public chain-read answers (credential-verify, learner-profile).
-- One row per key. `version` is what the database knew about that wallet's on-chain writes when the
-- body was read (itera.chain_version), so a new stamp, claim, endorsement, mint, purchase or
-- companion change misses the cache at once; a reader may also ask for a fresh read (`?fresh=1`).
-- Service role only: RLS on, no policy. Additive and idempotent.

create table if not exists itera.read_cache (
  key      text primary key,
  version  text not null,
  body     jsonb not null,
  read_at  timestamptz not null default now(),
  read_ms  integer not null default 0
);

alter table itera.read_cache enable row level security;
revoke all on itera.read_cache from anon, authenticated;
grant all on itera.read_cache to service_role;

-- Everything the database knows that changes what the chain says about a wallet, in one string.
create or replace function itera.chain_version(p_wallet text)
returns text
language sql
stable
set search_path = ''
as $$
  select concat_ws('|',
    (select coalesce(max(minted_at)::text, '-') || ':' || count(*) from itera.user_achievements where wallet_address = p_wallet),
    (select coalesce(max(coalesce(written_at, proven_at))::text, '-') || ':' || count(*) from itera.claim_proofs where wallet = p_wallet),
    (select coalesce(max(e.created_at)::text, '-') || ':' || count(*)
       from itera.endorsements e join itera.user_achievements ua on ua.id = e.user_achievement_id
      where ua.wallet_address = p_wallet),
    (select coalesce(string_agg(concat_ws(':', version, mirrored_at, updated_at, avatar, outfit, lives, max_lives), ','), '-')
       from itera.companions where wallet_address = p_wallet),
    (select coalesce(max(minted_at)::text, '-') || ':' || count(*) from itera.avatar_assets where wallet = p_wallet),
    (select coalesce(max(coalesce(applied_at, paid_at, created_at))::text, '-') || ':' || count(*) from itera.purchases where wallet = p_wallet)
  );
$$;

-- The same, for one asset: the wallet that holds it is looked up first. 'none' for an asset we never issued.
create or replace function itera.chain_version_of_asset(p_asset text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select itera.chain_version(s.w)
      from (
        select wallet_address as w from itera.user_achievements where asset_address = p_asset
        union select wallet_address from itera.companions where asset_address = p_asset
        union select wallet from itera.avatar_assets where asset_address = p_asset
      ) s
     where s.w is not null
     limit 1
  ), 'none');
$$;

-- One upsert per live read; idle rows are swept by the writes themselves.
create or replace function itera.read_cache_put(p_key text, p_version text, p_body jsonb, p_read_ms integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into itera.read_cache (key, version, body, read_at, read_ms)
  values (p_key, p_version, p_body, clock_timestamp(), p_read_ms)
  on conflict (key) do update
    set version = excluded.version, body = excluded.body, read_at = excluded.read_at, read_ms = excluded.read_ms;
  if random() < 0.01 then
    delete from itera.read_cache where read_at < clock_timestamp() - interval '2 days';
  end if;
end;
$$;

revoke all on function itera.chain_version(text) from public, anon, authenticated;
revoke all on function itera.chain_version_of_asset(text) from public, anon, authenticated;
revoke all on function itera.read_cache_put(text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function itera.chain_version(text) to service_role;
grant execute on function itera.chain_version_of_asset(text) to service_role;
grant execute on function itera.read_cache_put(text, text, jsonb, integer) to service_role;
