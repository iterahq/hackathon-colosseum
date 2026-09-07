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
NAME = 'itera-proposal-test-' + uuid.uuid4().hex[:10]
OP, A, B = ['00000000-0000-4000-8000-00000000000' + str(i) for i in range(1, 4)]
OA, OA2, OB = ['10000000-0000-4000-8000-00000000000' + str(i) for i in range(1, 4)]
checks = 0
parser = argparse.ArgumentParser()
parser.add_argument('--before', action='store_true')
parser.add_argument('--dependency', action='append', type=Path, default=list((ROOT / 'db/migrations').glob('008[56]_*.sql')))
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
    for number in [67, 69, 70, 71, 72, 73, 74, 77, 78, 79, 80, 81, 82, 83, 84] + sorted({int(p.name[:4]) for p in args.dependency if p.name[:4] in ('0085','0086')}) + ([] if args.before else [87]):
        matches = sorted(migrations.glob(f'{number:04d}_*.sql'))
        if not matches:
            matches = [p for p in args.dependency if p.name.startswith(f'{number:04d}_')]
        if number in (80,81):
            assert len(matches)==1, f'Missing correction {number:04d}; supply --dependency before its merge'
        if number not in (80, 81):
            assert len(matches) == 1, number
        for migration in matches:
            sql(migration.read_text())
    if not args.before:
        sql(next(migrations.glob('0087_*.sql')).read_text())  # idempotent DDL
    sql(f"""
      INSERT INTO itera.users VALUES ('{OP}'),('{A}'),('{B}');
      INSERT INTO itera.tenants VALUES ('{OP}','itera');
      INSERT INTO itera.memberships VALUES ('{OP}','{OP}','owner');
      INSERT INTO learning.learners(id) VALUES ('{OP}'),('{A}'),('{B}');
      INSERT INTO learning.learning_objectives(id,learner_id,title) VALUES
        ('{OA}','{A}','First'),('{OA2}','{A}','Second'),('{OB}','{B}','Foreign');
    """)
    # No decision may touch evidence, including a delete/insert replacement.
    sql("""CREATE FUNCTION itera.refuse_test_evidence_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'decision touched evidence'; END $$;
      CREATE TRIGGER decision_no_evidence BEFORE INSERT OR UPDATE OR DELETE ON learning.evidence FOR EACH STATEMENT EXECUTE FUNCTION itera.refuse_test_evidence_write();""")
    episode=str(uuid.uuid4())
    sql(f"INSERT INTO learning.work_episodes(id,learner_id,source,schema_version,payload) VALUES ('{episode}','{A}','test',1,'{{}}');")
    def propose(size=3):
        ids=[str(uuid.uuid4()) for _ in range(size)]
        for rid in ids:
            sql(f"INSERT INTO learning.residue(id,learner_id,episode_id,candidate,pass_id,pass_at,ontology_version) VALUES ('{rid}','{A}','{episode}','A candidate','test',now(),1);", A)
        before=(count('capabilities'),count('ontology_versions'))
        proposal=call('propose_capability',{'residue_ids':ids,'title':'New capability','description':'Suggested description'},A)['proposal']
        assert proposal['status']=='proposed' and proposal['proposed_by_kind']=='agent'
        assert (count('capabilities'),count('ontology_versions'))==before
        return proposal,ids
    proposal,ids=propose()
    before=(count('capabilities'),count('ontology_versions'))
    result=call('approve_proposal',{'id':proposal['id'],'capability':{'id':'cap_promoted'}},OP)
    assert result['proposal']['status']=='approved' and result['proposal']['decided_by']==OP
    assert result['capability']['source']=={'kind':'promoted','proposal_id':proposal['id']}
    assert result['capability']['title']=='New capability' and result['capability']['description']=='Suggested description'
    assert result['capability']['learner_id'] is None
    assert result['capability']['introduced_in']==result['ontology_version']==result['proposal']['ontology_version']
    assert result['residue_updated']==3
    assert (count('capabilities'),count('ontology_versions'))==(before[0]+1,before[1]+1)
    assert count('residue',"status='promoted' AND promoted_to_capability_id='cap_promoted'")==3
    assert count('evidence')==0
    # P.3/P.4: merge and reject preserve vocabulary/version counts.
    proposal2,ids2=propose()
    before=(count('capabilities'),count('ontology_versions'))
    merged=call('merge_proposal',{'id':proposal2['id'],'into_capability_id':'cap_promoted'},OP)
    assert merged['proposal']['status']=='merged' and merged['proposal']['ontology_version'] is None
    assert merged['proposal']['capability_id']=='cap_promoted' and merged['residue_updated']==3
    assert (count('capabilities'),count('ontology_versions'))==before
    proposal3,ids3=propose()
    rejected=call('reject_proposal',{'id':proposal3['id'],'reason':'  Noise  '},OP)
    assert rejected['proposal']['status']=='rejected' and rejected['proposal']['decision_note']=='Noise'
    assert rejected['proposal']['capability_id'] is None and rejected['proposal']['ontology_version'] is None
    assert count('residue',"status='dismissed'")==3
    assert (count('capabilities'),count('ontology_versions'))==before
    # All five entrypoints enforce regular-user and operator checks directly.
    pending,pending_ids=propose()
    decisions=[('approve_proposal',{'id':pending['id'],'capability':{'id':'cap_pending'}}),
      ('merge_proposal',{'id':pending['id'],'into_capability_id':'cap_promoted'}),
      ('reject_proposal',{'id':pending['id'],'reason':'Noise'}),
      ('promote_residue',{'proposal_id':pending['id'],'residue_ids':pending_ids,'into':'cap_promoted'}),
      ('dismiss_residue',{'proposal_id':pending['id'],'residue_ids':pending_ids,'reason':'Noise'})]
    for operation,body in decisions:
        call(operation,body,A,'42501')
        for role in ('anon','service_role'):
            call(operation,body,OP,'42501',role)
        call(operation,{**body,'decided_by':A},OP,'22023')
    assert sql(f"WITH changed AS (UPDATE learning.capability_proposals SET status='approved' WHERE id='{pending['id']}' RETURNING id) SELECT count(*) FROM changed;",A).stdout.strip()=='0'
    # Missing suggestion is explicit, never a generated vocabulary ID.
    call('approve_proposal',{'id':pending['id']},OP,'22023')
    for override in ({},{'id':''},{'id':'x','source':{}},{'title':None},{'description':4}):
        call('approve_proposal',{'id':pending['id'],'capability':override},OP,'22023')
    # Duplicate capability ID fails after a version INSERT; rollback is complete.
    versions=count('ontology_versions')
    call('approve_proposal',{'id':pending['id'],'capability':{'id':'cap_promoted'}},OP,'23505')
    assert count('ontology_versions')==versions and count('capability_proposals',f"id='{pending['id']}' AND status='proposed'")==1
    assert count('residue',f"id=ANY(ARRAY{pending_ids}::uuid[]) AND status='open'")==3
    # Aliases must name a proposal and exactly its cluster, in any order.
    call('promote_residue',{'residue_ids':pending_ids,'into':'cap_promoted'},OP,'22023')
    for bad_ids in ([],pending_ids[:1],[pending_ids[0],pending_ids[0]],[str(uuid.uuid4())]):
        call('promote_residue',{'proposal_id':pending['id'],'residue_ids':bad_ids,'into':'cap_promoted'},OP,'22023')
    alias=call('promote_residue',{'proposal_id':pending['id'],'residue_ids':list(reversed(pending_ids)),'into':'cap_promoted'},OP)
    assert alias['proposal']['status']=='merged' and alias['residue_updated']==3
    pending,pending_ids=propose()
    alias=call('dismiss_residue',{'proposal_id':pending['id'],'residue_ids':pending_ids,'reason':'Noise'},OP)
    assert alias['proposal']['status']=='rejected'
    # Optional override inherits an existing ID suggestion and permits NULL description.
    suggested,suggested_ids=propose()
    sql(f"UPDATE learning.capability_proposals SET proposed_id='cap_suggested' WHERE id='{suggested['id']}';")
    approved=call('approve_proposal',{'id':suggested['id'],'capability':{'description':None}},OP)
    assert approved['capability']['id']=='cap_suggested' and approved['capability']['description'] is None
    call('approve_proposal',{'id':suggested['id']},OP,'P0001')
    # Current shared targets only; an operator cannot attach private vocabulary.
    sql(f"INSERT INTO learning.capabilities(id,learner_id,title,source,introduced_in) VALUES ('cap_private','{A}','Private','{{\"kind\":\"editorial\"}}',1);")
    current,_=propose()
    for target in ('missing','cap_private'):
        call('merge_proposal',{'id':current['id'],'into_capability_id':target},OP,'P0002')
    sql("UPDATE learning.capabilities SET retired_in=1 WHERE id='cap_private';")
    call('merge_proposal',{'id':current['id'],'into_capability_id':'cap_private'},OP,'P0002')
    retired=call('create_capability',{'id':'cap_retired','title':'Retired'},OP)
    sql(f"UPDATE learning.capabilities SET retired_in={retired['ontology_version']} WHERE id='cap_retired';",OP)
    call('merge_proposal',{'id':current['id'],'into_capability_id':'cap_retired'},OP,'P0002')
    call('reject_proposal',{'id':str(uuid.uuid4()),'reason':'Missing'},OP,'P0002')
    call('dismiss_residue',{'proposal_id':current['id'],'residue_ids':[current['residue_ids'][0],current['residue_ids'][0].upper()],'reason':'Duplicate'},OP,'22023')
    invalid_stored=str(uuid.uuid4())
    sql(f"INSERT INTO learning.capability_proposals(id,title,residue_ids,proposed_by_kind,proposed_by) VALUES ('{invalid_stored}','Invalid cluster',ARRAY['{current['residue_ids'][0]}','{current['residue_ids'][0]}']::uuid[],'human','{OP}');",OP)
    call('reject_proposal',{'id':invalid_stored,'reason':'Invalid'},OP,'22023')
    # P.7 own-plus-foreign proposal refuses before INSERT.
    eb,rb=str(uuid.uuid4()),str(uuid.uuid4())
    sql(f"INSERT INTO learning.work_episodes(id,learner_id,source,schema_version,payload) VALUES ('{eb}','{B}','test',1,'{{}}'); INSERT INTO learning.residue(id,learner_id,episode_id,candidate,pass_id,pass_at,ontology_version) VALUES ('{rb}','{B}','{eb}','Foreign','test',now(),1);")
    call('propose_capability',{'residue_ids':[current['residue_ids'][0],rb],'title':'Foreign'},A,'P0002')
    # Missing and changed residue fail before any decision side effect.
    gone,gone_ids=propose()
    sql(f"DELETE FROM learning.residue WHERE id='{gone_ids[0]}';")
    call('reject_proposal',{'id':gone['id'],'reason':'Noise'},OP,'P0002')
    changed,changed_ids=propose()
    sql(f"UPDATE learning.residue SET status='dismissed' WHERE id='{changed_ids[0]}';",OP)
    call('reject_proposal',{'id':changed['id'],'reason':'Noise'},OP,'P0001')
    # Two real concurrent sessions: exactly one decision on a proposal.
    racing,racing_ids=propose()
    def raw(operation,body):
        payload=json.dumps(body).replace("'","''")
        return sql(f"SELECT learning.apply_dml('{operation}','{payload}'::jsonb);",OP,ok=False)
    def race(_):return raw('approve_proposal',{'id':racing['id'],'capability':{'id':'cap_race'}})
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        outcomes=list(pool.map(race,range(2)))
    assert sum(r.returncode==0 for r in outcomes)==1 and any('P0001' in r.stderr for r in outcomes)
    assert count('capabilities',"id='cap_race'")==1
    checks+=1
    # Overlapping pending proposals cannot decide one residue twice.
    overlap,overlap_ids=propose()
    overlap2=call('propose_capability',{'residue_ids':overlap_ids,'title':'Overlap'},A)['proposal']
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        outcomes=list(pool.map(lambda p:raw('merge_proposal',{'id':p,'into_capability_id':'cap_promoted'}),[overlap['id'],overlap2['id']]))
    assert sum(r.returncode==0 for r in outcomes)==1 and any('P0001' in r.stderr for r in outcomes)
    checks+=1
    # Approval and existing editorial write share version allocation.
    parallel,_=propose()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(raw,'approve_proposal',{'id':parallel['id'],'capability':{'id':'cap_parallel_approval'}}),pool.submit(raw,'create_capability',{'id':'cap_parallel_editorial','title':'Editorial'})]
        outcomes=[f.result() for f in futures]
    assert all(r.returncode==0 for r in outcomes),[r.stderr for r in outcomes]
    versions=[json.loads(r.stdout)['ontology_version'] for r in outcomes]
    assert abs(versions[0]-versions[1])==1
    checks+=1
    # A failure on the final proposal UPDATE rolls back capability, version and residue.
    broken,broken_ids=propose()
    sql(f"CREATE FUNCTION itera.refuse_test_decision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='{broken['id']}'::uuid THEN RAISE EXCEPTION 'forced final write failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER final_failure BEFORE UPDATE ON learning.capability_proposals FOR EACH ROW EXECUTE FUNCTION itera.refuse_test_decision();")
    before=(count('capabilities'),count('ontology_versions'))
    call('approve_proposal',{'id':broken['id'],'capability':{'id':'cap_broken'}},OP,'P0001')
    assert (count('capabilities'),count('ontology_versions'))==before
    assert count('residue',f"id=ANY(ARRAY{broken_ids}::uuid[]) AND status='open'")==3
    assert count('capability_proposals',f"id='{broken['id']}' AND status='proposed'")==1
    assert count('evidence')==0
    assert sql("SELECT prosecdef FROM pg_proc WHERE oid='learning.apply_dml(text,jsonb)'::regprocedure;").stdout.strip()=='f'
    print(f'PASS: {checks} proposal cases; P1-P7, all five verbs, caller RLS, rollback, concurrency and zero evidence writes')
finally:
    subprocess.run(['docker','rm','-f',NAME],capture_output=True)
