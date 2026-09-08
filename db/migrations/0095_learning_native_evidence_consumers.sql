-- Origin: agent. Native SQL consumers after the0094 compatibility bridge.
-- Immutable request JSON remains the RPC wire contract. No rows or JSON removed.
-- Existing function ACLs, caller checks, lock order and receipt equality remain.
begin;
create or replace function learning.evidence_metadata_from_json(value jsonb)
returns learning.evidence language plpgsql immutable parallel safe security invoker
set search_path=pg_catalog,learning as $$
declare result learning.evidence;
begin
 if value is null or jsonb_typeof(value)<>'object' then
  raise exception 'Evidence metadata must be an object' using errcode='22023';
 end if;
 result.extractor:=value->>'extractor';
 result.prompt_version:=value->>'prompt_version';
 result.model:=value->>'model';
 result.model_version:=value->>'model_version';
 result.relevance_extractor:=value->>'relevance_extractor';
 result.relevance_model:=value->>'relevance_model';
 result.activity_id:=value->>'activity_id';
 result.activity_kind:=value->>'activity_kind';
 result.source:=value->>'source';
 result.surface:=value->>'surface';
 result.assessment_method:=value->>'assessment_method';
 result.pass_id:=value->>'pass_id';
 result.pass_at:=value->>'pass_at';
 result.ontology_version:=learning.evidence_metadata_integer(value->'ontology_version');
 result.quality:=value->>'quality';
 result.observation_id:=value->>'observation_id';
 result.capability_id:=value->>'capability_id';
 result.provider:=value->>'provider';
 result.source_residue_id:=value->>'source_residue_id';
 result.source_pass_id:=value->>'source_pass_id';
 result.digest_dropped_chars:=learning.evidence_metadata_integer(value->'digest_dropped_chars');
 result.digest_backfill:=value->'digest_backfill';
 result.source_episode_ref:=value->>'episode_id';
 result.source_activity_response_ref:=value->>'activity_response_id';
 result.source_metadata_keys:=learning.evidence_metadata_keys(value);
 if learning.native_evidence_metadata(result)::text is distinct from value::text then
  raise exception 'Evidence metadata cannot be represented losslessly' using errcode='22023';
 end if;
 return result;
end $$;
revoke all on function learning.evidence_metadata_from_json(jsonb) from public,anon,service_role;
grant execute on function learning.evidence_metadata_from_json(jsonb) to authenticated;


