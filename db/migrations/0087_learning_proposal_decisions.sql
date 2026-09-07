-- Origin: agent
-- T16: append proposal-bound editorial decisions to the caller-JWT RPC.
-- Preserve 0082's checksum and all seven existing operation contracts.
-- No data rows are inserted by this migration. Fixtures stay in local tests.
begin;

create or replace function learning.apply_dml(p_operation text, p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, learning, itera
as $$
declare
  caller uuid := itera.current_itera_user_id();
  allowed text[];
  required text[];
  key text;
  value jsonb;
  patch jsonb;
  ids text[];
  uuids uuid[];
  destination text;
  objective uuid;
  version_number integer;
  affected integer;
  result jsonb;
  record_row record;
  proposal_row learning.capability_proposals%rowtype;
  proposal_id uuid;
  cluster_ids uuid[];
  decision text;
  override_values jsonb;
  capability_title text;
  capability_description text;
  capability_result jsonb;
begin
  -- Check the SQL role too: an elevated bearer is not a user session.
  if current_user <> 'authenticated' or caller is null then
    raise exception using errcode='42501', message='A regular Itera user session is required';
  end if;
  if not exists(select 1 from learning.learners where id=caller) then
    raise exception using errcode='42501', message='A registered learner is required';
  end if;
  if p_operation = any(array['approve_proposal','merge_proposal','reject_proposal','promote_residue','dismiss_residue']) then
    if not itera.is_learning_operator() then
      raise exception using errcode='42501', message='An operator session is required';
    end if;
    case p_operation
      when 'approve_proposal' then allowed:=array['id','capability']; required:=array['id'];
      when 'merge_proposal' then allowed:=array['id','into_capability_id']; required:=allowed;
      when 'reject_proposal' then allowed:=array['id','reason']; required:=allowed;
      when 'promote_residue' then allowed:=array['proposal_id','residue_ids','into']; required:=allowed;
      when 'dismiss_residue' then allowed:=array['proposal_id','residue_ids','reason']; required:=allowed;
    end case;
    if p_payload is null or jsonb_typeof(p_payload)<>'object' then
      raise exception using errcode='22023', message='An object body is required';
    end if;
    if exists(select 1 from jsonb_object_keys(p_payload) k where not k=any(allowed))
       or exists(select 1 from unnest(required) k where not p_payload ? k or p_payload->k='null'::jsonb) then
      raise exception using errcode='22023', message='Unexpected or missing decision fields';
    end if;
    foreach key in array array['id','proposal_id','into','into_capability_id','reason'] loop
      if p_payload ? key and (jsonb_typeof(p_payload->key)<>'string'
        or length(btrim(p_payload->>key)) not between 1 and (case when key='reason' then 4000 else 200 end)) then
        raise exception using errcode='22023', message='Invalid decision text';
      end if;
    end loop;
    proposal_id:=(coalesce(p_payload->>'id',p_payload->>'proposal_id'))::uuid;
    override_values:=coalesce(p_payload->'capability','{}'::jsonb);
    if p_payload ? 'capability' then
      if jsonb_typeof(override_values)<>'object' or override_values='{}'::jsonb then
        raise exception using errcode='22023', message='A nonempty capability override is required';
      end if;
      for key,value in select * from jsonb_each(override_values) loop
        if not key=any(array['id','title','description']) then
          raise exception using errcode='22023', message='Unknown capability override';
        end if;
        if key='description' and value='null'::jsonb then continue; end if;
        if jsonb_typeof(value)<>'string'
           or (key='description' and length(override_values->>key)>4000)
           or (key<>'description' and length(btrim(override_values->>key)) not between 1 and (case when key='title' then 500 else 200 end)) then
          raise exception using errcode='22023', message='Invalid capability override';
        end if;
      end loop;
    end if;
    if p_payload ? 'residue_ids' then
      value:=p_payload->'residue_ids';
      if jsonb_typeof(value)<>'array' then raise exception using errcode='22023', message='A residue id array is required'; end if;
      if jsonb_array_length(value) not between 1 and 100 or exists(select 1 from jsonb_array_elements(value) x where jsonb_typeof(x)<>'string') then
        raise exception using errcode='22023', message='Expected 1 to 100 residue ids';
      end if;
      select array_agg(x::uuid) into uuids from jsonb_array_elements_text(value) x;
      if cardinality(uuids)<>(select count(distinct x) from unnest(uuids) x) then
        raise exception using errcode='22023', message='Duplicate residue ids';
      end if;
    end if;

    -- The same lock as 0082 editorial writes and 0085 extraction validation.
    -- All decision locks follow it: proposal, sorted residue, then target.
    perform pg_advisory_xact_lock(20260903,82);
    select * into proposal_row from learning.capability_proposals where id=proposal_id for update;
    if not found then raise exception using errcode='P0002', message='No available proposal'; end if;
    if proposal_row.status<>'proposed' or proposal_row.decided_by is not null or proposal_row.decided_at is not null
       or proposal_row.capability_id is not null or proposal_row.ontology_version is not null or proposal_row.decision_note is not null then
      raise exception using errcode='P0001', message='The proposal was already decided or changed';
    end if;
    cluster_ids:=proposal_row.residue_ids;
    if cardinality(cluster_ids) not between 1 and 100
       or cardinality(cluster_ids)<>(select count(distinct x) from unnest(cluster_ids) x) then
      raise exception using errcode='22023', message='Invalid stored proposal cluster';
    end if;
    if p_payload ? 'residue_ids' and not (uuids @> cluster_ids and cluster_ids @> uuids) then
      raise exception using errcode='22023', message='The alias must name the full proposal cluster';
    end if;
    perform id from learning.residue where id=any(cluster_ids) order by id for update;
    get diagnostics affected=row_count;
    if affected<>cardinality(cluster_ids) then raise exception using errcode='P0002', message='A proposal residue row is unavailable'; end if;
    if exists(select 1 from learning.residue where id=any(cluster_ids) and
        (status<>'open' or promoted_to_capability_id is not null or promoted_by is not null or promoted_at is not null)) then
      raise exception using errcode='P0001', message='The proposal residue was already decided or changed';
    end if;
    decision:=case p_operation when 'promote_residue' then 'merge_proposal' when 'dismiss_residue' then 'reject_proposal' else p_operation end;
    if decision='approve_proposal' then
      destination:=btrim(coalesce(override_values->>'id',proposal_row.proposed_id));
      capability_title:=btrim(coalesce(override_values->>'title',proposal_row.title));
      capability_description:=case when override_values ? 'description' then override_values->>'description' else proposal_row.description end;
      if destination is null or length(destination) not between 1 and 200
         or capability_title is null or length(capability_title) not between 1 and 500
         or length(capability_description)>4000 then
        raise exception using errcode='22023', message='Approval requires a capability id and valid title/description';
      end if;
      select coalesce(max(version),0)+1 into version_number from learning.ontology_versions;
      insert into learning.ontology_versions(version,created_by,note)
        values(version_number,caller,'Approved capability proposal '||proposal_id::text);
      insert into learning.capabilities(id,learner_id,title,description,source,introduced_in)
        values(destination,null,capability_title,capability_description,jsonb_build_object('kind','promoted','proposal_id',proposal_id),version_number)
        returning to_jsonb(capabilities.*) into capability_result;
    elsif decision='merge_proposal' then
      destination:=btrim(coalesce(p_payload->>'into_capability_id',p_payload->>'into'));
      perform id from learning.capabilities where id=destination and learner_id is null and retired_in is null for update;
      if not found then raise exception using errcode='P0002', message='The target must be a current shared capability'; end if;
    end if;
    if decision='reject_proposal' then
      update learning.residue set status='dismissed' where id=any(cluster_ids);
    else
      update learning.residue set status='promoted',promoted_to_capability_id=destination,promoted_by=caller,promoted_at=now()
        where id=any(cluster_ids);
    end if;
    get diagnostics affected=row_count;
    if affected<>cardinality(cluster_ids) then raise exception using errcode='42501', message='A residue decision was refused'; end if;
    update learning.capability_proposals set
      status=case decision when 'approve_proposal' then 'approved' when 'merge_proposal' then 'merged' else 'rejected' end,
      capability_id=destination,ontology_version=version_number,
      decided_by=caller,decided_at=now(),decision_note=case when decision='reject_proposal' then btrim(p_payload->>'reason') else null end
      where id=proposal_id returning to_jsonb(capability_proposals.*) into result;
    if not found then raise exception using errcode='42501', message='The proposal decision was refused'; end if;
    if decision='approve_proposal' then
      return jsonb_build_object('proposal',result,'capability',capability_result,'ontology_version',version_number,'residue_updated',affected);
    elsif decision='merge_proposal' then
      return jsonb_build_object('proposal',result,'capability_id',destination,'residue_updated',affected);
    end if;
    return jsonb_build_object('proposal',result,'residue_updated',affected);
  end if;

  case p_operation
    when 'create_capability' then
      allowed := array['id','title','description']; required := array['id','title'];
    when 'merge_capabilities' then
      allowed := array['from','into','reason']; required := allowed;
    when 'create_claim_template' then
      allowed := array['capability_id','statement','description']; required := array['statement'];
    when 'instantiate_claim' then
      allowed := array['claim_template_id','objective_id','sort_order']; required := array['claim_template_id','objective_id'];
    when 'reparent_claims' then
      allowed := array['claim_ids','objective_id']; required := allowed;
    when 'update_evidence_model' then
      allowed := array['id','patch']; required := allowed;
    when 'propose_capability' then
      allowed := array['residue_ids','title','description','nearest_capability_id']; required := array['residue_ids','title'];
    else raise exception using errcode='22023', message='Unknown learning operation';
  end case;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode='22023', message='An object body is required';
  end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where not k=any(allowed))
     or exists(select 1 from unnest(required) k where not p_payload ? k or p_payload->k='null'::jsonb) then
    raise exception using errcode='22023', message='Unexpected or missing fields';
  end if;
  for key,value in select * from jsonb_each(p_payload) loop
    if key=any(array['id','into','capability_id','nearest_capability_id','title','statement','description','reason','claim_template_id','objective_id']) then
      if value='null'::jsonb and key=any(array['capability_id','nearest_capability_id','description']) then continue; end if;
      if jsonb_typeof(value)<>'string' then raise exception using errcode='22023', message='A text field has the wrong type'; end if;
      if key<>'description' and length(btrim(p_payload->>key))=0 then raise exception using errcode='22023', message='Blank text is not allowed'; end if;
      if length(p_payload->>key)>(case when key=any(array['description','reason']) then 4000 when key=any(array['title','statement']) then 500 else 200 end) then
        raise exception using errcode='22023', message='A text field is too long';
      end if;
    end if;
  end loop;
  foreach key in array array['claim_template_id','objective_id'] loop
    if p_payload ? key then perform (p_payload->>key)::uuid; end if;
  end loop;
  if p_operation='update_evidence_model' then perform (p_payload->>'id')::uuid; end if;
  if p_operation=any(array['create_capability','merge_capabilities','create_claim_template','update_evidence_model'])
     and not itera.is_learning_operator() then
    raise exception using errcode='42501', message='An operator session is required';
  end if;
  if p_payload ? 'sort_order' and (jsonb_typeof(p_payload->'sort_order')<>'number'
     or (p_payload->>'sort_order')::numeric<>trunc((p_payload->>'sort_order')::numeric)
     or (p_payload->>'sort_order')::numeric not between -1000 and 1000) then
    raise exception using errcode='22023', message='Invalid sort order';
  end if;
  if p_operation=any(array['merge_capabilities','reparent_claims','propose_capability']) then
    key := case p_operation when 'merge_capabilities' then 'from' when 'reparent_claims' then 'claim_ids' else 'residue_ids' end;
    value := p_payload->key;
    if jsonb_typeof(value)<>'array' then raise exception using errcode='22023', message='An id array is required'; end if;
    if jsonb_array_length(value) not between 1 and 100 or exists(select 1 from jsonb_array_elements(value) x where jsonb_typeof(x)<>'string') then
      raise exception using errcode='22023', message='Expected 1 to 100 text ids';
    end if;
    select array_agg(btrim(x)) into ids from jsonb_array_elements_text(value) x;
    if exists(select 1 from unnest(ids) x where length(x) not between 1 and 200)
       or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then
      raise exception using errcode='22023', message='Ids must be distinct and nonempty';
    end if;
    if p_operation<>'merge_capabilities' then
      select array_agg(x::uuid) into uuids from unnest(ids) x;
      if cardinality(uuids)<>(select count(distinct x) from unnest(uuids) x) then
        raise exception using errcode='22023', message='Duplicate UUIDs are not allowed';
      end if;
    end if;
  end if;

  -- One lock protects max(version)+1 and the capabilities/templates examined
  -- in each editorial transaction. A failed transaction consumes no version.
  if p_operation=any(array['create_capability','merge_capabilities','create_claim_template']) then
    perform pg_advisory_xact_lock(20260903,82);
    select coalesce(max(version),0)+1 into version_number from learning.ontology_versions;
  end if;

  case p_operation
    when 'create_capability' then
      insert into learning.ontology_versions(version,created_by,note)
        values(version_number,caller,'Created capability '||btrim(p_payload->>'id'));
      insert into learning.capabilities(id,learner_id,title,description,source,introduced_in)
        values(btrim(p_payload->>'id'),null,btrim(p_payload->>'title'),p_payload->>'description',jsonb_build_object('kind','editorial'),version_number)
        returning to_jsonb(capabilities.*) into result;
      return jsonb_build_object('capability',result,'ontology_version',version_number);

    when 'merge_capabilities' then
      destination:=btrim(p_payload->>'into');
      if destination=any(ids) then raise exception using errcode='22023', message='The merge target cannot be a source'; end if;
      perform id from learning.capabilities where id=any(array_append(ids,destination)) and learner_id is null and retired_in is null order by id for update;
      get diagnostics affected=row_count;
      if affected<>cardinality(ids)+1 then raise exception using errcode='P0002', message='Every source and target must be a current shared capability'; end if;
      insert into learning.ontology_versions(version,created_by,note,reason)
        values(version_number,caller,'Merged capabilities into '||destination,btrim(p_payload->>'reason'));
      update learning.capabilities set retired_in=version_number,updated_at=now(),source=source||jsonb_build_object('merged_into',destination)
        where id=any(ids);
      get diagnostics affected=row_count;
      if affected<>cardinality(ids) then raise exception using errcode='42501', message='A capability update was refused'; end if;
      update learning.claim_templates set capability_id=destination where capability_id=any(ids);
      get diagnostics affected=row_count;
      return jsonb_build_object('into',destination,'retired_ids',to_jsonb(ids),'templates_reparented',affected,'ontology_version',version_number);

    when 'create_claim_template' then
      if p_payload->>'capability_id' is not null and not exists(select 1 from learning.capabilities where id=btrim(p_payload->>'capability_id') and learner_id is null and retired_in is null) then
        raise exception using errcode='P0002', message='The capability must be current and shared';
      end if;
      insert into learning.ontology_versions(version,created_by,note)
        values(version_number,caller,'Created claim template');
      insert into learning.claim_templates(capability_id,statement,description,introduced_in,created_by)
        values(btrim(p_payload->>'capability_id'),btrim(p_payload->>'statement'),p_payload->>'description',version_number,caller)
        returning to_jsonb(claim_templates.*) into result;
      return jsonb_build_object('claim_template',result,'ontology_version',version_number);

    when 'instantiate_claim' then
      perform pg_advisory_xact_lock(20260903,82);
      objective:=(p_payload->>'objective_id')::uuid;
      perform id from learning.learning_objectives where id=objective and learner_id=caller for share;
      if not found then raise exception using errcode='P0002', message='No owned objective'; end if;
      select * into record_row from learning.claim_templates where id=(p_payload->>'claim_template_id')::uuid and retired_in is null;
      if not found then raise exception using errcode='P0002', message='No current claim template'; end if;
      if record_row.capability_id is not null and not exists(select 1 from learning.capabilities where id=record_row.capability_id and learner_id is null and retired_in is null) then
        raise exception using errcode='P0002', message='The template capability is unavailable';
      end if;
      if exists(select 1 from learning.claims where objective_id=objective and claim_template_id=record_row.id and learner_id=caller) then
        raise exception using errcode='23505', message='The objective already has this claim template';
      end if;
      insert into learning.claims(objective_id,learner_id,title,description,sort_order,claim_template_id)
        values(objective,caller,record_row.statement,record_row.description,coalesce((p_payload->>'sort_order')::numeric::integer,0),record_row.id)
        returning to_jsonb(claims.*) into result;
      return jsonb_build_object('claim',result);

    when 'reparent_claims' then
      objective:=(p_payload->>'objective_id')::uuid;
      perform id from learning.learning_objectives where id=objective and learner_id=caller for share;
      if not found then raise exception using errcode='P0002', message='No owned objective'; end if;
      -- Full row locks prevent concurrent dependent inserts while we inspect
      -- the claims. A measured claim cannot silently change its objective.
      perform id from learning.claims where id=any(uuids) and learner_id=caller order by id for update;
      get diagnostics affected=row_count;
      if affected<>cardinality(uuids) then raise exception using errcode='P0002', message='Every claim must belong to the caller'; end if;
      if exists(select 1 from learning.evidence where claim_id=any(uuids))
         or exists(select 1 from learning.learner_state where claim_id=any(uuids))
         or exists(select 1 from learning.learner_state_history where claim_id=any(uuids))
         or exists(select 1 from learning.activities where claim_id=any(uuids)) then
        raise exception using errcode='P0001', message='Measured claims cannot change objective';
      end if;
      with changed as (update learning.claims set objective_id=objective where id=any(uuids) and learner_id=caller returning *)
        select jsonb_agg(to_jsonb(changed) order by id),count(*) into result,affected from changed;
      if affected<>cardinality(uuids) then raise exception using errcode='42501', message='A claim update was refused'; end if;
      return jsonb_build_object('claims',result);

    when 'update_evidence_model' then
      patch:=p_payload->'patch';
      if jsonb_typeof(patch)<>'object' or patch='{}'::jsonb then raise exception using errcode='22023', message='A nonempty model patch is required'; end if;
      for key,value in select * from jsonb_each(patch) loop
        if key='title' then
          if value<>'null'::jsonb and (jsonb_typeof(value)<>'string' or length(btrim(patch->>key)) not between 1 and 500) then
            raise exception using errcode='22023', message='Invalid model title';
          end if;
        elsif key=any(array['decay_half_life_days','strong_min_distinct_episodes','strong_min_distinct_projects','per_episode_cap']) then
          if jsonb_typeof(value)<>'number' then raise exception using errcode='22023', message='Invalid calibration type'; end if;
          if key=any(array['strong_min_distinct_episodes','strong_min_distinct_projects']) then
            if (patch->>key)::numeric<1 or (patch->>key)::numeric<>trunc((patch->>key)::numeric) or (patch->>key)::numeric>2147483647 then
              raise exception using errcode='22023', message='Invalid calibration count';
            end if;
          elsif (key='decay_half_life_days' and (patch->>key)::numeric<=0) or (key='per_episode_cap' and (patch->>key)::numeric<0) then raise exception using errcode='22023', message='Calibration must be positive'; end if;
        else raise exception using errcode='22023', message='Unknown model patch field';
        end if;
      end loop;
      update learning.evidence_models set
        title=case when patch ? 'title' then btrim(patch->>'title') else title end,
        decay_half_life_days=coalesce((patch->>'decay_half_life_days')::numeric,decay_half_life_days),
        strong_min_distinct_episodes=coalesce((patch->>'strong_min_distinct_episodes')::numeric::integer,strong_min_distinct_episodes),
        strong_min_distinct_projects=coalesce((patch->>'strong_min_distinct_projects')::numeric::integer,strong_min_distinct_projects),
        per_episode_cap=coalesce((patch->>'per_episode_cap')::numeric,per_episode_cap),
        updated_by=caller,updated_at=now()
        where id=(p_payload->>'id')::uuid returning to_jsonb(evidence_models.*) into result;
      if not found then raise exception using errcode='P0002', message='No writable evidence model'; end if;
      return jsonb_build_object('evidence_model',result);

    when 'propose_capability' then
      perform id from learning.residue where id=any(uuids) and learner_id=caller and status='open' order by id for share;
      get diagnostics affected=row_count;
      if affected<>cardinality(uuids) then raise exception using errcode='P0002', message='Every residue row must be open and belong to the caller'; end if;
      if p_payload->>'nearest_capability_id' is not null and not exists(select 1 from learning.capabilities where id=btrim(p_payload->>'nearest_capability_id') and learner_id is null and retired_in is null) then
        raise exception using errcode='P0002', message='The nearest capability must be current and shared';
      end if;
      insert into learning.capability_proposals(title,description,residue_ids,nearest_capability_id,proposed_by_kind,proposed_by,status)
        values(btrim(p_payload->>'title'),p_payload->>'description',uuids,btrim(p_payload->>'nearest_capability_id'),'agent',caller::text,'proposed')
        returning to_jsonb(capability_proposals.*) into result;
      return jsonb_build_object('proposal',result);
  end case;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode='22023', message='Invalid learning operation value';
end;
$$;

revoke all on function learning.apply_dml(text,jsonb) from public,anon,service_role;
grant execute on function learning.apply_dml(text,jsonb) to authenticated;
comment on function learning.apply_dml(text,jsonb) is
  'Caller-JWT learning mutations, SECURITY INVOKER. Validates direct RPC callers and applies each operation atomically. Editorial writes require is_learning_operator(). Proposal-bound decisions use the shared ontology lock and never write evidence.';
commit;
notify pgrst,'reload schema';
