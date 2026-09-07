#!/usr/bin/env python3
"""Execute the real learning migrations/RPC on isolated PostgreSQL 17.

Docker has no network or published port. Only the identity provider is a test
shim; tables, grants, RLS, constraints and transaction behavior are real SQL.
No production URL, password, user data, or provider API enters this test.
"""
import argparse
import concurrent.futures
import json
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
NAME = 'itera-dml-test-' + uuid.uuid4().hex[:10]
OP, A, B = ['00000000-0000-4000-8000-00000000000' + str(i) for i in range(1, 4)]
OA, OA2, OB = ['10000000-0000-4000-8000-00000000000' + str(i) for i in range(1, 4)]
checks = 0
parser = argparse.ArgumentParser()
parser.add_argument('--dependency', action='append', type=Path, default=[])
parser.add_argument('--extension', action='append', type=Path, default=[])
args = parser.parse_args()


def sql(statement, caller=None, role='authenticated', ok=True):
    if caller:
        statement = f"SET ROLE {role}; SET test.caller='{caller}'; " + statement
    proc = subprocess.run(['docker', 'exec', '-i', NAME, 'psql', '-X', '-qAt', '-h', '/tmp', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], input=statement, text=True, capture_output=True)
    if ok and proc.returncode:
        raise AssertionError(proc.stderr)
    return proc


def call(operation, body, caller=A, error=None, role='authenticated'):
    global checks
    payload = json.dumps(body).replace("'", "''")
    proc = sql(f"SELECT learning.apply_dml('{operation}','{payload}'::jsonb);", caller, role, ok=error is None)
    if error:
        assert proc.returncode != 0 and error in proc.stderr, (error, proc.stderr, proc.stdout)
        checks += 1
        return None
    checks += 1
    return json.loads(proc.stdout.strip())


def count(table, where='true'):
    return int(sql(f'SELECT count(*) FROM learning.{table} WHERE {where};').stdout.strip())


