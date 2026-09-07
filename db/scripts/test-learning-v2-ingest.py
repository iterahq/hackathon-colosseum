#!/usr/bin/env python3
"""V2 capture RPC assertions in a private PostgreSQL17 Docker container."""
import argparse
import json
from pathlib import Path
import subprocess
import time
import uuid

parser=argparse.ArgumentParser()
parser.add_argument('--before',action='store_true',help='Prove the assertions fail before the v2 ingest RPC')
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
name='itera-v2-ingest-test-'+uuid.uuid4().hex[:10]
OP,A,B=[f'00000000-0000-4000-8000-00000000000{i}' for i in (1,2,3)]
OA,OB=[f'10000000-0000-4000-8000-00000000000{i}' for i in (1,2)]
checks=0

def run(statement,caller=None,role='authenticated',error=None):
    global checks
    if caller: statement=f"SET ROLE {role}; SET test.caller='{caller}'; "+statement
    p=subprocess.run(['docker','exec','-i',name,'psql','-X','-qAt','-h','/tmp','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],input=statement,text=True,capture_output=True)
    if error:
        assert p.returncode and error in p.stderr,(error,p.stderr)
        checks+=1
    elif p.returncode: raise AssertionError(p.stderr)
    return p.stdout.strip()

def equal(statement,expected,caller=None):
    global checks
    actual=run(statement,caller)
    assert actual==str(expected),(expected,actual)
    checks+=1

try:
    subprocess.run(['docker','run','-d','--name',name,'--network','none','--user','postgres','--tmpfs','/tmp:rw,mode=1777','--entrypoint','bash','supabase/postgres:17.6.1.160','-c','initdb -D /tmp/db -A trust -U postgres >/tmp/init.log && exec postgres -D /tmp/db -k /tmp -c listen_addresses='],check=True,capture_output=True)
    for _ in range(60):
        if subprocess.run(['docker','exec',name,'pg_isready','-h','/tmp','-U','postgres'],capture_output=True).returncode==0: break
        time.sleep(.25)
    run("""
      CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE service_role NOLOGIN;
      CREATE SCHEMA itera;
      CREATE TABLE itera.users(id uuid PRIMARY KEY);
      CREATE TABLE itera.tenants(id uuid PRIMARY KEY,slug text);
      CREATE TABLE itera.memberships(user_id uuid,tenant_id uuid,role text);
      CREATE FUNCTION itera.current_itera_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.caller',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA itera TO authenticated;
      GRANT SELECT ON itera.users TO authenticated;
    """)
    for number in (67,69,70,71,72,73,74,77,78,79,80,81,82,83,84,85,86,87,88): run(next((root/'db/migrations').glob(f'{number:04d}_*.sql')).read_text())
    run(f"INSERT INTO itera.users VALUES ('{A}'),('{B}'); INSERT INTO learning.learners(id) VALUES ('{A}'),('{B}');")
    if not args.before:
        migration=next((root/'db/migrations').glob('0089_*.sql')).read_text()
        run(migration);run(migration)
    equal("SELECT count(*) FROM pg_proc WHERE pronamespace='learning'::regnamespace AND proname='ingest_episode_v2' AND NOT prosecdef",1)
    signature='learning.ingest_episode_v2(jsonb,text,text)'
    equal(f"SELECT has_function_privilege('authenticated','{signature}','EXECUTE')",'t')
    for role in ('anon','service_role'):
        equal(f"SELECT has_function_privilege('{role}','{signature}','EXECUTE')",'f')
    def episode(key='session-1'):
        return {'v':2,'id':key,'source':'claude-code','machine':'test-host','cwd':'/repo/apps/web','project_root':'/repo','started_at':'2026-09-07T10:00:00Z','ended_at':'2026-09-07T10:02:00Z','complete':True,'prompt':{'v':1,'source':'claude-code','event':'user-prompt','ts':'2026-09-07T10:00:00Z','machine':'test-host','raw':{'prompt':'Synthetic task'}},'turn_end':None,'moments':[{'kind':'turn','at':'2026-09-07T10:00:00Z','session_ref':'s1','payload':{'prompt':'Synthetic task'}},{'kind':'turn','at':'2026-09-07T10:00:00Z','session_ref':'s2','payload':{'prompt':'Synthetic follow-up'}}]}
    def sql(value,version='future-client',machine_class='human'):
        payload=json.dumps(value).replace("'","''")
        return f"SELECT learning.ingest_episode_v2('{payload}'::jsonb,'{version}','{machine_class}')"
    first=episode()
    for role in ('anon','service_role'):
        run(sql(first),A,role=role,error='42501')
    run(sql(first),error='42501')
    run("SET ROLE authenticated; "+sql(first),error='42501')
    run(sql(first),str(uuid.uuid4()),error='42501')
    result=json.loads(run(sql(first),A))
    assert result['status']=='inserted' and len(result['moment_ids'])==2,result
    assert result['moment_ids']==sorted(result['moment_ids']),result
    checks+=2
    eid=result['episode_id']
    equal(f"SELECT schema_version||':'||grain||':'||agent_version FROM learning.work_episodes WHERE id='{eid}'",'2:session:future-client',A)
    equal(f"SELECT session_ref IS NULL AND session_refs=ARRAY['s1','s2'] FROM learning.work_episodes WHERE id='{eid}'",'t',A)
    equal(f"SELECT count(*) FROM learning.episode_moments WHERE episode_id='{eid}'",2,A)
    equal(f"SELECT count(*) FROM learning.work_episodes WHERE id='{eid}'",0,B)
    equal(f"SELECT count(*) FROM learning.episode_moments WHERE episode_id='{eid}'",0,B)
    duplicate=json.loads(run(sql(first),A))
    assert duplicate=={**result,'status':'duplicate'},duplicate
    checks+=1
    changed=episode();changed['moments'][1]['payload']['prompt']='Changed request'
    run(sql(changed),A,error='23505')
    run(sql(first,version='changed-version'),A,error='23505')
    equal(f"SELECT count(*) FROM learning.episode_moments WHERE episode_id='{eid}' AND payload->>'session_ref'=session_ref",2,A)
    mid=result['moment_ids'][0]
    run(f"UPDATE learning.episode_moments SET payload='{{}}'::jsonb WHERE id='{mid}'",A,error='42501')
    run(f"UPDATE learning.episode_moments SET payload='{{}}'::jsonb WHERE id='{mid}'")
    run(sql(first),A,error='23505')
    original_payload=json.dumps({**first['moments'][0]['payload'],'session_ref':first['moments'][0]['session_ref']}).replace("'","''")
    run(f"UPDATE learning.episode_moments SET payload='{original_payload}'::jsonb WHERE id='{mid}'")

    equal("SELECT count(*) FROM learning.work_contexts",1)
    foreign=json.loads(run(sql(first),B))
    assert foreign['episode_id']!=eid and foreign['moment_ids']!=result['moment_ids']
    checks+=1

    invalid=[]
    def bad(key,value):
        item=episode('invalid');item[key]=value;invalid.append(item)
    for key,value in [('v',1),('learner_id',B),('grain','turn'),('id',''),('source','other'),('machine',''),('project_root','/other'),('project_root','/repo/../other'),('cwd',None),('ended_at',None),('started_at','not-time'),('ended_at','2026-09-07T09:00:00Z'),('complete','yes'),('moments',[]),('moments',{}),('prompt',{})]:bad(key,value)
    for field,value in [('learner_id',B),('id',str(uuid.uuid4())),('kind',''),('at','2026-09-07T12:00:00Z'),('session_ref',''),('payload',[]),('payload',None)]:
        item=episode('invalid');item['moments'][0][field]=value;invalid.append(item)
    item=episode('invalid');item['moments'][0]['at']='2026-09-07T10:01:00Z';invalid.append(item)
    for field in ('source','event'):
        item=episode('invalid');item['prompt'][field]=None;invalid.append(item)
    item=episode('invalid');item['abandoned']=[{'kind':None}];invalid.append(item)
    item=episode('invalid');item['moments'][0]['payload']['session_ref']='conflict';invalid.append(item)
    for item in invalid:run(sql(item),A,error='22023')
    run(sql(episode('invalid'),version=''),A,error='22023')
    run(sql(episode('invalid'),machine_class='operator'),A,error='22023')
    equal("SELECT count(*) FROM learning.work_episodes",2)
    equal("SELECT count(*) FROM learning.episode_moments",4)
    run("BEGIN ISOLATION LEVEL REPEATABLE READ; "+sql(first),A,error='25000')

    # A late moment failure must roll back the episode and its new context too.
    run("CREATE FUNCTION learning.fail_test_moment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload->>'fail'='yes' THEN RAISE EXCEPTION 'synthetic late failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_test_moment BEFORE INSERT ON learning.episode_moments FOR EACH ROW EXECUTE FUNCTION learning.fail_test_moment();")
    broken=episode('rollback');broken['project_root']='/fresh';broken['cwd']='/fresh';broken['moments'][1]['payload']['fail']='yes'
    run(sql(broken),A,error='P0001')
    equal("SELECT count(*) FROM learning.work_episodes",2)
    equal("SELECT count(*) FROM learning.episode_moments",4)
    equal("SELECT count(*) FROM learning.work_contexts WHERE project_root='/fresh'",0)
    run("DROP TRIGGER fail_test_moment ON learning.episode_moments; DROP FUNCTION learning.fail_test_moment();")

    # Independent user sessions race the same capture. Exactly one insert wins.
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=2) as pool:
        receipts=list(pool.map(lambda _:json.loads(run(sql(episode('concurrent')),A)),range(2)))
    assert sorted(x['status'] for x in receipts)==['duplicate','inserted'],receipts
    assert receipts[0]['episode_id']==receipts[1]['episode_id'] and receipts[0]['moment_ids']==receipts[1]['moment_ids']
    checks+=2
    equal("SELECT count(*) FROM learning.work_episodes",3)
    equal("SELECT count(*) FROM learning.episode_moments",6)
    equal("SELECT count(*) FROM learning.evidence",0)
    # Capture UPDATE is not granted. Preserve that boundary, and model damage
    # from an administrative write only inside this isolated fixture.
    for table in ('work_episodes','work_contexts','episode_moments'):
        equal(f"SELECT has_table_privilege('authenticated','learning.{table}','UPDATE')",'f')
    run(f"UPDATE learning.work_episodes SET grain='turn' WHERE id='{eid}'",A,error='42501')
    for mutation,restore in [
        ("grain='turn'","grain='session'"),
        ("started_at=started_at-interval '1 second'","started_at=started_at+interval '1 second'"),
        ("ended_at=ended_at+interval '1 second'","ended_at=ended_at-interval '1 second'"),
        ("source='codex'","source='claude-code'"),
        ("project_ref='/repo/other'","project_ref='/repo/apps/web'"),
        ("user_prompt='Changed projection'","user_prompt='Synthetic task'"),
        ("agent_summary='Changed projection'","agent_summary=NULL"),
        ("session_refs=ARRAY['changed']","session_refs=ARRAY['s1','s2']")]:
        run(f"UPDATE learning.work_episodes SET {mutation} WHERE id='{eid}'")
        run(sql(first),A,error='23505')
        run(f"UPDATE learning.work_episodes SET {restore} WHERE id='{eid}'")
    run(f"UPDATE learning.work_contexts SET project_root='/changed' WHERE id=(SELECT work_context_id FROM learning.work_episodes WHERE id='{eid}')")
    run(sql(first),A,error='23505')
    run(f"UPDATE learning.work_contexts SET project_root='/repo' WHERE id=(SELECT work_context_id FROM learning.work_episodes WHERE id='{eid}')")
    assert json.loads(run(sql(first),A))=={**result,'status':'duplicate'}
    checks+=1
    unix_root=episode('unix-root');unix_root['project_root']='/';unix_root['cwd']='/apps/web'
    root_receipt=json.loads(run(sql(unix_root),A))
    assert root_receipt['status']=='inserted';checks+=1
    assert json.loads(run(sql(unix_root),A))=={**root_receipt,'status':'duplicate'};checks+=1

    # A2 replay and new v2 capture coexist in the same final schema. The
    # historical fixture is explicit and local; v2 captures are never regrouped.
    captured_before=run("SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM learning.work_episodes e WHERE schema_version=2")
    moments_before=run("SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM learning.episode_moments m")
    legacy='88888888-0000-4000-8000-000000000001'
    run(f"INSERT INTO learning.work_episodes(id,learner_id,source,machine,machine_class,project_ref,work_context_id,grain,started_at,ended_at,session_ref,created_at) SELECT '{legacy}','{A}','claude-code','test-host','human','/repo',id,'turn','2026-09-01T10:00Z','2026-09-01T10:01Z','legacy-session','2026-09-07T18:00Z' FROM learning.work_contexts WHERE learner_id='{A}' AND project_root='/repo'")
    regroup=next((root/'db/migrations').glob('0088_*.sql')).read_text()
    run(regroup)
    equal(f"SELECT session_episode_id IS NOT NULL FROM learning.work_episodes WHERE id='{legacy}'",'t')
    equal("SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM learning.work_episodes e WHERE schema_version=2",captured_before)
    equal("SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM learning.episode_moments m WHERE episode_id IN (SELECT id FROM learning.work_episodes WHERE schema_version=2)",moments_before)
    run(regroup)
    assert json.loads(run(sql(first),A))=={**result,'status':'duplicate'}
    checks+=1
    print(f'{checks} v2 ingest assertions passed; caller RLS, rollback and concurrent retries verified')
finally:
    subprocess.run(['docker','rm','-f',name],capture_output=True)
