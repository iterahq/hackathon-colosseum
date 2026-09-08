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
NAME = 'itera-authorization-test-' + uuid.uuid4().hex[:10]
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
    sql(next(migrations.glob('0085_*.sql')).read_text())
    sql(next(migrations.glob('0092_*.sql')).read_text())
    sql(next(migrations.glob('0092_*.sql')).read_text())
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
    call('create_capability', {'id':'cap_reference','title':'Reference'}, OP)
    def fingerprint():
        return sql("SELECT jsonb_build_object('caps',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM learning.capabilities c),'versions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY version) FROM learning.ontology_versions v));").stdout
    def probe(expected, caller=A):
        global checks
        before=fingerprint()
        result=json.loads(sql("SELECT learning.probe_authorization('capabilities','insert_shared','cap_reference');",caller).stdout)
        assert result['outcome']==expected, result
        assert result['rolled_back'] is True and fingerprint()==before
        checks+=1
        return result
    assert probe('rls_denied')['sqlstate']=='42501'
    assert probe('allowed_rolled_back', OP)['sqlstate'] is None
    # A broken policy must be observable without leaving the probe row behind.
    sql("CREATE POLICY test_unexpected_permission ON learning.capabilities FOR INSERT WITH CHECK (true);")
    assert probe('allowed_rolled_back')['rls_active'] is True
    sql("DROP POLICY test_unexpected_permission ON learning.capabilities;")
    # Missing table privilege is not an RLS proof.
    sql("REVOKE INSERT ON learning.capabilities FROM authenticated;")
    assert probe('permission_denied')['insert_granted'] is False
    sql("GRANT INSERT ON learning.capabilities TO authenticated;")
    # Constraints and unrelated trigger failures cannot certify RLS.
    sql("ALTER TABLE learning.capabilities ADD CONSTRAINT test_probe_constraint CHECK (id NOT LIKE 'cap_authorization_probe_%');")
    assert probe('constraint_failed', OP)['sqlstate']=='23514'
    sql("ALTER TABLE learning.capabilities DROP CONSTRAINT test_probe_constraint;")
    for resource,operation,reference in [('other','insert_shared','cap_reference'),('capabilities','delete','cap_reference'),('capabilities','insert_shared','missing')]:
        before=fingerprint()
        p=sql(f"SELECT learning.probe_authorization('{resource}','{operation}','{reference}');",A,ok=False)
        assert p.returncode and '22023' in p.stderr and before==fingerprint()
        checks+=1
    for role in ['anon','service_role']:
        before=fingerprint()
        p=sql("SELECT learning.probe_authorization('capabilities','insert_shared','cap_reference');",A,role=role,ok=False)
        assert p.returncode and '42501' in p.stderr and before==fingerprint()
        checks+=1
    assert sql("SELECT prosecdef FROM pg_proc WHERE oid='learning.probe_authorization(text,text,text)'::regprocedure;").stdout.strip()=='f'
    assert probe('rls_denied')['insert_granted'] is True
    print(json.dumps({'checks':checks,'security_invoker':True,'all_candidate_writes_rolled_back':True,'production_connections':0}))
finally:
    subprocess.run(['docker','rm','-f',NAME],capture_output=True)
