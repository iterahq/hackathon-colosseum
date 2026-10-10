-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- An e-mail account binds ONE Solana wallet by signing a message.
--
-- * `itera.user_wallets`: the linked wallet of a learner who has no web3
--   identity. One wallet per learner, one learner per wallet. Written only by
--   the `link-wallet` edge function after it verified an ed25519 signature.
-- * `itera.wallet_link_challenges`: the message a wallet is asked to sign.
--   Single use, five minutes.
-- * `itera.wallet_identity_user(address)`: the itera user who signs in with
--   that wallet, so a wallet that is already an account cannot be linked to
--   another. It reads `auth.identities`, which the API does not expose.
--
-- Clients read their own `user_wallets` row and nothing else; the service role
-- writes. Idempotent.
-- ============================================================================

create table if not exists itera.user_wallets (
  user_id   uuid primary key references itera.users(id) on delete cascade,
  wallet    text not null unique check (char_length(wallet) between 32 and 44),
  linked_at timestamptz not null default now()
);

create table if not exists itera.wallet_link_challenges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references itera.users(id) on delete cascade,
  wallet     text not null check (char_length(wallet) between 32 and 44),
  nonce      text not null,
  message    text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists wallet_link_challenges_user_idx on itera.wallet_link_challenges (user_id);

alter table itera.user_wallets enable row level security;
alter table itera.wallet_link_challenges enable row level security;

drop policy if exists user_wallets_read_own on itera.user_wallets;
create policy user_wallets_read_own on itera.user_wallets
  for select to authenticated using (user_id = itera.current_itera_user_id());

revoke all on itera.user_wallets, itera.wallet_link_challenges from anon, authenticated;
grant select on itera.user_wallets to authenticated;
grant all on itera.user_wallets, itera.wallet_link_challenges to service_role;

create or replace function itera.wallet_identity_user(p_address text)
returns uuid
language sql
stable
security definer
set search_path = itera, auth, public
as $function$
  select i.user_id
  from auth.identities a
  join itera.identities i on i.provider_subject = a.user_id::text
  where a.provider = 'web3' and a.provider_id = 'web3:solana:' || p_address
  limit 1;
$function$;

revoke all on function itera.wallet_identity_user(text) from public, anon, authenticated;
grant execute on function itera.wallet_identity_user(text) to service_role;
