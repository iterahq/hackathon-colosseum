-- Origin: agent. T15 residue-only re-pass; editorial decisions never change.
-- Internal immutable receipts derive consumption/retry state. No episode SELECT.
-- Fail-fast lock order: claims/objectives SHARE NOWAIT, learner try-lock,
-- ontology try-lock, ordered residue FOR UPDATE NOWAIT. READ COMMITTED only.
begin;
create table if not exists learning.residue_repasses (
 learner_id uuid not null references learning.learners(id) on delete cascade,
 episode_id uuid not null,
 pass_id text not null check(length(pass_id) between 4 and 200 and pass_id like 'rr:%'),
 request jsonb not null check(jsonb_typeof(request)='object' and octet_length(request::text)<=524288),
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(learner_id,episode_id,pass_id),
 foreign key(episode_id,learner_id) references learning.work_episodes(id,learner_id) on delete cascade
);
alter table learning.residue_repasses enable row level security;
drop policy if exists residue_repasses_own on learning.residue_repasses;
create policy residue_repasses_own on learning.residue_repasses for all to authenticated
 using(learner_id=itera.current_itera_user_id()) with check(learner_id=itera.current_itera_user_id());
revoke all on learning.residue_repasses from public,anon,authenticated,service_role;
grant select,insert on learning.residue_repasses to authenticated;
create index if not exists residue_repasses_source_lookup on learning.residue_repasses using gin(request jsonb_path_ops);

create or replace function learning.lock_residue_repass()
returns void language plpgsql security invoker set search_path=pg_catalog,learning,itera as $$
declare actor uuid:=itera.current_itera_user_id();
begin
 if current_user<>'authenticated' or actor is null then raise exception 'An authenticated caller identity is required' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Residue re-pass requires READ COMMITTED' using errcode='25000'; end if;
 lock table learning.claims,learning.learning_objectives in share mode nowait;
 if not pg_try_advisory_xact_lock(hashtextextended('learning.evidence.status:'||actor::text,0)) then raise exception 'Evidence writer busy; retry later' using errcode='55P03'; end if;
 if not pg_try_advisory_xact_lock(20260903,82) then raise exception 'Editorial writer busy; retry later' using errcode='55P03'; end if;
end $$;

