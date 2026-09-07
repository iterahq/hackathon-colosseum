-- Origin: agent. Plan ADR-24 explicitly authorizes this one historical DML migration.
-- Frozen scope: server-created turns at or before freeze_before. Later captures stay separate.
-- 0083 table lock first. NOWAIT + try-lock avoids waiting on an RPC's learner-first lock.
-- No receipt or captured-moment remap: closed-set engine release follows this migration.
begin;
set local transaction isolation level read committed;
lock table learning.evidence,learning.work_episodes,learning.work_contexts,learning.episode_moments,
 learning.residue,learning.extraction_passes in share row exclusive mode nowait;
do $$
declare
 session_gap_minutes integer:=30;
 freeze_before timestamptz:='2026-09-07T18:30:00Z';
 migration_tag constant text:='0088_learning_session_regroup';
 actor uuid; changed integer; before_count bigint; target_count bigint;
 -- Fingerprint keys are pinned to 0088; later additive columns cannot invalidate replay.
 turn_keys constant text[]:=array['id','learner_id','source','machine','session_ref','project_ref','started_at','ended_at','user_prompt','agent_summary','payload','schema_version','ingest_batch_id','created_at','machine_class','work_context_id','agent_version','session_refs','grain'];
 session_keys constant text[]:=array['id','learner_id','source','machine','session_ref','project_ref','started_at','ended_at','user_prompt','agent_summary','schema_version','ingest_batch_id','created_at','machine_class','work_context_id','agent_version','session_refs','grain','session_episode_id'];
 evidence_keys constant text[]:=array['id','claim_id','learner_id','activity_response_id','observed','actor','direction','strength','confidence','provenance','created_at','misconception_id','moment_id','extractor','prompt_version','model','model_version','relevance_extractor','relevance_model','activity_id','activity_kind','source','surface','assessment_method','artifact_id'];

