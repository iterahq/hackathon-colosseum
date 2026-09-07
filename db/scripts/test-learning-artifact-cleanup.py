#!/usr/bin/env python3
"""Artifact cleanup RPC assertions in a private PostgreSQL17 Docker container."""
import argparse
import json
from pathlib import Path
import subprocess
import time
import uuid

parser=argparse.ArgumentParser()
parser.add_argument('--before',action='store_true',help='Prove the assertions fail before the cleanup RPC')
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
name='itera-artifact-cleanup-test-'+uuid.uuid4().hex[:10]
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
    for number in (67,69,70,71,72,73,74,77,78,79,80,81,82,83,84): run(next((root/'db/migrations').glob(f'{number:04d}_*.sql')).read_text())
    cid=str(uuid.uuid4())
    run(f"""
      INSERT INTO itera.users VALUES ('{OP}'),('{A}'),('{B}');
      INSERT INTO itera.tenants VALUES ('{OP}','itera');
      INSERT INTO itera.memberships VALUES ('{OP}','{OP}','owner');
      INSERT INTO learning.learners(id) VALUES ('{OP}'),('{A}'),('{B}');
      INSERT INTO learning.learning_objectives(id,learner_id,title) VALUES ('{OA}','{A}','Knowledge A');
      INSERT INTO learning.claims(id,learner_id,objective_id,title) VALUES ('{cid}','{A}','{OA}','Claim');
    """)
    if not args.before:
        migration=next((root/'db/migrations').glob('0086_*.sql')).read_text()
        run(migration);run(migration)
    equal("SELECT count(*) FROM pg_proc WHERE pronamespace='learning'::regnamespace AND proname='delete_artifact' AND NOT prosecdef",1)
    equal("SELECT has_function_privilege('authenticated','learning.delete_artifact(uuid)','EXECUTE')",'t')
    for role in ('anon','service_role'):
        equal(f"SELECT has_function_privilege('{role}','learning.delete_artifact(uuid)','EXECUTE')",'f')
    equal("SELECT proconfig::text FROM pg_proc WHERE oid='learning.delete_artifact(uuid)'::regprocedure",'{"search_path=pg_catalog, learning, itera"}')

    def artifact(owner=A):
        value=str(uuid.uuid4())
        run(f"INSERT INTO learning.artifacts(id,learner_id,kind) VALUES ('{value}','{owner}','test')",owner)
        return value

    def deletion(value): return f"SELECT learning.delete_artifact('{value}')"
    def evidence(value): return f"INSERT INTO learning.evidence(claim_id,learner_id,artifact_id,observed,actor,direction,strength,provenance) VALUES ('{cid}','{A}','{value}','Synthetic fixture','learner','supports','weak',jsonb_build_object('kind','test'))"

    own=artifact(); foreign=artifact(B)
    run(deletion(own),A,role='anon',error='42501')
    run(deletion(own),A,role='service_role',error='42501')
    run(deletion(own),error='42501') # A database owner is not a user session.
    run("SET ROLE authenticated; "+deletion(own),error='42501')
    run(deletion(own),str(uuid.uuid4()),error='42501')
    run("SELECT learning.delete_artifact(NULL)",A,error='22023')
    run("SELECT learning.delete_artifact('bad-id')",A,error='22P02')
    run(deletion(foreign),A,error='P0002')
    run(deletion(own),B,error='P0002')
    run(deletion(own),OP,error='P0002') # Operator SELECT does not authorize deletion.
    run(deletion(str(uuid.uuid4())),A,error='P0002')
    equal(f"SELECT count(*) FROM learning.artifacts WHERE id IN ('{own}','{foreign}')",2)
    run("BEGIN ISOLATION LEVEL REPEATABLE READ; "+deletion(own),A,error='25000')
    run("BEGIN; "+deletion(own)+"; ROLLBACK",A)
    equal(f"SELECT count(*) FROM learning.artifacts WHERE id='{own}'",1,A)
    result=json.loads(run(deletion(own),A))
    assert result=={'artifact_id':own,'deleted':True},result
    checks+=1
    equal(f"SELECT count(*) FROM learning.artifacts WHERE id='{own}'",0,A)
    run(deletion(own),A,error='P0002')
    referenced=artifact(); run(evidence(referenced),A)
    run(deletion(referenced),A,error='23503')
    equal(f"SELECT count(*) FROM learning.evidence WHERE artifact_id='{referenced}'",1,A)
    equal(f"SELECT count(*) FROM learning.artifacts WHERE id='{referenced}'",1,A)

    # Interactive sessions make the ordering observable, without timing races.
    def session(label):
        p=subprocess.Popen(['docker','exec','-i',name,'psql','-X','-qAt','-h','/tmp','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        send(p,f"SET application_name='{label}'; SET statement_timeout='8s'; SET ROLE authenticated; SET test.caller='{A}'; BEGIN;")
        return p
    def send(p,sql): p.stdin.write(sql+'\n');p.stdin.flush()
    def wait_state(label,predicate):
        for _ in range(150):
            if run(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{label}' AND ({predicate})")=='1': return
            time.sleep(.02)
        raise AssertionError('Session did not reach expected state: '+label+' '+predicate)
    def finish(p,sql='COMMIT;',error=None):
        if not error: send(p,sql)
        out,err=p.communicate(timeout=12)
        if error: assert p.returncode and error in err,(out,err)
        else: assert p.returncode==0,(out,err)
        return out

    # An uncommitted reference takes the learner lock first. Cleanup waits,
    # then sees that reference after commit and must preserve both rows.
    concurrent=artifact()
    first=session('artifact-reference-first')
    send(first,evidence(concurrent)+';')
    wait_state('artifact-reference-first',"state='idle in transaction' AND query LIKE 'INSERT INTO learning.evidence%'")
    second=session('artifact-cleanup-second')
    send(second,deletion(concurrent)+';')
    wait_state('artifact-cleanup-second',"wait_event='advisory'")
    checks+=1
    finish(first)
    finish(second,error='23503')
    equal(f"SELECT count(*) FROM learning.evidence WHERE artifact_id='{concurrent}'",1,A)
    equal(f"SELECT count(*) FROM learning.artifacts WHERE id='{concurrent}'",1,A)

    # A held FK-style key-share lock must block cleanup at its artifact row
    # lock, independently of the common learner advisory lock.
    locked=artifact()
    first=session('artifact-key-share')
    send(first,f"SELECT id FROM learning.artifacts WHERE id='{locked}' FOR KEY SHARE;")
    wait_state('artifact-key-share',"state='idle in transaction' AND query LIKE 'SELECT id FROM learning.artifacts%'")
    second=session('artifact-row-lock')
    send(second,deletion(locked)+';')
    wait_state('artifact-row-lock',"wait_event='transactionid'")
    checks+=1
    finish(first)
    finish(second)
    equal(f"SELECT count(*) FROM learning.artifacts WHERE id='{locked}'",0,A)

    # A cleanup transaction holds its learner and artifact locks. A concurrent
    # evidence insert waits, then fails its FK after the artifact is deleted.
    concurrent=artifact()
    first=session('artifact-cleanup-first')
    send(first,deletion(concurrent)+';')
    wait_state('artifact-cleanup-first',"state='idle in transaction' AND query LIKE 'SELECT learning.delete_artifact%'")
    second=session('artifact-reference-second')
    send(second,evidence(concurrent)+';')
    wait_state('artifact-reference-second',"wait_event='advisory'")
    checks+=1
    finish(first)
    finish(second,error='23503')
    equal(f"SELECT count(*) FROM learning.artifacts WHERE id='{concurrent}'",0,A)
    equal(f"SELECT count(*) FROM learning.evidence WHERE artifact_id='{concurrent}'",0,A)
    print(f'PASS: {checks} artifact cleanup assertions; RLS, regular caller, reference refusal, rollback, retries and both concurrent write orders')
finally:
    subprocess.run(['docker','rm','-f',name],capture_output=True)
