-- Origin: agent
-- Plan 20260903-itera-learning-schema-v04-remodel, T37 / T5.
-- Human merge gate. Append-only correction after0078/0079.
-- Status is a projection of supersede-at-read. No evidence/verdict is removed.
-- JWT INSERT/DELETE/key UPDATE acquire the learner lock BEFORE row locks.
-- AFTER triggers maintain the projection inside the same transaction.
-- Read committed is required. A2/admin multi-learner changes must first take
-- LOCK TABLE learning.evidence IN SHARE ROW EXCLUSIVE MODE.

begin;
lock table learning.evidence in share row exclusive mode;
grant update(status) on learning.evidence to authenticated;

-- JavaScript compares strings by UTF-16 code units. COLLATE C alone differs
-- for supplementary characters. This key preserves even that tie case.
create or replace function learning.evidence_js_sort_key(value text)
returns integer[] language sql immutable strict parallel safe as $$
  select coalesce(array_agg(unit order by position, half),array[]::integer[])
  from generate_series(1,length(value)) position
  cross join lateral (select ascii(substr(value,position,1)) as cp) chars
  cross join lateral (
    select case when cp>65535 then 55296+((cp-65536)/1024) else cp end as unit,0 as half
    union all select 56320+((cp-65536)%1024),1 where cp>65535
  ) units;
$$;
revoke all on function learning.evidence_js_sort_key(text) from public,anon;
grant execute on function learning.evidence_js_sort_key(text) to authenticated;

create or replace function learning.evidence_status_lock_caller()
returns trigger language plpgsql security invoker set search_path=pg_catalog,learning,itera set timezone='UTC' as $$
declare actor uuid:=itera.current_itera_user_id();
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Evidence status requires READ COMMITTED isolation' using errcode='25000';
  end if;
  if actor is not null then
    perform pg_advisory_xact_lock(hashtextextended('learning.evidence.status:'||actor::text,0));
  end if;
  return null;
end;
$$;