begin
 if current_user not in('postgres','supabase_admin')then raise exception 'Historical regroup requires migration authority' using errcode='42501';end if;
 if session_gap_minutes<=0 then raise exception 'Session gap must be positive';end if;
 create temporary table a2_turns on commit drop as
 select t.*,c.project_root,to_jsonb(t) before_row
 from learning.work_episodes t left join learning.work_contexts c on c.id=t.work_context_id
 where t.grain='turn' and t.created_at<=freeze_before;
 select count(*)into before_count from a2_turns;
 for actor in select distinct learner_id from a2_turns order by learner_id loop
  if not pg_try_advisory_xact_lock(hashtextextended('learning.evidence.status:'||actor::text,0))then
   raise exception 'A learner writer is busy; retry the migration after it commits' using errcode='55P03';
  end if;
 end loop;
 if exists(select 1 from a2_turns t left join learning.work_contexts c on c.id=t.work_context_id
  where t.started_at is null or t.project_root is null or c.learner_id is distinct from t.learner_id
  or c.machine is distinct from t.machine or c.machine_class is distinct from t.machine_class
  or t.ended_at<t.started_at)then raise exception 'Frozen turns have invalid timestamps or context tuples';end if;

 -- A completed mapping is immutable. New captures cannot renumber its sessions.
 if exists(select 1 from learning.work_episodes where payload->>'regroup_migration'=migration_tag)then
  if exists(select 1 from learning.work_episodes s where s.payload->>'regroup_migration'=migration_tag
   and (s.grain<>'session' or (s.payload->>'freeze_before')::timestamptz is distinct from freeze_before
    or (s.payload->>'session_gap_minutes')::integer is distinct from session_gap_minutes
    or jsonb_typeof(s.payload->'turn_manifest') is distinct from 'array'
    or jsonb_typeof(s.payload->'evidence_manifest') is distinct from 'array'))then
   raise exception 'Historical regroup manifest metadata changed';
  end if;
 if exists(select 1 from learning.work_episodes s where s.payload->>'regroup_migration'=migration_tag and (
  s.payload->>'manifest_fingerprint' is distinct from encode(sha256(convert_to((s.payload-array['manifest_fingerprint','session_fingerprint'])::text,'UTF8')),'hex')
  or s.payload->>'session_fingerprint' is distinct from encode(sha256(convert_to((select jsonb_object_agg(k,v)from jsonb_each(to_jsonb(s))j(k,v)where k=any(session_keys))::text,'UTF8')),'hex')))
 then raise exception 'Historical regroup manifest or session metadata changed';end if;
  create temporary table a2_saved on commit drop as
  select s.id session_id,s.learner_id,s.work_context_id,j.value turn
  from learning.work_episodes s cross join lateral jsonb_array_elements(s.payload->'turn_manifest')j
  where s.payload->>'regroup_migration'=migration_tag;
  if (select count(*)from a2_saved)<>before_count
   or (select count(distinct turn->>'id')from a2_saved)<>before_count
   or (select count(distinct turn->>'moment_id')from a2_saved)<>before_count
   or exists(select 1 from a2_turns t full join a2_saved s on (s.turn->>'id')::uuid=t.id
    where t.id is null or s.session_id is null or t.session_episode_id is distinct from s.session_id
    or t.learner_id is distinct from s.learner_id or t.work_context_id is distinct from s.work_context_id
    or s.turn->>'fingerprint' is distinct from encode(sha256(convert_to((select jsonb_object_agg(k,v)from jsonb_each(t.before_row)j(k,v)where k=any(turn_keys))::text,'UTF8')),'hex'))
   or exists(select 1 from a2_saved s left join learning.episode_moments m on m.id=(s.turn->>'moment_id')::uuid
    left join a2_turns t on t.id=(s.turn->>'id')::uuid
    where m.id is null or m.episode_id is distinct from s.session_id or m.learner_id is distinct from s.learner_id
    or m.kind<>'turn' or m.at is distinct from t.started_at
    or m.payload is distinct from jsonb_build_object('regroup_migration',migration_tag,'turn_episode_id',t.id,
     'digest_ref',jsonb_build_object('table','learning.work_episodes','id',t.id),'session_ref',t.session_ref))then
   raise exception 'Historical regroup manifest is incomplete or changed';
  end if;
  if exists(select 1 from learning.work_episodes s cross join lateral jsonb_array_elements(s.payload->'evidence_manifest')j
   left join learning.evidence e on e.id=(j.value->>'id')::uuid
   where s.payload->>'regroup_migration'=migration_tag and (e.id is null or e.episode_id is distinct from s.id
    or e.turn_episode_id is distinct from (j.value->>'turn_id')::uuid
    or j.value->>'fingerprint' is distinct from encode(sha256(convert_to((select jsonb_object_agg(k,v)from jsonb_each(to_jsonb(e))j(k,v)where k=any(evidence_keys))::text,'UTF8')),'hex')))then
   raise exception 'Historical regroup evidence manifest is incomplete or changed';
  end if;
  return;
 end if;
 if before_count=0 then return;end if;
 if exists(select 1 from a2_turns where session_episode_id is not null)then raise exception 'Frozen turn already has a session parent';end if;
 if exists(select 1 from learning.episode_moments m join a2_turns t on t.id=m.episode_id)
  or exists(select 1 from learning.residue r join a2_turns t on t.id=r.episode_id)
  or exists(select 1 from learning.extraction_passes p join a2_turns t on t.id=p.episode_id)
  or exists(select 1 from learning.evidence e join a2_turns t on t.id=e.episode_id where e.moment_id is not null or e.turn_episode_id is not null)then
  raise exception 'Frozen turns have receipt, residue, moment, or existing turn-link conflicts';
 end if;
 -- Refuse pre-existing projection drift; this migration does not conceal a prior failure.
 for actor in select distinct learner_id from a2_turns order by learner_id loop
  changed:=learning.refresh_evidence_status_for_learner(actor);
  if changed<>0 then raise exception 'Evidence status differs before regroup';end if;
 end loop;
 create temporary table a2_evidence_before on commit drop as select e.*,to_jsonb(e) before_row from learning.evidence e;
 create temporary table a2_ordered on commit drop as
 select t.*,lag(coalesce(ended_at,started_at))over w prev_end,lag(project_root)over w prev_root,
 lag(work_context_id)over w prev_context
 from a2_turns t window w as(partition by learner_id order by started_at,id);
 create temporary table a2_numbered on commit drop as
 select o.*,sum(case when prev_end is null or project_root is distinct from prev_root
  or work_context_id is distinct from prev_context
  or started_at-prev_end>make_interval(mins=>session_gap_minutes)then 1 else 0 end)
 over(partition by learner_id order by started_at,id rows unbounded preceding) session_seq from a2_ordered o;
 create temporary table a2_map on commit drop as
 select n.*,md5(learner_id::text||'|'||project_root||'|'||dense_rank()over(partition by learner_id,project_root order by session_seq)::text)::uuid new_session_id,
 md5(migration_tag||':turn:'||id::text)::uuid new_moment_id from a2_numbered n;
 if exists(select 1 from a2_map group by new_session_id having count(distinct schema_version)>1)
  or exists(select 1 from a2_map m join learning.work_episodes e on e.id=m.new_session_id)
  or exists(select 1 from a2_map m join learning.episode_moments e on e.id=m.new_moment_id)then
  raise exception 'Session schema versions differ or a deterministic ID already exists';
 end if;
 select count(distinct new_session_id)into target_count from a2_map;
 insert into learning.work_episodes(id,learner_id,source,machine,machine_class,project_ref,work_context_id,
  started_at,ended_at,schema_version,agent_version,grain,session_refs,payload)
 select m.new_session_id,m.learner_id,(array_agg(source order by started_at,id))[1],
  (array_agg(machine order by started_at,id))[1],(array_agg(machine_class order by started_at,id))[1],
  (array_agg(project_ref order by started_at,id))[1],(array_agg(work_context_id order by started_at,id))[1],
  min(started_at),max(coalesce(ended_at,started_at)),min(schema_version),null,'session',
  coalesce(array_agg(distinct session_ref order by session_ref)filter(where session_ref is not null),'{}'::text[]),
  jsonb_build_object('regroup_migration',migration_tag,'freeze_before',freeze_before,'session_gap_minutes',session_gap_minutes,
   'turn_manifest',jsonb_agg(jsonb_build_object('id',id,'moment_id',new_moment_id,
     'fingerprint',encode(sha256(convert_to((select jsonb_object_agg(k,v)from jsonb_each(before_row)j(k,v)where k=any(turn_keys))::text,'UTF8')),'hex'))order by started_at,id),
   'evidence_manifest',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'turn_id',e.episode_id,
     'fingerprint',encode(sha256(convert_to((select jsonb_object_agg(k,v)from jsonb_each(e.before_row)j(k,v)where k=any(evidence_keys))::text,'UTF8')),'hex'))order by e.id)
     from a2_evidence_before e join a2_map mm on mm.id=e.episode_id where mm.new_session_id=m.new_session_id),'[]'::jsonb))
 from a2_map m group by m.new_session_id,m.learner_id;
 update learning.work_episodes s set payload=s.payload||jsonb_build_object(
  'manifest_fingerprint',encode(sha256(convert_to(s.payload::text,'UTF8')),'hex'),
  'session_fingerprint',encode(sha256(convert_to((select jsonb_object_agg(k,v)from jsonb_each(to_jsonb(s))j(k,v)where k=any(session_keys))::text,'UTF8')),'hex'))
 where s.payload->>'regroup_migration'=migration_tag;
 insert into learning.episode_moments(id,episode_id,learner_id,kind,at,payload)
 select new_moment_id,new_session_id,learner_id,'turn',started_at,jsonb_build_object(
  'regroup_migration',migration_tag,'turn_episode_id',id,'digest_ref',jsonb_build_object('table','learning.work_episodes','id',id),
  'session_ref',session_ref)from a2_map;
 update learning.work_episodes t set session_episode_id=m.new_session_id from a2_map m where t.id=m.id;
 update learning.evidence e set episode_id=m.new_session_id,turn_episode_id=m.id from a2_map m where e.episode_id=m.id;
 for actor in select distinct learner_id from a2_turns order by learner_id loop
  changed:=learning.refresh_evidence_status_for_learner(actor);
  if changed<>0 then raise exception 'Evidence status differs after regroup trigger';end if;
 end loop;
 if (select count(*)from learning.work_episodes where payload->>'regroup_migration'=migration_tag)<>target_count
  or (select count(*)from learning.episode_moments where payload->>'regroup_migration'=migration_tag)<>before_count
  or exists(select 1 from a2_turns t left join learning.work_episodes e on e.id=t.id left join a2_map m on m.id=t.id
   where e.id is null or (to_jsonb(e)-'session_episode_id') is distinct from (t.before_row-'session_episode_id')
    or e.session_episode_id is distinct from m.new_session_id)
  or (select count(*)from learning.evidence)<>(select count(*)from a2_evidence_before)
  or exists(select 1 from a2_evidence_before b left join learning.evidence e on e.id=b.id left join a2_map m on m.id=b.episode_id
   where e.id is null or (case when m.id is null then to_jsonb(e) else to_jsonb(e)-array['episode_id','turn_episode_id','status'] end)
    is distinct from (case when m.id is null then b.before_row else b.before_row-array['episode_id','turn_episode_id','status'] end)
    or (m.id is not null and(e.episode_id is distinct from m.new_session_id or e.turn_episode_id is distinct from m.id)))then
  raise exception 'Historical regroup preservation assertion failed';
 end if;
 raise notice 'Historical regroup: % frozen turns, % sessions, gap % minutes, cutoff %',before_count,target_count,session_gap_minutes,freeze_before;
end $$;
commit;
