-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Credentials: permanent copies on Arweave.
--
-- A certification's facts live in its asset account on Solana. Its picture, its
-- metadata JSON and the evidence documents behind its claims are served by Itera
-- and would vanish with it. `credential-archive` uploads each of them to Arweave
-- as a data item signed by the mint authority (the update authority of the
-- collection, so the signer of a copy can be checked against the chain) and
-- tagged with the asset address.
--
-- `itera.credential_archives` is the INDEX of those uploads, one row per
-- distinct content of an asset. It decides nothing: a copy is found on Arweave
-- by its tags and proven by its signer and its hash, without this table.
--
-- `onchain_config.credential_archive = 'on'` lets the function upload. Without
-- the key it only lists what exists.
--
-- Not readable by `anon` or `authenticated`: the edge function is the only reader.
-- Additive and idempotent. Undo: delete the config key (uploads stop; copies
-- already on Arweave cannot be removed, by design).
-- ============================================================================

create table if not exists itera.credential_archives (
  id            bigint generated always as identity primary key,
  asset_address text not null check (asset_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  kind          text not null check (kind in ('metadata', 'image', 'evidence')),
  ref           text not null default '' check (ref ~ '^[a-z0-9-]{0,24}$'),
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  arweave_id    text not null check (arweave_id ~ '^[A-Za-z0-9_-]{43}$'),
  bytes         integer not null check (bytes > 0),
  signer        text not null,
  created_at    timestamptz not null default now(),
  unique (asset_address, kind, ref, sha256)
);

create index if not exists credential_archives_asset_idx on itera.credential_archives (asset_address, created_at desc);

alter table itera.credential_archives enable row level security;
revoke all on itera.credential_archives from public, anon, authenticated;
grant all on itera.credential_archives to service_role;

insert into itera.onchain_config (key, value)
values ('credential_archive', 'on')
on conflict (key) do nothing;