CREATE OR REPLACE FUNCTION learning.record_extraction_pass(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'learning', 'itera'
 SET "TimeZone" TO 'UTC'
AS $function$
declare
 actor uuid:=itera.current_itera_user_id(); ep uuid; pass text; pass_time timestamptz; version_no integer; quality_name text;
 saved learning.extraction_passes%rowtype; obs jsonb; ev jsonb; res jsonb; observation_key text; moment uuid;
 seen text[]:='{}'; seen_moments uuid[]:='{}'; evidence_ids uuid[]:='{}'; residue_ids uuid[]:='{}'; row_id uuid;
 claim_row learning.claims%rowtype; cap text; linked_cap text; result_json jsonb; ev_index integer;
 base_provenance jsonb; metadata_row learning.evidence;
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
     metadata_row:=learning.evidence_metadata_from_json(base_provenance||jsonb_build_object('pass_id',pass,'pass_at',p_request->>'pass_at','ontology_version',version_no,'quality',quality_name,'observation_id',observation_key,'capability_id',cap,'episode_id',ep));
     insert into learning.evidence(id,learner_id,claim_id,episode_id,moment_id,observed,actor,direction,strength,confidence,status,misconception_id,extractor,prompt_version,model,model_version,relevance_extractor,relevance_model,activity_id,activity_kind,source,surface,assessment_method,pass_id,pass_at,ontology_version,quality,observation_id,capability_id,provider,source_residue_id,source_pass_id,digest_dropped_chars,digest_backfill,source_episode_ref,source_activity_response_ref,source_metadata_keys)
     values(row_id,actor,claim_row.id,ep,moment,ev->>'observed',ev->>'actor',ev->>'direction',ev->>'strength',(ev->>'confidence')::numeric,'active',ev#>>'{misconception_refs,0,misconception_id}',
       metadata_row.extractor,metadata_row.prompt_version,metadata_row.model,metadata_row.model_version,metadata_row.relevance_extractor,metadata_row.relevance_model,metadata_row.activity_id,metadata_row.activity_kind,metadata_row.source,metadata_row.surface,metadata_row.assessment_method,metadata_row.pass_id,metadata_row.pass_at,metadata_row.ontology_version,metadata_row.quality,metadata_row.observation_id,metadata_row.capability_id,metadata_row.provider,metadata_row.source_residue_id,metadata_row.source_pass_id,metadata_row.digest_dropped_chars,metadata_row.digest_backfill,metadata_row.source_episode_ref,metadata_row.source_activity_response_ref,metadata_row.source_metadata_keys);
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
end $function$;

CREATE OR REPLACE FUNCTION learning.write_residue_repass()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'learning', 'itera'
 SET "TimeZone" TO 'UTC'
AS $function$
declare actor uuid:=itera.current_itera_user_id(); context_json jsonb; source jsonb; obs jsonb; ev jsonb; cap text; claim_json jsonb;
 row_id uuid; moment uuid; seen uuid[]:='{}'; source_id uuid; evidence_ids uuid[]:='{}'; claim_ids uuid[]:='{}'; outcomes jsonb:='[]';
 ev_index integer; pass_time timestamptz; quality_name text; version_no integer; expected_provenance jsonb; metadata_row learning.evidence;
begin
 perform learning.lock_residue_repass();
 if new.learner_id is distinct from actor or new.episode_id::text is distinct from new.request->>'episode_id' or new.pass_id is distinct from new.request->>'pass_id'
 or jsonb_typeof(new.request->'observations') is distinct from 'array' or jsonb_typeof(new.request->'provenance') is distinct from 'object'
 or octet_length(new.request::text)>524288 then raise exception 'Invalid residue re-pass identity or request' using errcode='22023'; end if;
 if new.pass_id not like 'rr:%' or length(new.pass_id) not between 4 and 200 then raise exception 'Invalid re-pass key' using errcode='22023'; end if;
 pass_time:=(new.request->>'pass_at')::timestamptz;
 if pass_time is null or not isfinite(pass_time) then raise exception 'Invalid re-pass time' using errcode='22023'; end if;
 context_json:=learning.residue_repass_context(new.episode_id);
 if context_json is distinct from new.request->'context' then raise exception 'Residue, claims or ontology changed; re-read inputs' using errcode='40001'; end if;
 if jsonb_array_length(context_json->'sources')=0 then raise exception 'No eligible residue sources' using errcode='22023'; end if;
 if jsonb_array_length(new.request->'observations')<>jsonb_array_length(context_json->'sources') then raise exception 'Every eligible source needs one outcome' using errcode='22023'; end if;
 version_no:=(context_json->>'ontology_version')::integer;
 for obs in select value from jsonb_array_elements(new.request->'observations') loop
  source_id:=(obs->>'source_id')::uuid;
  if source_id is null or source_id=any(seen) then raise exception 'Invalid or duplicate source' using errcode='22023'; end if;
  seen:=array_append(seen,source_id);
  select value->'row' into source from jsonb_array_elements(context_json->'sources') where value->>'id'=source_id::text;
  if not found then raise exception 'Source is outside eligible owned context' using errcode='42501'; end if;
  if jsonb_typeof(obs->'evidence') is distinct from 'array' or jsonb_array_length(obs->'evidence')>100 then raise exception 'Invalid evidence list' using errcode='22023'; end if;
  moment:=(source->>'moment_id')::uuid; quality_name:=source->>'quality'; ev_index:=0;
  for ev in select value from jsonb_array_elements(obs->'evidence') loop
   cap:=ev->>'capability_id';
   if cap is not null and not exists(select 1 from jsonb_array_elements(context_json->'capabilities') c where c->>'id'=cap) then raise exception 'Capability is outside current vocabulary' using errcode='22023'; end if;
   select value into claim_json from jsonb_array_elements(context_json->'claims') where value->>'id'=ev->>'claim_id';
   if not found then raise exception 'Claim is outside active owned claim set' using errcode='42501'; end if;
   if claim_json->>'claim_template_id' is not null and claim_json->>'capability_id' is distinct from cap then raise exception 'Claim template mismatch' using errcode='40001'; end if;
   if length(trim(coalesce(ev->>'observed',''))) not between 1 and 4000 or coalesce(ev->>'actor','') not in ('learner','agent','mixed','unknown')
    or coalesce(ev->>'direction','') not in ('supports','weakens','neutral') or coalesce(ev->>'strength','') not in ('weak','medium','strong')
    or ev->>'confidence' is null or (ev->>'confidence')::numeric not between 0 and 1 then raise exception 'Invalid evidence observation' using errcode='22023'; end if;
   ev_index:=ev_index+1;
   row_id:=md5(jsonb_build_array(actor,new.episode_id,new.pass_id,source_id,'residue-repass-evidence',ev_index)::text)::uuid;
   expected_provenance:=(new.request->'provenance')||jsonb_build_object('pass_id',new.pass_id,'pass_at',new.request->>'pass_at','ontology_version',version_no,'quality',quality_name,
    'observation_id',source_id,'source_residue_id',source_id,'source_pass_id',source->>'pass_id','capability_id',cap,'episode_id',new.episode_id);
   metadata_row:=learning.evidence_metadata_from_json(expected_provenance);
   insert into learning.evidence(id,learner_id,claim_id,episode_id,moment_id,observed,actor,direction,strength,confidence,status,misconception_id,extractor,prompt_version,model,model_version,relevance_extractor,relevance_model,activity_id,activity_kind,source,surface,assessment_method,pass_id,pass_at,ontology_version,quality,observation_id,capability_id,provider,source_residue_id,source_pass_id,digest_dropped_chars,digest_backfill,source_episode_ref,source_activity_response_ref,source_metadata_keys)
   values(row_id,actor,(claim_json->>'id')::uuid,new.episode_id,moment,ev->>'observed',ev->>'actor',ev->>'direction',ev->>'strength',(ev->>'confidence')::numeric,'active',ev->>'misconception_id',metadata_row.extractor,metadata_row.prompt_version,metadata_row.model,metadata_row.model_version,metadata_row.relevance_extractor,metadata_row.relevance_model,metadata_row.activity_id,metadata_row.activity_kind,metadata_row.source,metadata_row.surface,metadata_row.assessment_method,metadata_row.pass_id,metadata_row.pass_at,metadata_row.ontology_version,metadata_row.quality,metadata_row.observation_id,metadata_row.capability_id,metadata_row.provider,metadata_row.source_residue_id,metadata_row.source_pass_id,metadata_row.digest_dropped_chars,metadata_row.digest_backfill,metadata_row.source_episode_ref,metadata_row.source_activity_response_ref,metadata_row.source_metadata_keys);
   evidence_ids:=array_append(evidence_ids,row_id);claim_ids:=array_append(claim_ids,(claim_json->>'id')::uuid);
  end loop;
  outcomes:=outcomes||jsonb_build_array(jsonb_build_object('source_id',source_id,'outcome',case when ev_index>0 then 'matched' else 'unmatched' end,'evidence_inserted',ev_index));
 end loop;
 select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into claim_ids from unnest(claim_ids) id;
 new.result:=jsonb_build_object('evidence_inserted',cardinality(evidence_ids),'evidence_ids',evidence_ids,'affected_claim_ids',claim_ids,'outcomes',outcomes,
 'episodes_read',0,'residue_rows_read',cardinality(seen),'residue_rows_updated',0);
 return new;
end $function$;

CREATE OR REPLACE FUNCTION learning.validate_extraction_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'learning', 'itera'
AS $function$
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
    and learning.native_evidence_metadata(e) is not distinct from ((new.request->'provenance')||jsonb_build_object(
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
end $function$;

CREATE OR REPLACE FUNCTION learning.assert_digest_backfill_eligible(p_request jsonb, p_evidence_ids uuid[] DEFAULT '{}'::uuid[], p_residue_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'learning', 'itera'
 SET "TimeZone" TO 'UTC'
AS $function$
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
     and coalesce(nullif(e.pass_at,'')::timestamptz,e.created_at)>=t14_boundary) then
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

end $function$;

CREATE OR REPLACE FUNCTION learning.refresh_evidence_status_for_learner(target uuid, claim_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'learning', 'itera'
 SET "TimeZone" TO 'UTC'
AS $function$
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
      case when e.pass_id is not null and e.pass_id<>''
        then 'id:'||(e.pass_id) else 'at:'||(to_jsonb(created_at)#>>'{}') end as pass_key,
      case when e.pass_at is not null and e.pass_at<>''
        then e.pass_at else to_jsonb(created_at)#>>'{}' end as pass_order
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
$function$;

notify pgrst,'reload schema';
commit;
