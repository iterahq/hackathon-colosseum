-- T31: atomic caller-owned v2 session capture. No client release or data backfill.
begin;

create unique index if not exists uq_work_episodes_v2_protocol_id
  on learning.work_episodes(learner_id, (payload->>'id'))
  where schema_version=2;

create or replace function learning.ingest_episode_v2(
  p_episode jsonb, p_agent_version text, p_machine_class text
) returns jsonb language plpgsql security invoker
set search_path=pg_catalog,learning,itera
as $$
declare
  caller uuid := itera.current_itera_user_id();
  stored learning.work_episodes%rowtype;
  context_id uuid;
  episode_id uuid;
  moment_ids jsonb;
  moment jsonb;
  line jsonb;
  value jsonb;
  key text;
  start_at timestamptz;
  end_at timestamptz;
  moment_at timestamptz;
  previous_at timestamptz;
  root_path text;
  prefix text;
  moment_id uuid;
  ordinal integer := 0;
  refs text[];
  prompt_text text;
  summary_text text;
begin
  if current_user<>'authenticated' or caller is null
     or not exists(select 1 from learning.learners where id=caller) then
    raise exception using errcode='42501',message='A registered learner session is required';
  end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25000',message='Episode ingest requires READ COMMITTED isolation';
  end if;
  if jsonb_typeof(p_episode) is distinct from 'object'
     or pg_column_size(p_episode)>8*1024*1024
     or not p_episode ?& array['v','id','source','machine','cwd','project_root','started_at','ended_at','complete','prompt','turn_end','moments']
     or p_episode-array['v','id','source','machine','session_ref','cwd','project_root','started_at','ended_at','complete','prompt','turn_end','agent_turn','diff','superseded_by','dwell_ms','abandoned','moments']<>'{}'::jsonb
     or p_episode->'v'<>'2'::jsonb
     or p_agent_version is null or length(p_agent_version)=0
     or p_machine_class is null or p_machine_class not in ('human','agent') then
    raise exception using errcode='22023',message='Invalid v2 episode envelope';
  end if;
  foreach key in array array['id','source','machine','cwd','project_root','started_at','ended_at'] loop
    if jsonb_typeof(p_episode->key) is distinct from 'string' or length(p_episode->>key)=0 then
      raise exception using errcode='22023',message='Required capture text is missing';
    end if;
  end loop;
  if p_episode->>'source' not in ('claude-code','codex')
     or jsonb_typeof(p_episode->'complete') is distinct from 'boolean'
     or (p_episode ? 'session_ref' and (jsonb_typeof(p_episode->'session_ref') is distinct from 'string' or length(p_episode->>'session_ref')=0)) then
    raise exception using errcode='22023',message='Invalid capture metadata';
  end if;
  root_path:=p_episode->>'project_root';
  if left(root_path,1)<>'/' or root_path ~ '(^|/)(\.|\.\.)(/|$)' or (root_path<>'/' and root_path ~ '//|/$')
     or not (p_episode->>'cwd'=root_path or starts_with(p_episode->>'cwd',case when root_path='/' then '/' else root_path||'/' end)) then
    raise exception using errcode='22023',message='project_root must be a canonical absolute ancestor of cwd';
  end if;
  -- Require an ISO timestamp with an explicit timezone; cast failures become
  -- the same validation result as the engine's schema parser.
  foreach key in array array['started_at','ended_at'] loop
    if p_episode->>key !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
      raise exception using errcode='22023',message='Invalid session timestamp';
    end if;
  end loop;
  begin
    start_at:=(p_episode->>'started_at')::timestamptz;
    end_at:=(p_episode->>'ended_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode='22023',message='Invalid session timestamp';
  end;
  if end_at<start_at then
    raise exception using errcode='22023',message='Session end precedes its start';
  end if;

  -- The two spool records keep their v1 envelope. Their raw JSON is capture
  -- data; it does not become an owner, actor, status, or another database field.
  foreach key in array array['prompt','turn_end'] loop
    line:=p_episode->key;
    if key='turn_end' and line='null'::jsonb then continue; end if;
    if jsonb_typeof(line) is distinct from 'object'
       or not line ?& array['v','source','event','ts','machine','raw']
       or line->'v'<>'1'::jsonb
       or jsonb_typeof(line->'source') is distinct from 'string'
       or jsonb_typeof(line->'event') is distinct from 'string'
       or line->>'source' not in ('claude-code','codex')
       or line->>'event' not in ('user-prompt','turn-end')
       or jsonb_typeof(line->'ts') is distinct from 'string' or length(line->>'ts')=0
       or jsonb_typeof(line->'machine') is distinct from 'string' or length(line->>'machine')=0
       or (line ? 'session_ref' and (jsonb_typeof(line->'session_ref') is distinct from 'string' or length(line->>'session_ref')=0))
       or (line ? 'cwd' and (jsonb_typeof(line->'cwd') is distinct from 'string' or length(line->>'cwd')=0)) then
      raise exception using errcode='22023',message='Invalid spool record';
    end if;
  end loop;
  if p_episode ? 'agent_turn' then
    value:=p_episode->'agent_turn';
    if jsonb_typeof(value) is distinct from 'object'
       or jsonb_typeof(value->'text') is distinct from 'string'
       or jsonb_typeof(value->'truncated') is distinct from 'boolean'
       or (value ? 'tool_calls' and (jsonb_typeof(value->'tool_calls') is distinct from 'number' or value->>'tool_calls' !~ '^\d+$')) then
      raise exception using errcode='22023',message='Invalid agent turn';
    end if;
  end if;
  if p_episode ? 'diff' then
    value:=p_episode->'diff';
    if jsonb_typeof(value) is distinct from 'object' or not value ?& array['ref','branch','stat','patch','truncated','captured_at']
       or jsonb_typeof(value->'ref') not in ('string','null') or jsonb_typeof(value->'branch') not in ('string','null')
       or jsonb_typeof(value->'stat') is distinct from 'string' or jsonb_typeof(value->'patch') is distinct from 'string'
       or jsonb_typeof(value->'truncated') is distinct from 'boolean' or jsonb_typeof(value->'captured_at') is distinct from 'string' then
      raise exception using errcode='22023',message='Invalid captured diff';
    end if;
  end if;
  if p_episode ? 'superseded_by' then
    value:=p_episode->'superseded_by';
    if jsonb_typeof(value) is distinct from 'object' or jsonb_typeof(value->'started_at') is distinct from 'string' or length(value->>'started_at')=0
       or (value ? 'session_ref' and (jsonb_typeof(value->'session_ref') is distinct from 'string' or length(value->>'session_ref')=0)) then
      raise exception using errcode='22023',message='Invalid supersession reference';
    end if;
  end if;
  if p_episode ? 'dwell_ms' and (jsonb_typeof(p_episode->'dwell_ms') is distinct from 'number' or p_episode->>'dwell_ms' !~ '^\d+$') then
    raise exception using errcode='22023',message='Invalid dwell duration';
  end if;
  if p_episode ? 'abandoned' then
    if jsonb_typeof(p_episode->'abandoned') is distinct from 'array' then
      raise exception using errcode='22023',message='Invalid abandoned paths';
    end if;
    for value in select jsonb_array_elements(p_episode->'abandoned') loop
      if jsonb_typeof(value) is distinct from 'object' or not value ? 'kind'
         or jsonb_typeof(value->'kind') is distinct from 'string'
         or value->>'kind' not in ('permission_denied','plan_rejected','tool_error','interrupted')
         or (value ? 'tool' and jsonb_typeof(value->'tool') is distinct from 'string')
         or (value ? 'detail' and jsonb_typeof(value->'detail') is distinct from 'string') then
        raise exception using errcode='22023',message='Invalid abandoned path';
      end if;
    end loop;
  end if;
  if jsonb_typeof(p_episode->'moments') is distinct from 'array' then
    raise exception using errcode='22023',message='Session moments must be an array';
  end if;
  if jsonb_array_length(p_episode->'moments') not between 1 and 10000 then
    raise exception using errcode='22023',message='A session requires 1 to 10000 captured moments';
  end if;
  previous_at:=start_at;
  for moment in select jsonb_array_elements(p_episode->'moments') loop
    if jsonb_typeof(moment) is distinct from 'object' or not moment ?& array['kind','at','session_ref','payload']
       or moment-array['kind','at','session_ref','payload']<>'{}'::jsonb
       or jsonb_typeof(moment->'kind') is distinct from 'string' or length(btrim(moment->>'kind')) not between 1 and 200
       or jsonb_typeof(moment->'session_ref') is distinct from 'string' or length(moment->>'session_ref')=0
       or jsonb_typeof(moment->'payload') is distinct from 'object'
       or (moment->'payload' ? 'session_ref' and moment#>'{payload,session_ref}' is distinct from moment->'session_ref')
       or jsonb_typeof(moment->'at') is distinct from 'string'
       or moment->>'at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
      raise exception using errcode='22023',message='Invalid captured moment';
    end if;
    begin moment_at:=(moment->>'at')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode='22023',message='Invalid moment timestamp';
    end;
    if moment_at<previous_at or moment_at>end_at then
      raise exception using errcode='22023',message='Moments must be ordered within the session interval';
    end if;
    previous_at:=moment_at;
  end loop;

  value:=p_episode#>'{prompt,raw}';
  if jsonb_typeof(value)='string' then prompt_text:=nullif(value#>>'{}','');
  elsif jsonb_typeof(value)='object' then
    foreach key in array array['prompt','user_prompt','message','input','text'] loop
      if jsonb_typeof(value->key)='string' and length(btrim(value->>key))>0 then prompt_text:=value->>key;exit;end if;
    end loop;
  end if;
  summary_text:=p_episode#>>'{agent_turn,text}';
  if summary_text is null or length(btrim(summary_text))=0 then
    summary_text:=null;
    value:=p_episode#>'{turn_end,raw}';
    if jsonb_typeof(value)='string' then summary_text:=nullif(value#>>'{}','');
    elsif jsonb_typeof(value)='object' then
      foreach key in array array['summary','last_message','response','output','text'] loop
        if jsonb_typeof(value->key)='string' and length(btrim(value->>key))>0 then summary_text:=value->>key;exit;end if;
      end loop;
    end if;
  end if;
  select array_agg(distinct item->>'session_ref' order by item->>'session_ref') into refs
    from jsonb_array_elements(p_episode->'moments') item;

  -- Serialize retries before reading the receipt. READ COMMITTED ensures a
  -- waiter sees the committed episode and all its moments in the next command.
  prefix:=md5(jsonb_build_array('learning.v2.moment',caller,p_episode->>'id')::text);
  prefix:=substr(prefix,1,12)||'4'||substr(prefix,14,3)||'8'||substr(prefix,18,7);
  perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array('learning.v2.ingest',caller,p_episode->>'id')::text,0));
  select * into stored from learning.work_episodes
    where learner_id=caller and schema_version=2 and payload->>'id'=p_episode->>'id';
  if found then
    if stored.payload<>p_episode or stored.agent_version is distinct from p_agent_version or stored.machine_class is distinct from p_machine_class then
      raise exception using errcode='23505',message='Episode id already holds a different capture';
    end if;
    if stored.grain is distinct from 'session'
       or stored.source is distinct from p_episode->>'source'
       or stored.machine is distinct from p_episode->>'machine'
       or stored.project_ref is distinct from p_episode->>'cwd'
       or stored.started_at is distinct from start_at or stored.ended_at is distinct from end_at
       or stored.session_ref is not null or stored.session_refs is distinct from refs
       or stored.user_prompt is distinct from prompt_text or stored.agent_summary is distinct from summary_text
       or not exists(select 1 from learning.work_contexts c where c.id=stored.work_context_id
         and c.learner_id=caller and c.project_root=root_path
         and c.machine=p_episode->>'machine' and c.machine_class=p_machine_class) then
      raise exception using errcode='23505',message='Stored session projections differ from the original capture';
    end if;
    select jsonb_agg(id order by at,id) into moment_ids from learning.episode_moments
      where episode_moments.episode_id=stored.id and learner_id=caller;
    if jsonb_array_length(coalesce(moment_ids,'[]'::jsonb))<>jsonb_array_length(p_episode->'moments') then
      raise exception using errcode='23505',message='Stored capture no longer has its complete moment set';
    end if;
    if (select count(*) from learning.episode_moments m
        join jsonb_array_elements(p_episode->'moments') with ordinality expected(moment,ordinal)
          on m.id=(prefix||lpad(to_hex((expected.ordinal-1)::integer),8,'0'))::uuid
        where m.episode_id=stored.id and m.learner_id=caller
          and m.kind=btrim(expected.moment->>'kind') and m.at=(expected.moment->>'at')::timestamptz
          and m.session_ref=expected.moment->>'session_ref'
          and m.payload=(expected.moment->'payload'||jsonb_build_object('session_ref',expected.moment->>'session_ref')))
       <>jsonb_array_length(p_episode->'moments') then
      raise exception using errcode='23505',message='Stored moments differ from the original capture';
    end if;
    return jsonb_build_object('status','duplicate','episode_id',stored.id,'moment_ids',moment_ids);
  end if;

  insert into learning.work_contexts(learner_id,project_root,project_ref,machine,machine_class)
    values(caller,root_path,p_episode->>'cwd',p_episode->>'machine',p_machine_class)
    on conflict do nothing;
  select id into context_id from learning.work_contexts where learner_id=caller
    and project_root=root_path and machine=p_episode->>'machine' and machine_class=p_machine_class;
  if context_id is null then
    raise exception using errcode='42501',message='Could not resolve the owned work context';
  end if;
  -- The old per-turn unique key includes session_ref and started_at. A session
  -- can share both with its first historical turn, so refs live in session_refs.
  insert into learning.work_episodes(learner_id,source,machine,machine_class,session_ref,session_refs,project_ref,
    started_at,ended_at,user_prompt,agent_summary,payload,schema_version,agent_version,work_context_id,grain)
    values(caller,p_episode->>'source',p_episode->>'machine',p_machine_class,null,refs,p_episode->>'cwd',
      start_at,end_at,prompt_text,summary_text,p_episode,2,p_agent_version,context_id,'session') returning id into episode_id;
  -- Stable episode-derived UUID prefix plus ordinal suffix. The fixed version
  -- and variant bits make these valid UUIDs; the suffix preserves tied-time order.
  moment_ids:='[]'::jsonb;
  for moment in select jsonb_array_elements(p_episode->'moments') loop
    moment_id:=(prefix||lpad(to_hex(ordinal),8,'0'))::uuid;
    insert into learning.episode_moments(id,episode_id,learner_id,kind,at,session_ref,payload)
      values(moment_id,episode_id,caller,btrim(moment->>'kind'),(moment->>'at')::timestamptz,
        moment->>'session_ref',moment->'payload'||jsonb_build_object('session_ref',moment->>'session_ref'));
    moment_ids:=moment_ids||jsonb_build_array(moment_id);
    ordinal:=ordinal+1;
  end loop;
  return jsonb_build_object('status','inserted','episode_id',episode_id,'moment_ids',moment_ids);
end;
$$;
revoke all on function learning.ingest_episode_v2(jsonb,text,text) from public,anon,service_role;
grant execute on function learning.ingest_episode_v2(jsonb,text,text) to authenticated;
comment on function learning.ingest_episode_v2(jsonb,text,text) is 'Atomically record a caller-owned v2 session, explicit-root work context and ordered captured moments. Exact retries return the original receipt; changed captures conflict. No v1/client change or inferred moments.';
commit;
notify pgrst,'reload schema';
