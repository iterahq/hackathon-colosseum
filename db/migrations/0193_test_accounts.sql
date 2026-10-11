-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Which accounts are the team's tests, so a public number can say the truth.
--
-- This project is a copy made for the hackathon: every account in it was
-- created during the hackathon, almost all of them by end-to-end scripts and
-- by the agents that built it. `itera.test_accounts` is the inventory. It is
-- additive: nothing is deleted, no row and no asset. A public counter either
-- leaves these accounts out or says that it includes them.
--
-- The rule (`itera.tag_test_accounts`), reproducible:
--   an account created before the given instant is a test account, UNLESS it
--   is one of the three accounts a person uses: the owner's wallet account,
--   the demo e-mail account, the sponsor e-mail account.
-- There is no way to tell a script's wallet from a visitor's by looking at
-- the row, so the rule is by date and by that short list, and the reason
-- column says what kind of account it was.
--
-- The migration tags everything that exists when it is applied. Run
--   select itera.tag_test_accounts();
-- again after a later test run, and NEVER once outside people use the site:
-- from then on a new account is a real one. To take an account back out:
--   delete from itera.test_accounts where user_id = '<id>';
-- Service role only. Idempotent.
-- ============================================================================

create table if not exists itera.test_accounts (
  user_id uuid primary key references itera.users(id) on delete cascade,
  reason text not null,
  tagged_at timestamptz not null default now()
);

alter table itera.test_accounts enable row level security;
revoke all on itera.test_accounts from public, anon, authenticated;
grant select, insert, delete on itera.test_accounts to service_role;

comment on table itera.test_accounts is
  'Accounts created by the team''s tests during the hackathon. Public counters leave them out or say they are included. Nothing is deleted.';

create or replace function itera.tag_test_accounts(p_before timestamptz default now())
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tagged integer;
begin
  insert into itera.test_accounts (user_id, reason)
  select u.id,
         case
           when u.email like '%@wallets.hackathon.invalid' then 'wallet account created by a script or an agent'
           when u.email like 'qa-link-%@hackathon.iterahq.dev' then 'e-mail account of the link-wallet test'
           when u.email like '%@example.invalid' or u.email like '%@e2e.hackathon.invalid' or u.email like '%@e2e.itera.invalid' then 'e-mail account of an end-to-end script'
           else 'account created during the build'
         end
    from itera.users as u
   where u.created_at < p_before
     -- The accounts a person uses: the owner's wallet account, the demo, the sponsor.
     and u.id <> '0b836ee9-f287-4188-95b1-5557d5a7cca2'
     and u.email not in ('demo@hackathon.iterahq.dev', 'sponsor@hackathon.iterahq.dev')
  on conflict (user_id) do nothing;
  get diagnostics v_tagged = row_count;
  return v_tagged;
end;
$$;

revoke all on function itera.tag_test_accounts(timestamptz) from public, anon, authenticated;
grant execute on function itera.tag_test_accounts(timestamptz) to service_role;

select itera.tag_test_accounts();
