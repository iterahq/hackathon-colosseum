-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- The answer key stays on the server, part 1 (additive, idempotent).
--
-- `itera.record_graded_attempt_v2` is what the `grade` function calls after it
-- judged an answer. Besides the attempt and the progress row it now writes what
-- the browser used to write on its own word: the `activity_results` row (with
-- the server's verdict) and the xp of a first pass. It also returns how many
-- times the learner has tried and missed the activity, and whether they had
-- already passed it (a miss while redoing a passed activity costs no life).
--
-- `itera.can_read_answer_key` tells the `lesson` function whether the caller
-- teaches or authors the lesson's program: only they receive specs unsealed.
-- ============================================================================

create or replace function itera.record_graded_attempt_v2(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c_xp_per_activity constant integer := 10;
  v_user uuid;
  v_recent integer;
  v_id uuid;
  v_at timestamptz;
  v_activity uuid := (p->>'activity_id')::uuid;
  v_passed boolean := (p->>'passed')::boolean;
  v_tenant uuid;
  v_xp integer := 0;
  v_tries integer;
  v_misses integer;
  v_done boolean;
begin
  select i.user_id into v_user from itera.identities as i where i.provider_subject = p->>'subject' limit 1;
  if v_user is null then
    return jsonb_build_object('error', 'no_itera_profile');
  end if;

  select count(*) into v_recent
    from itera.graded_attempts as g
   where g.user_id = v_user and g.created_at >= now() - interval '60 seconds';
  if v_recent >= (p->>'max_per_minute')::integer then
    return jsonb_build_object('error', 'too_many_attempts');
  end if;

  select exists (
    select 1 from itera.progress as pr
     where pr.user_id = v_user and pr.activity_id = v_activity and pr.status::text = 'completed'
  ) into v_done;

  insert into itera.graded_attempts
    (user_id, activity_id, lesson_id, kind, mode, passed, claimed_passed, reason, answer_hash, spec_hash, grader)
  values
    (v_user, v_activity, (p->>'lesson_id')::uuid, p->>'kind', p->>'mode', v_passed, (p->>'claimed_passed')::boolean,
     p->>'reason', p->>'answer_hash', p->>'spec_hash', p->>'grader')
  returning id, created_at into v_id, v_at;

  if v_passed then
    insert into itera.progress as pr (user_id, activity_id, status, completed_at, written_by_client)
    values (v_user, v_activity, 'completed', v_at, false)
    on conflict (user_id, activity_id) do update
      set status = 'completed', completed_at = excluded.completed_at, written_by_client = false
      where pr.status::text <> 'completed';
  else
    insert into itera.progress (user_id, activity_id, status, completed_at)
    values (v_user, v_activity, 'in_progress', null)
    on conflict (user_id, activity_id) do nothing;
  end if;

  if coalesce((p->>'write_result')::boolean, false) then
    insert into itera.activity_results (user_id, activity_id, passed, score_internal, feedback, elapsed_ms, visible_ms)
    values (v_user, v_activity, v_passed, null, coalesce(p->'feedback', '{}'::jsonb),
            (p->>'elapsed_ms')::integer, (p->>'visible_ms')::integer);

    if v_passed then
      select pg.tenant_id into v_tenant
        from itera.activities as a
        join itera.lessons as l on l.id = a.lesson_id
        join itera.units as u on u.id = l.unit_id
        join itera.programs as pg on pg.id = u.program_id
        join itera.memberships as m on m.tenant_id = pg.tenant_id and m.user_id = v_user
       where a.id = v_activity
       limit 1;
      if v_tenant is not null then
        insert into itera.xp_events (user_id, tenant_id, amount, reason)
        values (v_user, v_tenant, c_xp_per_activity, 'activity_complete:' || v_activity::text)
        on conflict do nothing;
        get diagnostics v_xp = row_count;
        v_xp := v_xp * c_xp_per_activity;
      end if;
    end if;
  end if;

  select count(*), count(*) filter (where not g.passed) into v_tries, v_misses
    from itera.graded_attempts as g
   where g.user_id = v_user and g.activity_id = v_activity;

  return jsonb_build_object(
    'attempt_id', v_id, 'graded_at', v_at, 'user_id', v_user,
    'tries', v_tries, 'misses', v_misses, 'xp_awarded', v_xp, 'was_completed', v_done
  );
end;
$$;

revoke all on function itera.record_graded_attempt_v2(jsonb) from public, anon, authenticated;
grant execute on function itera.record_graded_attempt_v2(jsonb) to service_role;

create or replace function itera.can_read_answer_key(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from itera.lessons as l
      join itera.units as u on u.id = l.unit_id
      join itera.programs as p on p.id = u.program_id
     where l.id = p_lesson_id
       and p.tenant_id in (select itera.current_author_tenant_ids())
  );
$$;

revoke all on function itera.can_read_answer_key(uuid) from public;
grant execute on function itera.can_read_answer_key(uuid) to anon, authenticated, service_role;

-- The function runs as its caller (the service role), which could only read these two tables.
grant insert on itera.activity_results to service_role;
grant insert on itera.xp_events to service_role;
