#!/usr/bin/env python3
"""C1 real-schema/RLS assertions in a private PostgreSQL17 Docker container."""
import argparse
import json
from pathlib import Path
import subprocess
import time
import uuid

parser=argparse.ArgumentParser()
parser.add_argument('--before',action='store_true',help='Prove the assertions fail before C1')
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
name='itera-c1-test-'+uuid.uuid4().hex[:10]
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
    for number in (67,69,70,71,72,73,74,77,78,79,80,81,82,83): run(next((root/'db/migrations').glob(f'{number:04d}_*.sql')).read_text())
    cid,eid,epA,epB=[str(uuid.uuid4()) for _ in range(4)]
    run(f"""
      INSERT INTO itera.users VALUES ('{OP}'),('{A}'),('{B}');
      INSERT INTO itera.tenants VALUES ('{OP}','itera');
      INSERT INTO itera.memberships VALUES ('{OP}','{OP}','owner');
      INSERT INTO learning.learners(id) VALUES ('{OP}'),('{A}'),('{B}');
      INSERT INTO learning.learning_objectives(id,learner_id,title) VALUES ('{OA}','{A}','Knowledge A'),('{OB}','{B}','Knowledge B');
      INSERT INTO learning.claims(id,learner_id,objective_id,title) VALUES ('{cid}','{A}','{OA}','Existing claim');
      INSERT INTO learning.work_episodes(id,learner_id,source) VALUES ('{epA}','{A}','test'),('{epB}','{B}','test');
      INSERT INTO learning.evidence(id,claim_id,learner_id,observed,actor,direction,strength,provenance) VALUES ('{eid}','{cid}','{A}','Existing evidence','learner','supports','weak',jsonb_build_object('kind','test'));
    """)
    before=json.loads(run("SELECT jsonb_build_object('claims',(SELECT count(*) FROM learning.claims),'evidence',(SELECT count(*) FROM learning.evidence),'episodes',(SELECT count(*) FROM learning.work_episodes),'objectives',(SELECT count(*) FROM learning.learning_objectives));"))
    if not args.before:
        migration=next((root/'db/migrations').glob('0084_*.sql')).read_text()
        run(migration);run(migration)
    equal("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='learning' AND c.relname IN ('valued_work','task_models','artifacts') AND c.relrowsecurity",3)
    equal("SELECT is_nullable FROM information_schema.columns WHERE table_schema='learning' AND table_name='claims' AND column_name='objective_id'",'YES')
    equal("SELECT count(*) FROM learning.claims WHERE valued_work_id IS NULL AND objective_id IS NOT NULL",before['claims'])
    equal("SELECT count(*) FROM learning.evidence WHERE artifact_id IS NULL",before['evidence'])
    equal("SELECT count(*) FROM learning.learning_objectives WHERE target_autonomy IS NULL",before['objectives'])
    equal("SELECT count(*) FROM learning.work_episodes",before['episodes'])
    equal("SELECT count(*) FROM pg_constraint WHERE contype='f' AND ((conrelid='learning.valued_work'::regclass AND confrelid='learning.learning_objectives'::regclass) OR (confrelid='learning.valued_work'::regclass AND conrelid='learning.learning_objectives'::regclass))",0)
    equal("SELECT count(*) FROM pg_tables WHERE schemaname='learning' AND tablename IN ('artifact_evaluations','learner_models','presentation_models')",0)
    equal("SELECT count(*) FROM information_schema.columns WHERE table_schema='learning' AND table_name='learners' AND column_name IN ('role','constraints')",0)
    equal("SELECT count(*) FROM pg_proc WHERE oid='learning.guard_c1_links()'::regprocedure AND NOT prosecdef",1)
    va,vb,ma,mb,shared,artifact=[str(uuid.uuid4()) for _ in range(6)]
    run(f"INSERT INTO learning.valued_work(id,learner_id,title) VALUES ('{va}','{A}','Delivery A')",A)
    run(f"INSERT INTO learning.valued_work(id,learner_id,title) VALUES ('{vb}','{B}','Delivery B')",B)
    equal('SELECT count(*) FROM learning.valued_work',1,A)
    equal('SELECT count(*) FROM learning.valued_work',2,OP)
    run('SELECT * FROM learning.valued_work',A,role='anon',error='42501')
    run(f"INSERT INTO learning.valued_work(learner_id,title) VALUES ('{B}','Spoof')",A,error='42501')
    run(f"INSERT INTO learning.task_models(id,learner_id,objective_id,valued_work_id,title,expectation) VALUES ('{ma}','{A}','{OA}','{va}','Own','Expected')",A)
    run(f"INSERT INTO learning.task_models(id,learner_id,title,expectation) VALUES ('{mb}','{B}','Foreign','Expected')",B)
    run("INSERT INTO learning.task_models(title,expectation) VALUES ('Shared','Expected')",A,error='42501')
    run(f"INSERT INTO learning.task_models(objective_id,title,expectation) VALUES ('{OA}','Leaky shared','Expected')",OP,error='23514')
    run(f"INSERT INTO learning.task_models(learner_id,objective_id,title,expectation) VALUES ('{A}','{OB}','Foreign objective','Expected')",A,error='23503')
    run(f"INSERT INTO learning.task_models(learner_id,valued_work_id,title,expectation) VALUES ('{A}','{vb}','Foreign delivery','Expected')",A,error='23503')
    run(f"INSERT INTO learning.task_models(id,title,expectation) VALUES ('{shared}','Shared','Expected')",OP)
    equal('SELECT count(*) FROM learning.task_models',2,A)
    equal('SELECT count(*) FROM learning.task_models',3,OP)
    run('SELECT * FROM learning.task_models',A,role='anon',error='42501')
    run(f"UPDATE learning.task_models SET learner_id='{OP}' WHERE id='{shared}'",OP,error='42501')
    run(f"INSERT INTO learning.artifacts(id,learner_id,episode_id,task_model_id,kind) VALUES ('{artifact}','{A}','{epA}','{shared}','document')",A)
    equal('SELECT count(*) FROM learning.artifacts',0,B)
    equal('SELECT count(*) FROM learning.artifacts',1,OP)
    run('SELECT * FROM learning.artifacts',A,role='anon',error='42501')
    run(f"INSERT INTO learning.artifacts(learner_id,episode_id,kind) VALUES ('{A}','{epB}','document')",A,error='23503')
    run(f"INSERT INTO learning.artifacts(learner_id,task_model_id,kind) VALUES ('{A}','{mb}','document')",A,error='23503')
    run(f"INSERT INTO learning.artifacts(learner_id,task_model_id,kind) VALUES ('{OP}','{mb}','document')",OP,error='23503')
    run(f"UPDATE learning.artifacts SET task_model_id='{ma}' WHERE id='{artifact}'",A)
    equal(f"SELECT task_model_id FROM learning.artifacts WHERE id='{artifact}'",ma,A)
    equal(f"WITH changed AS (UPDATE learning.artifacts SET title='Forbidden' WHERE id='{artifact}' RETURNING id) SELECT count(*) FROM changed",0,OP)
    foreign_artifact=str(uuid.uuid4())
    run(f"INSERT INTO learning.artifacts(id,learner_id,kind) VALUES ('{foreign_artifact}','{B}','new_product_kind')",B)
    run(f"INSERT INTO learning.evidence(claim_id,learner_id,artifact_id,observed,actor,direction,strength,provenance) VALUES ('{cid}','{A}','{foreign_artifact}','Foreign artifact','learner','supports','weak',jsonb_build_object('kind','test'))",A,error='23503')
    equal("SELECT count(*) FROM information_schema.columns WHERE table_schema='learning' AND table_name='artifacts' AND column_name IN ('episode_id','task_model_id') AND is_nullable='YES'",2)
    run(f"UPDATE learning.evidence SET artifact_id='{artifact}' WHERE id='{eid}'")
    equal(f"SELECT learner_id FROM learning.evidence WHERE id='{eid}'",A)
    run(f"INSERT INTO learning.claims(learner_id,valued_work_id,title) VALUES ('{A}','{va}','Delivery claim')",A)
    run(f"INSERT INTO learning.claims(learner_id,valued_work_id,title) VALUES ('{A}','{vb}','Foreign delivery')",A,error='23503')
    run(f"UPDATE learning.learning_objectives SET target_autonomy='   ' WHERE id='{OA}'",A,error='23514')
    run(f"UPDATE learning.learning_objectives SET target_autonomy='Complete without guidance' WHERE id='{OA}'",A)
    equal(f"SELECT target_autonomy FROM learning.learning_objectives WHERE id='{OA}'",'Complete without guidance',A)
    # Nulling a reference preserves the learner id and every evidence row.
    run(f"DELETE FROM learning.artifacts WHERE id='{artifact}'",A)
    equal(f"SELECT count(*) FROM learning.evidence WHERE id='{eid}' AND artifact_id IS NULL AND learner_id='{A}'",1)
    run(f"DELETE FROM learning.valued_work WHERE id='{va}'",A)
    equal(f"SELECT count(*) FROM learning.claims WHERE learner_id='{A}' AND valued_work_id IS NULL",2)
    print(f'PASS: {checks} C1 assertions; actual PostgreSQL17 grants, RLS, ownership, nullable links, idempotency and existing-row preservation')
finally:
    subprocess.run(['docker','rm','-f',name],capture_output=True)
