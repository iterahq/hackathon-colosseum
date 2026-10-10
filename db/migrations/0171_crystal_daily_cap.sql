-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Phoenix Crystals review fix H1: the lesson earns (`lesson_completed` +
-- `lesson_clean`) are capped at 40 crystals per learner per UTC day, enforced
-- here, inside the grant path, whatever the caller asks. A grant that would pass
-- the cap is refused whole (`is_new` false); the award it came from is picked up
-- again by a later day's reconcile. `p_ignore_cap` exists for the one-off backfill
-- (service role only, like the function).
-- Idempotent.

drop function if exists itera.crystal_grant(uuid, integer, text, text);

create or replace function itera.crystal_grant(p_user_id uuid, p_amount integer, p_reason text, p_ref_id text, p_ignore_cap boolean default false)
returns table (balance integer, is_new boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted integer;
  v_today integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'crystal_grant: amount must be positive';
  end if;

  insert into itera.crystal_accounts (user_id) values (p_user_id) on conflict (user_id) do nothing;

  if not p_ignore_cap and p_reason in ('lesson_completed', 'lesson_clean') then
    -- The account row is the lock: two lesson earns of one learner never read the same total.
    perform 1 from itera.crystal_accounts as account where account.user_id = p_user_id for update;
    select coalesce(sum(entry.delta), 0) into v_today
      from itera.crystal_ledger as entry
     where entry.user_id = p_user_id
       and entry.reason in ('lesson_completed', 'lesson_clean')
       and entry.created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
    if v_today + p_amount > 40 then
      return query select account.balance, false from itera.crystal_accounts as account where account.user_id = p_user_id;
      return;
    end if;
  end if;

  insert into itera.crystal_ledger (user_id, delta, reason, ref_id)
  values (p_user_id, p_amount, p_reason, p_ref_id)
  on conflict on constraint crystal_ledger_once do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    return query
      update itera.crystal_accounts as account
         set balance = account.balance + p_amount, updated_at = now()
       where account.user_id = p_user_id
       returning account.balance, true;
  else
    return query select account.balance, false from itera.crystal_accounts as account where account.user_id = p_user_id;
  end if;
end;
$$;

revoke all on function itera.crystal_grant(uuid, integer, text, text, boolean) from public, anon, authenticated;
grant execute on function itera.crystal_grant(uuid, integer, text, text, boolean) to service_role;
