-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Bounties posted and funded by any wallet.
--
-- * `bounties.origin`: `team` (posted by Itera's staff, funded from the Itera
--   treasury) or `wallet` (posted by a signed-in wallet, which funds the
--   escrow itself and is its refund address and its approver).
-- * `bounties.sponsor_wallet` / `approver_address`: the wallet of a `wallet`
--   bounty. `approver_address` null means the Itera treasury key approves.
-- * `bounties.slug_en`: the English address of a bounty page. Both slugs open
--   the same bounty.
-- * `bounties.hidden_*`: moderation by Itera's staff. A hidden bounty leaves
--   the public board; its money still obeys the escrow program alone.
-- * `bounties.delivery_mirror_url`: a copy of the delivered work hosted where
--   anyone can open it, shown instead of the link the learner sent.
-- * `itera.bounty_reports`: one report per learner per bounty.
--
-- Additive and idempotent.
-- ============================================================================

alter table itera.bounties
  add column if not exists origin text not null default 'team',
  add column if not exists sponsor_wallet text,
  add column if not exists approver_address text,
  add column if not exists slug_en text,
  add column if not exists source_lang text,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references itera.users(id) on delete set null,
  add column if not exists hidden_reason text,
  add column if not exists delivery_mirror_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bounties_origin_check') then
    alter table itera.bounties add constraint bounties_origin_check check (origin in ('team', 'wallet'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bounties_wallet_origin_check') then
    alter table itera.bounties add constraint bounties_wallet_origin_check
      check (origin = 'team' or (sponsor_wallet is not null and approver_address = sponsor_wallet and refund_address = sponsor_wallet));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bounties_slug_en_check') then
    alter table itera.bounties add constraint bounties_slug_en_check check (slug_en is null or slug_en ~ '^[a-z0-9][a-z0-9-]{2,62}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bounties_source_lang_check') then
    alter table itera.bounties add constraint bounties_source_lang_check check (source_lang is null or source_lang in ('pt', 'en'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bounties_hidden_reason_check') then
    alter table itera.bounties add constraint bounties_hidden_reason_check check (hidden_reason is null or length(hidden_reason) <= 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bounties_delivery_mirror_check') then
    alter table itera.bounties add constraint bounties_delivery_mirror_check
      check (delivery_mirror_url is null or (delivery_mirror_url like 'https://%' and length(delivery_mirror_url) <= 500));
  end if;
end;
$$;

create unique index if not exists bounties_slug_en_key on itera.bounties (slug_en) where slug_en is not null;
create index if not exists bounties_sponsor_wallet_idx on itera.bounties (sponsor_wallet, created_at desc) where sponsor_wallet is not null;

create table if not exists itera.bounty_reports (
  id          bigint generated always as identity primary key,
  bounty_id   uuid not null references itera.bounties(id) on delete restrict,
  reporter_id uuid not null references itera.users(id) on delete cascade,
  reason      text not null check (length(reason) between 3 and 300),
  created_at  timestamptz not null default now(),
  unique (bounty_id, reporter_id)
);

alter table itera.bounty_reports enable row level security;
revoke all on itera.bounty_reports from public, anon, authenticated;
grant all on itera.bounty_reports to service_role;

-- The tenant that holds bounties posted by wallets. It has no members: nobody's staff role reaches these rows
-- through `bounty-sponsor`; only the posting wallet does, through `bounty-post`.
insert into itera.tenants (slug, name)
select 'outside-sponsors', 'Outside sponsors'
where not exists (select 1 from itera.tenants where slug = 'outside-sponsors');

insert into itera.onchain_config (key, value)
select 'bounty_wallet_tenant', tenant.id::text from itera.tenants as tenant where tenant.slug = 'outside-sponsors'
on conflict (key) do nothing;
