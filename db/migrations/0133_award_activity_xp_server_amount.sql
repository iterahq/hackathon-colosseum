-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- XP is decided by the server (security review, finding 3).
--
-- `itera.award_activity_xp(uuid, int)` is SECURITY DEFINER and granted to
-- `authenticated`, and it stored whatever `p_amount` the client sent: one call
-- with 2 000 000 000 set any level, which the companion asset then mirrored on
-- chain. The signature stays (the deployed client calls it with `p_amount`),
-- but:
--   * the amount is at most the server's constant, 10 xp per activity (the
--     client's `XP_PER_ACTIVITY` default; no build of this app overrides it);
--   * the caller must hold a `completed` progress row for that activity;
--   * at most one award per (learner, activity), as before (partial unique
--     index `xp_events_activity_complete_uniq` of 0008).
-- `anon` loses EXECUTE: it never had a learner to award.
-- Idempotent.
-- ============================================================================

create or replace function itera.award_activity_xp(
  p_activity_id uuid,
  p_amount int default 10
)
returns int
language plpgsql
volatile
security definer
set search_path to 'itera', 'public'
as $$
declare
  -- The only amount an activity is worth. The client's number can lower it, never raise it.
  c_xp_per_activity constant int := 10;
  v_user_id   uuid;
  v_tenant_id uuid;
  v_amount    int;
  v_reason    text := 'activity_complete:' || p_activity_id::text;
  v_inserted  int;
begin
  v_user_id := itera.current_itera_user_id();
  if v_user_id is null then
    return 0;
  end if;

  if coalesce(p_amount, 0) <= 0 then
    return 0;
  end if;
  v_amount := least(p_amount, c_xp_per_activity);

  -- The activity must belong to one of the caller's tenants.
  select p.tenant_id
    into v_tenant_id
  from itera.activities a
  join itera.lessons   l on l.id = a.lesson_id
  join itera.units     u on u.id = l.unit_id
  join itera.programs  p on p.id = u.program_id
  where a.id = p_activity_id
    and p.tenant_id in (select itera.current_tenant_ids());

  if v_tenant_id is null then
    return 0;
  end if;

  -- No completion, no xp. The player writes the progress row before it asks for the award.
  if not exists (
    select 1 from itera.progress pr
    where pr.user_id = v_user_id and pr.activity_id = p_activity_id and pr.status = 'completed'
  ) then
    return 0;
  end if;

  insert into itera.xp_events (user_id, tenant_id, amount, reason)
  values (v_user_id, v_tenant_id, v_amount, v_reason)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return case when v_inserted > 0 then v_amount else 0 end;
end;
$$;

revoke all on function itera.award_activity_xp(uuid, int) from public, anon;
grant execute on function itera.award_activity_xp(uuid, int) to authenticated, service_role;
