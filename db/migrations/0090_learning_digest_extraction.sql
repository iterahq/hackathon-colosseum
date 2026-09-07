-- Origin: agent. T22 adds digest-quality historical extraction to the atomic pass RPC.
-- HOLD: finalize T22_RELEASE_BOUNDARY only after engine PR109 has an actual mergedAt.
-- No production DML. The NULL boundary rejects every digest request until finalized.
-- 0085 and 0088 remain immutable. Receipt equality and learner/editorial lock order remain.
-- R11 means pre-existing post-T14 evidence. Same-pass evidence and later passes are legal.
begin;
create or replace function learning.assert_digest_backfill_eligible(p_request jsonb,p_evidence_ids uuid[] default '{}',p_residue_ids uuid[] default '{}')
returns void language plpgsql security invoker set search_path=pg_catalog,learning,itera set timezone='UTC' as $$
declare
 caller_id uuid:=itera.current_itera_user_id(); ep uuid:=(p_request->>'episode_id')::uuid;
 episode_row learning.work_episodes%rowtype; expected_digest jsonb;
 t14_boundary constant timestamptz:='2026-09-07T21:01:16Z'; -- T22_RELEASE_BOUNDARY: finalize to #109 mergedAt before release
begin
 if current_user<>'authenticated' or caller_id is null then raise exception 'An authenticated caller identity is required' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Digest backfill requires READ COMMITTED' using errcode='25000';end if;
 perform pg_advisory_xact_lock(hashtextextended('learning.evidence.status:'||caller_id::text,0));
 select * into episode_row from learning.work_episodes where id=ep and learner_id=caller_id for share;
 if not found then raise exception 'Episode is not owned by caller' using errcode='42501';end if;
   if t14_boundary is null then raise exception 'Digest backfill release boundary is not finalized' using errcode='55000'; end if;
   if episode_row.grain is distinct from 'session'
     or episode_row.payload->>'regroup_migration' is distinct from '0088_learning_session_regroup'
     or episode_row.created_at>=t14_boundary
     or (episode_row.payload->>'freeze_before')::timestamptz is distinct from '2026-09-07T18:30:00Z'::timestamptz then
     raise exception 'Digest backfill requires a preserved historical A2 session' using errcode='22023';
   end if;
   if exists(select 1 from jsonb_array_elements(p_request->'observations')o where o->>'moment_id' is not null) then
     raise exception 'Digest observations cannot claim captured moment identity' using errcode='22023';
   end if;
   if jsonb_typeof(episode_row.payload->'turn_manifest') is distinct from 'array'
     or (select count(*) from jsonb_array_elements(episode_row.payload->'turn_manifest'))
       is distinct from (select count(*) from learning.work_episodes where session_episode_id=ep and learner_id=caller_id)
     or (select count(*) from jsonb_array_elements(episode_row.payload->'turn_manifest'))
       is distinct from (select count(*) from learning.episode_moments where episode_id=ep and learner_id=caller_id)
     or (select count(distinct entry->>'id') from jsonb_array_elements(episode_row.payload->'turn_manifest')entry)
       is distinct from jsonb_array_length(episode_row.payload->'turn_manifest')::bigint
     or (select count(distinct entry->>'moment_id') from jsonb_array_elements(episode_row.payload->'turn_manifest')entry)
       is distinct from jsonb_array_length(episode_row.payload->'turn_manifest')::bigint
     or exists(select 1 from jsonb_array_elements(episode_row.payload->'turn_manifest')entry
       left join learning.work_episodes t on t.id=(entry->>'id')::uuid and t.session_episode_id=ep and t.learner_id=caller_id
       left join learning.episode_moments m on m.id=(entry->>'moment_id')::uuid and m.episode_id=ep and m.learner_id=caller_id
       where t.id is null or m.id is null or m.kind<>'turn' or m.at is distinct from t.started_at
        or m.payload->>'turn_episode_id' is distinct from t.id::text
        or m.payload#>>'{digest_ref,table}' is distinct from 'learning.work_episodes'
        or m.payload#>>'{digest_ref,id}' is distinct from t.id::text) then
     raise exception 'Historical digest source references are inconsistent' using errcode='23514';
   end if;
   if not exists(select 1 from learning.work_episodes t where t.session_episode_id=ep and t.learner_id=caller_id
     and length(trim(coalesce(t.payload#>>'{agent_turn,text}','')))>0) then
     raise exception 'Historical session has no complete captured agent half' using errcode='22023';
   end if;
   if exists(select 1 from learning.extraction_passes where episode_id=ep and learner_id=caller_id)
     or exists(select 1 from learning.residue where episode_id=ep and learner_id=caller_id and not(id=any(p_residue_ids))) then
     raise exception 'Historical session already has an extraction pass or residue' using errcode='23505';
   end if;
   if exists(select 1 from learning.evidence e where e.episode_id=ep and e.learner_id=caller_id and not(e.id=any(p_evidence_ids))
     and coalesce(nullif(e.provenance->>'pass_at','')::timestamptz,e.created_at)>=t14_boundary) then
     raise exception 'Historical session already has post-T14 evidence' using errcode='23505';
   end if;
   select jsonb_build_object('t14_merged_at',t14_boundary,
     'evidence_ids',coalesce((select jsonb_agg(id order by id) from learning.evidence where episode_id=ep and learner_id=caller_id and not(id=any(p_evidence_ids))),'[]'::jsonb),
     'turn_ids',coalesce((select jsonb_agg(id order by id) from learning.work_episodes where session_episode_id=ep and learner_id=caller_id),'[]'::jsonb),
     'moment_ids',coalesce((select jsonb_agg(id order by id) from learning.episode_moments where episode_id=ep and learner_id=caller_id),'[]'::jsonb)) into expected_digest;
   if (p_request#>>'{provenance,digest_backfill,t14_merged_at}')::timestamptz is distinct from t14_boundary
     or ((p_request#>'{provenance,digest_backfill}')-'t14_merged_at') is distinct from (expected_digest-'t14_merged_at') then
     raise exception 'Digest eligibility baseline differs from current rows' using errcode='40001';
   end if;

end $$;
revoke all on function learning.assert_digest_backfill_eligible(jsonb,uuid[],uuid[]) from public,anon,service_role;
grant execute on function learning.assert_digest_backfill_eligible(jsonb,uuid[],uuid[]) to authenticated;

create or replace function learning.validate_extraction_receipt()
returns trigger language plpgsql security invoker set search_path=pg_catalog,learning,itera as $$
declare obs jsonb; ev jsonb; rid uuid; idx integer; evidence_ids uuid[]:='{}'; residue_ids uuid[]:='{}';
 seen text[]:='{}'; key text; res jsonb; expected jsonb; actual jsonb;
begin
 if new.episode_id::text is distinct from new.request->>'episode_id' or new.pass_id is distinct from new.request->>'pass_id'
 or jsonb_typeof(new.request->'observations') is distinct from 'array' then raise exception 'Invalid receipt identity' using errcode='23514'; end if;
 for obs in select value from jsonb_array_elements(new.request->'observations') loop
  key:=obs->>'observation_id';res:=nullif(obs->'residue','null'::jsonb);idx:=0;
  if key is null or key=any(seen) or jsonb_typeof(obs->'evidence') is distinct from 'array' then raise exception 'Invalid receipt observation' using errcode='23514'; end if;
  seen:=array_append(seen,key);
  if (jsonb_array_length(obs->'evidence')>0)=(res is not null) then raise exception 'Receipt observation must be exclusive' using errcode='23514'; end if;
  for ev in select value from jsonb_array_elements(obs->'evidence') loop
   idx:=idx+1;rid:=md5(jsonb_build_array(new.learner_id,new.episode_id,new.pass_id,key,'evidence',idx)::text)::uuid;
   if not exists(select 1 from learning.evidence e where e.id=rid and e.learner_id=new.learner_id and e.episode_id=new.episode_id
    and e.moment_id is not distinct from (obs->>'moment_id')::uuid and e.claim_id=(ev->>'claim_id')::uuid
    and e.observed=ev->>'observed' and e.actor=ev->>'actor' and e.direction=ev->>'direction' and e.strength=ev->>'strength'
    and e.confidence=(ev->>'confidence')::numeric
    and e.misconception_id is not distinct from ev#>>'{misconception_refs,0,misconception_id}'
    and e.provenance is not distinct from ((new.request->'provenance')||jsonb_build_object(
      'pass_id',new.pass_id,'pass_at',new.request->>'pass_at','ontology_version',(new.request->>'ontology_version')::integer,
      'quality',new.request->>'quality','observation_id',key,'capability_id',ev->>'capability_id','episode_id',new.episode_id))) then
      raise exception 'Receipt evidence does not exist or differs' using errcode='23514';
   end if;
   evidence_ids:=array_append(evidence_ids,rid);
  end loop;
  if res is not null then
   rid:=md5(jsonb_build_array(new.learner_id,new.episode_id,new.pass_id,key,'residue')::text)::uuid;
   if not exists(select 1 from learning.residue r where r.id=rid and r.learner_id=new.learner_id and r.episode_id=new.episode_id
    and r.moment_id is not distinct from (obs->>'moment_id')::uuid and r.pass_id=new.pass_id and r.candidate=res->>'candidate'
    and r.suggested_label is not distinct from res->>'suggested_label' and r.nearest_capability_id is not distinct from res->>'nearest_capability_id'
    and r.nearest_score is not distinct from (res->>'nearest_score')::numeric
    and r.ontology_version is not distinct from (new.request->>'ontology_version')::integer
    and r.quality is not distinct from new.request->>'quality'
    and r.pass_at is not distinct from (new.request->>'pass_at')::timestamptz) then
     raise exception 'Receipt residue does not exist or differs' using errcode='23514';
   end if;
   residue_ids:=array_append(residue_ids,rid);
  end if;
 end loop;
 expected:=jsonb_build_object('evidence_inserted',cardinality(evidence_ids),'residue_inserted',cardinality(residue_ids),'evidence_ids',to_jsonb(evidence_ids),'residue_ids',to_jsonb(residue_ids));
 if new.result is distinct from expected then raise exception 'Receipt result differs from persisted rows' using errcode='23514'; end if;
 if new.request->>'quality'='digest' then
   perform learning.assert_digest_backfill_eligible(new.request,evidence_ids,residue_ids);
 end if;
 return new;
end $$;

create or replace function learning.record_extraction_pass(p_request jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,learning,itera set timezone='UTC' as $$
declare
 actor uuid:=itera.current_itera_user_id(); ep uuid; pass text; pass_time timestamptz; version_no integer; quality_name text;
 saved learning.extraction_passes%rowtype; obs jsonb; ev jsonb; res jsonb; observation_key text; moment uuid;
 seen text[]:='{}'; seen_moments uuid[]:='{}'; evidence_ids uuid[]:='{}'; residue_ids uuid[]:='{}'; row_id uuid;
 claim_row learning.claims%rowtype; cap text; linked_cap text; result_json jsonb; ev_index integer;
 base_provenance jsonb;
begin
 if current_user <> 'authenticated' or actor is null then raise exception 'An authenticated caller identity is required' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Extraction requires READ COMMITTED' using errcode='25000'; end if;
 perform pg_advisory_xact_lock(hashtextextended('learning.evidence.status:'||actor::text,0));
 if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>524288
 or jsonb_typeof(p_request->'observations') is distinct from 'array' then raise exception 'Invalid extraction request' using errcode='22023'; end if;
 if jsonb_array_length(p_request->'observations')>100 then raise exception 'Too many observations' using errcode='22023'; end if;
 ep:=(p_request->>'episode_id')::uuid; pass:=p_request->>'pass_id'; pass_time:=(p_request->>'pass_at')::timestamptz;
 version_no:=(p_request->>'ontology_version')::integer; quality_name:=p_request->>'quality';
 if ep is null or pass is null or length(pass) not between 1 and 200 or pass_time is null or not isfinite(pass_time)
 or version_no is null or quality_name is null or quality_name not in ('transcript','digest') then raise exception 'Invalid extraction identity or quality' using errcode='22023'; end if;
 if not exists(select 1 from learning.work_episodes where id=ep and learner_id=actor) then raise exception 'Episode is not owned by caller' using errcode='42501'; end if;
 select * into saved from learning.extraction_passes where learner_id=actor and episode_id=ep and pass_id=pass;
 if found then
   if saved.request is distinct from p_request then raise exception 'Extraction retry payload conflicts with receipt' using errcode='23505'; end if;
   return saved.result;
 end if;
 -- Exact retries returned above. This check observes the baseline before any pass rows.
 if quality_name='digest' then
   perform learning.assert_digest_backfill_eligible(p_request);
 elsif exists(select 1 from learning.work_episodes where id=ep and payload->>'regroup_migration'='0088_learning_session_regroup') then
   raise exception 'Historical A2 sessions require digest quality' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(20260903,82);
 if version_no is distinct from (select max(version) from learning.ontology_versions) then raise exception 'Ontology changed; start a new extraction pass' using errcode='40001'; end if;
 base_provenance:=p_request->'provenance';
 if jsonb_typeof(base_provenance) is distinct from 'object' then raise exception 'Provenance must be an object' using errcode='22023'; end if;
 for obs in select value from jsonb_array_elements(p_request->'observations') loop
   observation_key:=obs->>'observation_id'; moment:=(obs->>'moment_id')::uuid;
   if observation_key is null or length(observation_key) not between 1 and 200 or observation_key=any(seen) then raise exception 'Duplicate or invalid observation identity' using errcode='22023'; end if;
   seen:=array_append(seen,observation_key);
   if quality_name='digest' and moment is not null then raise exception 'Digest observations cannot claim captured moment identity' using errcode='22023'; end if;
   if moment is not null then
     if moment=any(seen_moments) then raise exception 'A captured moment must have one grouped observation' using errcode='22023'; end if;
     seen_moments:=array_append(seen_moments,moment);
     if not exists(select 1 from learning.episode_moments where id=moment and episode_id=ep and learner_id=actor) then raise exception 'Moment does not belong to episode/caller' using errcode='42501'; end if;
   elsif quality_name='transcript' and exists(select 1 from learning.episode_moments where episode_id=ep and learner_id=actor) then
     raise exception 'A captured moment reference is required' using errcode='22023';
   end if;
   if jsonb_typeof(obs->'evidence') is distinct from 'array' or jsonb_array_length(obs->'evidence')>100 then raise exception 'Invalid evidence list' using errcode='22023'; end if;
   res:=nullif(obs->'residue','null'::jsonb);
   if (jsonb_array_length(obs->'evidence')>0)=(res is not null) then raise exception 'Observation must write evidence OR residue' using errcode='22023'; end if;
   ev_index:=0;
   for ev in select value from jsonb_array_elements(obs->'evidence') loop
     cap:=ev->>'capability_id';
     if cap is not null and not exists(select 1 from learning.capabilities where id=cap and retired_in is null) then raise exception 'Capability is outside current vocabulary' using errcode='22023'; end if;
     select * into claim_row from learning.claims where id=(ev->>'claim_id')::uuid and learner_id=actor;
     if not found then raise exception 'Claim is not owned by caller' using errcode='42501'; end if;
     if claim_row.claim_template_id is not null then
       select capability_id into linked_cap from learning.claim_templates where id=claim_row.claim_template_id and retired_in is null;
       if not found or linked_cap is distinct from cap then raise exception 'Claim template does not match current capability' using errcode='40001'; end if;
     end if;
     if length(trim(coalesce(ev->>'observed',''))) not between 1 and 4000 or ev->>'actor' not in ('learner','agent','mixed','unknown')
       or ev->>'direction' not in ('supports','weakens','neutral') or ev->>'strength' not in ('weak','medium','strong')
       or ev->>'confidence' is null or (ev->>'confidence')::numeric not between 0 and 1 then raise exception 'Invalid evidence observation' using errcode='22023'; end if;
     ev_index:=ev_index+1;
     row_id:=md5(jsonb_build_array(actor,ep,pass,observation_key,'evidence',ev_index)::text)::uuid;
     insert into learning.evidence(id,learner_id,claim_id,episode_id,moment_id,observed,actor,direction,strength,confidence,status,misconception_id,provenance)
     values(row_id,actor,claim_row.id,ep,moment,ev->>'observed',ev->>'actor',ev->>'direction',ev->>'strength',(ev->>'confidence')::numeric,'active',ev#>>'{misconception_refs,0,misconception_id}',
       base_provenance||jsonb_build_object('pass_id',pass,'pass_at',p_request->>'pass_at','ontology_version',version_no,'quality',quality_name,'observation_id',observation_key,'capability_id',cap,'episode_id',ep));
     evidence_ids:=array_append(evidence_ids,row_id);
   end loop;
   if res is not null then
     if jsonb_typeof(res)<>'object' or length(trim(coalesce(res->>'candidate',''))) not between 1 and 4000 or length(coalesce(res->>'suggested_label',''))>500 then raise exception 'Invalid residue observation' using errcode='22023'; end if;
     cap:=res->>'nearest_capability_id';
     if cap is not null and not exists(select 1 from learning.capabilities where id=cap and retired_in is null) then raise exception 'Nearest capability is outside current vocabulary' using errcode='22023'; end if;
     row_id:=md5(jsonb_build_array(actor,ep,pass,observation_key,'residue')::text)::uuid;
     insert into learning.residue(id,learner_id,episode_id,moment_id,candidate,suggested_label,nearest_capability_id,nearest_score,pass_id,pass_at,ontology_version,quality)
     values(row_id,actor,ep,moment,res->>'candidate',res->>'suggested_label',cap,(res->>'nearest_score')::numeric,pass,pass_time,version_no,quality_name);
     residue_ids:=array_append(residue_ids,row_id);
   end if;
 end loop;
 result_json:=jsonb_build_object('evidence_inserted',cardinality(evidence_ids),'residue_inserted',cardinality(residue_ids),'evidence_ids',to_jsonb(evidence_ids),'residue_ids',to_jsonb(residue_ids));
 insert into learning.extraction_passes(learner_id,episode_id,pass_id,request,result) values(actor,ep,pass,p_request,result_json);
 return result_json;
end $$;
revoke all on function learning.record_extraction_pass(jsonb) from public,anon,service_role;
grant execute on function learning.record_extraction_pass(jsonb) to authenticated;
-- Generic caller metadata for complete-export rollout validation. No row data.
create or replace function learning.export_inventory()
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
begin
 if current_user<>'authenticated' or itera.current_itera_user_id() is null then raise exception 'An authenticated caller identity is required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(c.relname order by c.relname),'[]'::jsonb)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='learning' and c.relkind in ('r','p') and not c.relispartition);
end $$;
revoke all on function learning.export_inventory() from public,anon,service_role;
grant execute on function learning.export_inventory() to authenticated;
comment on function learning.export_inventory() is 'Caller-only table-name metadata for complete export. No arguments, schema choice or learner-row access.';
notify pgrst,'reload schema';
commit;