-- Internal trigger helper. SECURITY INVOKER never elevates the caller.
-- An ordinary caller cannot use its parameters to refresh another learner.
create or replace function learning.refresh_evidence_status_for_learner(target uuid, claim_ids uuid[] default null)
returns integer language plpgsql security invoker set search_path=pg_catalog,learning,itera set timezone='UTC' as $$
declare actor uuid:=itera.current_itera_user_id(); changed integer;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Evidence status requires READ COMMITTED isolation' using errcode='25000';
  end if;
  if target is null or (actor is distinct from target and current_user not in ('postgres','supabase_admin')) then
    raise exception 'The caller can refresh only its own evidence' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('learning.evidence.status:'||target::text,0));
  -- A separate command after the lock sees the previous writer's commit.
  with marked as (
    select e.id,e.claim_id,e.episode_id,e.activity_response_id,
      case when jsonb_typeof(provenance->'pass_id')='string' and provenance->>'pass_id'<>''
        then 'id:'||(provenance->>'pass_id') else 'at:'||(to_jsonb(created_at)#>>'{}') end as pass_key,
      case when jsonb_typeof(provenance->'pass_at')='string' and provenance->>'pass_at'<>''
        then provenance->>'pass_at' else to_jsonb(created_at)#>>'{}' end as pass_order
    from learning.evidence e where learner_id=target and (claim_ids is null or claim_id=any(claim_ids))
  ), winners as (
    select id,pass_key,first_value(pass_key) over (partition by claim_id,episode_id
      order by learning.evidence_js_sort_key(pass_order) desc,learning.evidence_js_sort_key(pass_key) desc) as winner
    from marked where episode_id is not null and activity_response_id is null
  ), expected as (
    select m.id,case when w.id is null or w.pass_key=w.winner then 'active' else 'superseded' end as status
    from marked m left join winners w using(id)
  )
  update learning.evidence e set status=x.status from expected x where e.id=x.id and e.status is distinct from x.status;
  get diagnostics changed=row_count;
  return changed;
end;
$$;
revoke all on function learning.refresh_evidence_status_for_learner(uuid,uuid[]) from public,anon;
grant execute on function learning.refresh_evidence_status_for_learner(uuid,uuid[]) to authenticated;

create or replace function learning.refresh_evidence_status(p_claim_ids uuid[] default null)
returns integer language plpgsql security invoker set search_path=pg_catalog,learning,itera as $$
declare actor uuid:=itera.current_itera_user_id();
begin
  if actor is null then raise exception 'A caller identity is required' using errcode='42501'; end if;
  return learning.refresh_evidence_status_for_learner(actor,p_claim_ids);
end;
$$;
revoke all on function learning.refresh_evidence_status(uuid[]) from public,anon;
grant execute on function learning.refresh_evidence_status(uuid[]) to authenticated;

create or replace function learning.evidence_status_after_insert()
returns trigger language plpgsql security invoker set search_path=pg_catalog,learning,itera as $$
declare affected record;
begin
  for affected in select learner_id,array_agg(distinct claim_id) as claims from inserted_evidence group by learner_id order by learner_id loop
    perform learning.refresh_evidence_status_for_learner(affected.learner_id,affected.claims);
  end loop;
  return null;
end;
$$;
create or replace function learning.evidence_status_after_delete()
returns trigger language plpgsql security invoker set search_path=pg_catalog,learning,itera as $$
declare affected record;
begin
  for affected in select learner_id,array_agg(distinct claim_id) as claims from deleted_evidence group by learner_id order by learner_id loop
    perform learning.refresh_evidence_status_for_learner(affected.learner_id,affected.claims);
  end loop;
  return null;
end;
$$;
create or replace function learning.evidence_status_after_update()
returns trigger language plpgsql security invoker set search_path=pg_catalog,learning,itera as $$
declare affected record;
begin
  for affected in
    select learner_id,array_agg(distinct claim_id) as claims from (
      select learner_id,claim_id from previous_evidence
      union select learner_id,claim_id from updated_evidence
    ) changed group by learner_id order by learner_id
  loop
    perform learning.refresh_evidence_status_for_learner(affected.learner_id,affected.claims);
  end loop;
  return null;
end;
$$;

-- Statement triggers include direct status changes. Refresh updates only rows
-- with a different status. Its nested zero-row UPDATE has empty transition
-- tables, which terminates recursion without a caller-controlled bypass flag.
drop trigger if exists evidence_status_lock_insert on learning.evidence;
create trigger evidence_status_lock_insert before insert on learning.evidence for each statement execute function learning.evidence_status_lock_caller();
drop trigger if exists evidence_status_lock_delete on learning.evidence;
create trigger evidence_status_lock_delete before delete on learning.evidence for each statement execute function learning.evidence_status_lock_caller();
drop trigger if exists evidence_status_lock_update on learning.evidence;
create trigger evidence_status_lock_update before update on learning.evidence for each statement execute function learning.evidence_status_lock_caller();
drop trigger if exists evidence_status_insert on learning.evidence;
create trigger evidence_status_insert after insert on learning.evidence referencing new table as inserted_evidence for each statement execute function learning.evidence_status_after_insert();
drop trigger if exists evidence_status_delete on learning.evidence;
create trigger evidence_status_delete after delete on learning.evidence referencing old table as deleted_evidence for each statement execute function learning.evidence_status_after_delete();
drop trigger if exists evidence_status_update on learning.evidence;
create trigger evidence_status_update after update on learning.evidence referencing old table as previous_evidence new table as updated_evidence for each statement execute function learning.evidence_status_after_update();

-- Existing status is derived, not editorial data. The human-gated migration
-- performs the same read-time calculation once while holding the table lock.
do $$ declare actor uuid; begin
  for actor in select distinct learner_id from learning.evidence order by learner_id loop
    perform learning.refresh_evidence_status_for_learner(actor,null);
  end loop;
end $$;
notify pgrst,'reload schema';

commit;
