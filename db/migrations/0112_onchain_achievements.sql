-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- On-chain achievements: a catalog of templates and the rows a learner earned.
--
-- `itera.achievements` is the catalog (one row per template, e.g. a completed
-- day or a completed trail). `itera.user_achievements` is what a learner earned;
-- `ref_id` scopes a template to a unit (trail) or a lesson (day), and the mint
-- columns track the Solana asset once it exists.
--
-- Awarding and minting live in TypeScript (edge function, service role). The
-- database only stores: clients read, nobody but the service role writes.
-- Idempotent.
-- ============================================================================

create table if not exists itera.achievements (
  key              text primary key,
  kind             text not null check (kind in ('day', 'trail', 'streak', 'milestone')),
  tier             text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold')),
  title_i18n       jsonb not null default '{}'::jsonb,
  description_i18n jsonb not null default '{}'::jsonb,
  art              jsonb not null default '{}'::jsonb,
  sort             int not null default 0
);

create table if not exists itera.user_achievements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references itera.users(id) on delete cascade,
  achievement_key text not null references itera.achievements(key) on delete cascade,
  -- unit id for a trail-scoped row, lesson id for a day-scoped row, the zero
  -- uuid for a global one, so the unique key below needs no NULL handling.
  ref_id          uuid not null default '00000000-0000-0000-0000-000000000000',
  state           jsonb not null default '{}'::jsonb,
  earned_at       timestamptz not null default now(),
  mint_status     text not null default 'unclaimed'
                    check (mint_status in ('unclaimed', 'pending', 'minted', 'failed')),
  wallet_address  text,
  asset_address   text,
  tx_signature    text,
  minted_at       timestamptz,
  unique (user_id, achievement_key, ref_id)
);

create index if not exists user_achievements_user_idx on itera.user_achievements (user_id);
create index if not exists user_achievements_asset_idx on itera.user_achievements (asset_address);

alter table itera.achievements enable row level security;
alter table itera.user_achievements enable row level security;

drop policy if exists achievements_read_all on itera.achievements;
create policy achievements_read_all on itera.achievements
  for select to anon, authenticated using (true);

drop policy if exists user_achievements_read_own on itera.user_achievements;
create policy user_achievements_read_own on itera.user_achievements
  for select to authenticated using (user_id = itera.current_itera_user_id());

revoke all on itera.achievements, itera.user_achievements from anon, authenticated;
grant select on itera.achievements to anon, authenticated;
grant select on itera.user_achievements to authenticated;
grant all on itera.achievements, itera.user_achievements to service_role;