-- A fresh context comes from residue, active owned claims and vocabulary only.
-- A zero-match receipt suppresses only identical source/map/claim inputs.
create or replace function learning.residue_repass_context(p_episode_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,learning,itera as $$
declare actor uuid:=itera.current_itera_user_id(); version_no integer; claims_json jsonb; caps jsonb; claim_hash text; sources jsonb;
begin
 perform learning.lock_residue_repass();
 select max(version) into version_no from learning.ontology_versions;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'description',c.description,'claim_template_id',c.claim_template_id,'capability_id',t.capability_id) order by c.id),'[]'::jsonb)
 into claims_json from learning.claims c left join learning.learning_objectives o on o.id=c.objective_id and o.learner_id=actor
 left join learning.claim_templates t on t.id=c.claim_template_id and t.retired_in is null
 where c.learner_id=actor and (c.objective_id is null or o.status='active') and (c.claim_template_id is null or t.id is not null);
 claim_hash:=encode(sha256(convert_to(claims_json::text,'UTF8')),'hex');
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title) order by id),'[]'::jsonb) into caps from learning.capabilities where retired_in is null;
 perform id from learning.residue where learner_id=actor and episode_id=p_episode_id order by id for update nowait;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'fingerprint',encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex'),'row',to_jsonb(r)) order by r.id),'[]'::jsonb)
 into sources from learning.residue r
 where r.learner_id=actor and r.episode_id=p_episode_id
 and (r.status='promoted' or (r.status='open' and r.ontology_version<version_no))
 and not exists(select 1 from learning.residue_repasses p cross join lateral jsonb_array_elements(p.request->'observations') obs
   where p.learner_id=actor and obs->>'source_id'=r.id::text
   and (jsonb_array_length(obs->'evidence')>0 or
    ((p.request#>>'{context,ontology_version}')::integer=version_no
     and p.request#>>'{context,claim_set_fingerprint}'=claim_hash
     and exists(select 1 from jsonb_array_elements(p.request#>'{context,sources}') source
       where source->>'id'=r.id::text and source->>'fingerprint'=encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex')))));
 if jsonb_array_length(sources)>100 then raise exception 'Episode has more than100 eligible residue rows; explicit batching contract required' using errcode='54000'; end if;
 return jsonb_build_object('episode_id',p_episode_id,'ontology_version',version_no,'claim_set_fingerprint',claim_hash,'claims',claims_json,'capabilities',caps,'sources',sources);
end $$;

-- The INSERT trigger owns the writes. Direct receipt INSERT executes the same
-- checks and atomic write, rather than accepting caller-asserted success rows.
create or replace function learning.write_residue_repass()
returns trigger language plpgsql security invoker set search_path=pg_catalog,learning,itera set timezone='UTC' as $$
declare actor uuid:=itera.current_itera_user_id(); context_json jsonb; source jsonb; obs jsonb; ev jsonb; cap text; claim_json jsonb;
 row_id uuid; moment uuid; seen uuid[]:='{}'; source_id uuid; evidence_ids uuid[]:='{}'; claim_ids uuid[]:='{}'; outcomes jsonb:='[]';
 ev_index integer; pass_time timestamptz; quality_name text; version_no integer; expected_provenance jsonb;
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
   insert into learning.evidence(id,learner_id,claim_id,episode_id,moment_id,observed,actor,direction,strength,confidence,status,misconception_id,provenance)
   values(row_id,actor,(claim_json->>'id')::uuid,new.episode_id,moment,ev->>'observed',ev->>'actor',ev->>'direction',ev->>'strength',(ev->>'confidence')::numeric,'active',ev->>'misconception_id',expected_provenance);
   evidence_ids:=array_append(evidence_ids,row_id);claim_ids:=array_append(claim_ids,(claim_json->>'id')::uuid);
  end loop;
  outcomes:=outcomes||jsonb_build_array(jsonb_build_object('source_id',source_id,'outcome',case when ev_index>0 then 'matched' else 'unmatched' end,'evidence_inserted',ev_index));
 end loop;
 select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into claim_ids from unnest(claim_ids) id;
 new.result:=jsonb_build_object('evidence_inserted',cardinality(evidence_ids),'evidence_ids',evidence_ids,'affected_claim_ids',claim_ids,'outcomes',outcomes,
 'episodes_read',0,'residue_rows_read',cardinality(seen),'residue_rows_updated',0);
 return new;
end $$;
drop trigger if exists residue_repass_write on learning.residue_repasses;
create trigger residue_repass_write before insert on learning.residue_repasses for each row execute function learning.write_residue_repass();

create or replace function learning.record_residue_repass(p_request jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,learning,itera as $$
declare actor uuid:=itera.current_itera_user_id(); saved learning.residue_repasses%rowtype; ep uuid; pass text; result_json jsonb;
begin
 perform learning.lock_residue_repass();
 ep:=(p_request->>'episode_id')::uuid; pass:=p_request->>'pass_id';
 select * into saved from learning.residue_repasses where learner_id=actor and episode_id=ep and pass_id=pass;
 if found then
  if saved.request is distinct from p_request then raise exception 'Re-pass retry payload conflicts' using errcode='23505'; end if;
  return saved.result;
 end if;
 insert into learning.residue_repasses(learner_id,episode_id,pass_id,request,result) values(actor,ep,pass,p_request,'{}') returning result into result_json;
 return result_json;
end $$;
revoke all on function learning.lock_residue_repass() from public,anon,service_role;
revoke all on function learning.residue_repass_context(uuid) from public,anon,service_role;
revoke all on function learning.write_residue_repass() from public,anon,authenticated,service_role;
revoke all on function learning.record_residue_repass(jsonb) from public,anon,service_role;
grant execute on function learning.lock_residue_repass(),learning.residue_repass_context(uuid),learning.record_residue_repass(jsonb) to authenticated;
comment on table learning.residue_repasses is 'Internal immutable residue-only matched/unmatched receipts. Editorial residue fields stay unchanged. Exact retries precede fresh eligibility. Zero episode input reads excludes implicit FK/RLS/index work; state refresh is a distinct operation.';
notify pgrst,'reload schema';
commit;