try:
    subprocess.run(['docker', 'run', '-d', '--name', NAME, '--network', 'none', '--user', 'postgres', '--tmpfs', '/tmp:rw,mode=1777', '--entrypoint', 'bash', 'supabase/postgres:17.6.1.160', '-c', 'initdb -D /tmp/db -A trust -U postgres >/tmp/init.log && exec postgres -D /tmp/db -k /tmp -c listen_addresses='], check=True, capture_output=True)
    for _ in range(60):
        if subprocess.run(['docker', 'exec', NAME, 'pg_isready', '-h', '/tmp', '-U', 'postgres'], capture_output=True).returncode == 0:
            break
        time.sleep(.25)
    sql("""
      CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE service_role NOLOGIN;
      CREATE SCHEMA itera;
      CREATE TABLE itera.users(id uuid PRIMARY KEY);
      CREATE TABLE itera.tenants(id uuid PRIMARY KEY,slug text);
      CREATE TABLE itera.memberships(user_id uuid,tenant_id uuid,role text);
      CREATE FUNCTION itera.current_itera_user_id() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('test.caller',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA itera TO authenticated;
      GRANT SELECT ON itera.users TO authenticated;
    """)
    migrations = ROOT / 'db/migrations'
    # Only learning migrations: the identity shim replaces the platform schema.
    for number in [67, 69, 70, 71, 72, 73, 74, 77, 78, 79, 80, 81, 82, 83]:
        matches = sorted(migrations.glob(f'{number:04d}_*.sql'))
        if not matches:
            matches = [p for p in args.dependency if p.name.startswith(f'{number:04d}_')]
        if number in (80,81):
            assert len(matches)==1, f'Missing correction {number:04d}; supply --dependency before its merge'
        if number not in (80, 81):
            assert len(matches) == 1, number
        for migration in matches:
            sql(migration.read_text())
    sql(next(migrations.glob('0082_*.sql')).read_text())  # idempotent DDL
    for extension in args.extension:
        sql(extension.read_text())  # Run the original contract against a newer dispatcher.
    sql(f"""
      INSERT INTO itera.users VALUES ('{OP}'),('{A}'),('{B}');
      INSERT INTO itera.tenants VALUES ('{OP}','itera');
      INSERT INTO itera.memberships VALUES ('{OP}','{OP}','owner');
      INSERT INTO learning.learners(id) VALUES ('{OP}'),('{A}'),('{B}');
      INSERT INTO learning.learning_objectives(id,learner_id,title) VALUES
        ('{OA}','{A}','First'),('{OA2}','{A}','Second'),('{OB}','{B}','Foreign');
    """)
    # Neither a learner nor another SQL role can perform an editorial write.
    call('create_capability', {'id':'cap_denied','title':'Denied'}, error='42501')
    call('create_capability', {'id':'cap_denied','title':'Denied'}, caller=OP, role='anon', error='42501')
    call('create_capability', {'id':'cap_denied','title':'Denied'}, caller=OP, role='service_role', error='42501')
    result = call('create_capability', {'id':'cap_target','title':'Target'}, OP)
    assert result['capability']['learner_id'] is None
    assert result['capability']['source'] == {'kind':'editorial'}
    assert result['ontology_version'] == 2
    before = count('ontology_versions')
    call('create_capability', {'id':'cap_target','title':'Duplicate'}, OP, '23505')
    assert count('ontology_versions') == before  # version INSERT rolled back
    for name in ('cap_old1','cap_old2'):
        call('create_capability', {'id':name,'title':name}, OP)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        versions = list(pool.map(lambda n: call('create_capability', {'id':f'cap_parallel_{n}','title':'Parallel'}, OP)['ontology_version'], range(2)))
    assert len(set(versions)) == 2 and max(versions)-min(versions) == 1
    template = call('create_claim_template', {'capability_id':'cap_old1','statement':'I can verify a claim'}, OP)['claim_template']
    assert template['created_by'] == OP
    before = count('ontology_versions')
    call('merge_capabilities', {'from':['cap_old1','missing'],'into':'cap_target','reason':'Same'}, OP, 'P0002')
    assert count('ontology_versions') == before
    assert count('capabilities', "id='cap_old1' AND retired_in IS NULL") == 1
    result = call('merge_capabilities', {'from':['cap_old1','cap_old2'],'into':'cap_target','reason':'Same'}, OP)
    assert result['templates_reparented'] == 1 and len(result['retired_ids']) == 2
    assert count('claim_templates', "capability_id='cap_target'") == 1
    assert count('capabilities', 'retired_in IS NOT NULL') == 2
    call('create_claim_template', {'capability_id':'cap_old1','statement':'Retired'}, OP, 'P0002')
    unlinked = call('create_claim_template', {'statement':'Free template','capability_id':None}, OP)['claim_template']
    # Own objective passes; a readable foreign objective still fails explicitly.
    call('instantiate_claim', {'claim_template_id':template['id'],'objective_id':OB}, A, 'P0002')
    call('instantiate_claim', {'claim_template_id':template['id'],'objective_id':OA}, OP, 'P0002')
    claim = call('instantiate_claim', {'claim_template_id':template['id'],'objective_id':OA,'sort_order':-1})['claim']
    assert claim['learner_id'] == A and claim['claim_template_id'] == template['id']
    call('instantiate_claim', {'claim_template_id':template['id'],'objective_id':OA}, A, '23505')
    # Simultaneous retries cannot create duplicate template instances.
    def concurrent_call(_):
        payload=json.dumps({'claim_template_id':unlinked['id'],'objective_id':OA})
        return sql(f"SELECT learning.apply_dml('instantiate_claim','{payload}'::jsonb);", A, ok=False)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(concurrent_call,range(2)))
    assert sum(r.returncode == 0 for r in results) == 1
    assert any('23505' in r.stderr for r in results)
    assert count('claims', f"objective_id='{OA}' AND claim_template_id='{unlinked['id']}'") == 1
    checks += 1
    second = json.loads(next(r.stdout for r in results if r.returncode == 0))['claim']
    foreign = call('instantiate_claim', {'claim_template_id':template['id'],'objective_id':OB}, B)['claim']
    call('reparent_claims', {'claim_ids':[claim['id'],foreign['id']],'objective_id':OA2}, A, 'P0002')
    assert count('claims',f"id='{claim['id']}' AND objective_id='{OA}'") == 1
    call('instantiate_claim', {'claim_template_id':unlinked['id'],'objective_id':OA2})
    call('reparent_claims', {'claim_ids':[claim['id'],second['id']],'objective_id':OA2}, A, '23505')
    assert count('claims',f"id='{claim['id']}' AND objective_id='{OA}'") == 1
    assert count('claims',f"id='{second['id']}' AND objective_id='{OA}'") == 1
    moved = call('reparent_claims', {'claim_ids':[claim['id']],'objective_id':OA2})
    assert moved['claims'][0]['objective_id'] == OA2
    sql(f"INSERT INTO learning.evidence(claim_id,learner_id,observed,actor,direction,strength,provenance) VALUES ('{claim['id']}','{A}','Observed','learner','supports','weak',jsonb_build_object('kind','test'));")
    call('reparent_claims', {'claim_ids':[claim['id'],second['id']],'objective_id':OA}, A, 'P0001')
    assert count('claims',f"id='{claim['id']}' AND objective_id='{OA2}'") == 1
    assert count('claims',f"id='{second['id']}' AND objective_id='{OA}'") == 1
    assert count('evidence') == 1
    model = json.loads(sql('SELECT to_jsonb(evidence_models.*) FROM learning.evidence_models LIMIT 1;').stdout)
    call('update_evidence_model', {'id':model['id'],'patch':{'per_episode_cap':0}}, A, '42501')
    changed = call('update_evidence_model', {'id':model['id'],'patch':{'per_episode_cap':0,'strong_min_distinct_episodes':1}}, OP)['evidence_model']
    assert changed['per_episode_cap'] == 0 and changed['updated_by'] == OP
    # Proposal source rows remain owned; editorial columns never come from input.
    ea,eb,ra,rb=[str(uuid.uuid4()) for _ in range(4)]
    sql(f"""
      INSERT INTO learning.work_episodes(id,learner_id,source,schema_version,payload) VALUES
        ('{ea}','{A}','test',1,'{{}}'),('{eb}','{B}','test',1,'{{}}');
      INSERT INTO learning.residue(id,learner_id,episode_id,candidate,pass_id,pass_at,ontology_version) VALUES
        ('{ra}','{A}','{ea}','Candidate A','test',now(),1),('{rb}','{B}','{eb}','Candidate B','test',now(),1);
    """)
    call('propose_capability', {'residue_ids':[ra,rb],'title':'Foreign'}, A, 'P0002')
    call('propose_capability', {'residue_ids':[ra],'title':'Foreign operator'}, OP, 'P0002')
    assert count('capability_proposals') == 0
    caps,versions=count('capabilities'),count('ontology_versions')
    proposal=call('propose_capability', {'residue_ids':[ra],'title':'Candidate','nearest_capability_id':'cap_target'})['proposal']
    assert proposal['status']=='proposed' and proposal['proposed_by_kind']=='agent' and proposal['proposed_by']==A
    assert count('capabilities')==caps and count('ontology_versions')==versions
    # Direct RPC calls exercise validation independently of the HTTP schema.
    bad=[
      ('create_capability',{'id':'cap_spoof','title':'Spoof','learner_id':A}),
      ('create_capability',{'id':'cap_spoof','title':'Spoof','introduced_in':1}),
      ('create_capability',{'id':'cap_spoof','title':1}),
      ('create_claim_template',{'statement':'Test','capability_id':''}),
      ('instantiate_claim',{'claim_template_id':'bad','objective_id':OA}),
      ('instantiate_claim',{'claim_template_id':template['id'],'objective_id':OA,'sort_order':.1}),
      ('merge_capabilities',{'from':[],'into':'cap_target','reason':'Test'}),
      ('merge_capabilities',{'from':['cap_target'],'into':'cap_target','reason':'Test'}),
      ('merge_capabilities',{'from':['a','a'],'into':'cap_target','reason':'Test'}),
      ('reparent_claims',{'claim_ids':[],'objective_id':OA}),
      ('propose_capability',{'residue_ids':[],'title':'Test'}),
      ('propose_capability',{'residue_ids':[ra],'title':'Test','status':'approved'}),
      ('propose_capability',{'residue_ids':[ra],'title':'Test','proposed_by':B}),
      ('update_evidence_model',{'id':model['id'],'patch':{}}),
      ('update_evidence_model',{'id':model['id'],'patch':{'per_episode_cap':-1}}),
      ('update_evidence_model',{'id':model['id'],'patch':{'strong_min_distinct_projects':0}}),
      ('update_evidence_model',{'id':model['id'],'patch':{'updated_by':B}}),
    ]
    for operation,body in bad:
        call(operation,body,OP,'22023')
    assert sql("SELECT prosecdef FROM pg_proc WHERE oid='learning.apply_dml(text,jsonb)'::regprocedure;").stdout.strip()=='f'
    print(f'PASS: {checks} RPC cases; actual PostgreSQL17 RLS, rollback, caller identity, concurrency and seven verbs')
finally:
    subprocess.run(['docker','rm','-f',NAME],capture_output=True)
