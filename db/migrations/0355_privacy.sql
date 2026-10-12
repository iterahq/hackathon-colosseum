-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Privacy: the public profile is a choice, and a contact is for companies only.
--
-- * `itera.profile_settings`: the learner's own answer to "show my profile page
--   to others". No row = no choice made: an account that existed before
--   `onchain_config.profile_private_from` (the moment this file ran) stays
--   visible, an account created after it is private until it chooses. No
--   existing account is touched and no row is written for anyone here.
-- * `itera.talent_contacts`: the contact of a learner WHILE listed on the
--   talent board. One row per listing, deleted with it (`on delete cascade`):
--   leaving the board deletes the contact, it does not hide it.
-- * `itera.talent_contact_reveals`: who was shown whose contact, and when. It
--   holds no contact.
--
-- PERSONAL DATA. The three tables have RLS on and NO policy; every privilege of
-- `public`, `anon` and `authenticated` is revoked. Only the service role (the
-- edge functions) reads or writes them. They are in no view. Idempotent.
--
-- Undo: drop the three tables and
--   delete from itera.onchain_config where key = 'profile_private_from';
-- ============================================================================

create table if not exists itera.profile_settings (
  user_id uuid primary key references itera.users(id) on delete cascade,
  public_profile boolean not null,
  updated_at timestamptz not null default now()
);
alter table itera.profile_settings enable row level security;
revoke all on itera.profile_settings from public, anon, authenticated;
grant select, insert, update on itera.profile_settings to service_role;

insert into itera.onchain_config (key, value)
values ('profile_private_from', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
on conflict (key) do nothing;

create table if not exists itera.talent_contacts (
  user_id uuid primary key references itera.talent_listings(user_id) on delete cascade,
  email text check (email is null or char_length(email) <= 120),
  telegram text check (telegram is null or char_length(telegram) <= 32),
  linkedin text check (linkedin is null or char_length(linkedin) <= 120),
  link text check (link is null or char_length(link) <= 200),
  updated_at timestamptz not null default now(),
  constraint talent_contacts_one_at_least check (num_nonnulls(email, telegram, linkedin, link) >= 1)
);
alter table itera.talent_contacts enable row level security;
revoke all on itera.talent_contacts from public, anon, authenticated;
grant select, insert, update, delete on itera.talent_contacts to service_role;

create table if not exists itera.talent_contact_reveals (
  id uuid primary key default gen_random_uuid(),
  company_user_id uuid not null references itera.users(id) on delete cascade,
  learner_user_id uuid not null references itera.users(id) on delete cascade,
  via text not null check (via in ('funded_bounty', 'tenant_staff')),
  revealed_at timestamptz not null default now()
);
create index if not exists talent_contact_reveals_company_idx on itera.talent_contact_reveals (company_user_id, revealed_at desc);
create index if not exists talent_contact_reveals_learner_idx on itera.talent_contact_reveals (learner_user_id);
alter table itera.talent_contact_reveals enable row level security;
revoke all on itera.talent_contact_reveals from public, anon, authenticated;
grant select, insert on itera.talent_contact_reveals to service_role;
