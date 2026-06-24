-- 0008_xp_award_on_completion.sql
-- Award XP on activity completion, idempotently.
--
-- WHY: itera.xp_events was EMPTY in prod, so getUserStats().totalXp always
-- returned 0. There was no code path inserting xp_events on completion, and
-- xp_events had only a SELECT RLS policy (no INSERT) so a client user-JWT could
-- not write it directly.
--
-- WHAT: a SECURITY DEFINER RPC the learner calls on the not-completed ->
-- completed transition (from LessonPlayer.persistProgress). It:
--   1. resolves the caller's Itera-local user id (itera.current_itera_user_id()),
--   2. resolves the activity's tenant via activity -> lesson -> unit -> program,
--      and asserts it is one of the caller's tenants (security: a learner can
--      only earn XP inside a tenant they belong to),
--   3. inserts ONE xp_events row tagged reason = 'activity_complete:<activity_id>',
--      ONLY if no such row already exists for that (user, activity).
--
-- IDEMPOTENCY: enforced two ways (belt + suspenders):
--   * a partial UNIQUE index on (user_id, reason) for the activity_complete tag,
--     so a race can never double-insert (the 2nd insert hits ON CONFLICT),
--   * the RPC uses INSERT ... ON CONFLICT DO NOTHING and returns the awarded
--     amount only when a row was actually inserted (0 on re-completion).
--
-- The XP amount is supplied by the caller (client config constant
-- VITE_ITERA_XP_PER_ACTIVITY, default 10); the RPC defaults to 10 too, so a
-- direct/agent call without an explicit amount still behaves correctly.

-- Idempotency guard: at most one activity-completion award per (user, activity).
-- reason is 'activity_complete:<activity_id>'. Partial index keeps it scoped to
-- completion awards and leaves room for other xp_events reasons (badges, etc).
create unique index if not exists xp_events_activity_complete_uniq
  on itera.xp_events (user_id, reason)
  where reason like 'activity_complete:%';

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
  v_user_id   uuid;
  v_tenant_id uuid;
  v_reason    text := 'activity_complete:' || p_activity_id::text;
  v_inserted  int;
begin
  -- Resolve the caller's Itera-local user id (NULL when no membership yet).
  v_user_id := itera.current_itera_user_id();
  if v_user_id is null then
    return 0;
  end if;

  -- Negative / zero awards are a no-op (defensive; config is expected >= 0).
  if coalesce(p_amount, 0) <= 0 then
    return 0;
  end if;

  -- Resolve the activity's tenant via the content chain, and require it to be
  -- one of the caller's tenants. No matching tenant -> not entitled -> no-op.
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

  -- Idempotent insert: the partial unique index makes a duplicate a no-op.
  insert into itera.xp_events (user_id, tenant_id, amount, reason)
  values (v_user_id, v_tenant_id, p_amount, v_reason)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return case when v_inserted > 0 then p_amount else 0 end;
end;
$$;

-- Learners invoke this from the player on completion.
grant execute on function itera.award_activity_xp(uuid, int) to authenticated;
