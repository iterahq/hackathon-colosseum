#!/usr/bin/env python3
"""Exercise the capability graph transition against isolated PostgreSQL 17."""

import json
from pathlib import Path
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional
import uuid


ROOT = Path(__file__).resolve().parents[2]
NAME = "itera-graph-transition-" + uuid.uuid4().hex[:10]
OP, A, B = ["00000000-0000-4000-8000-00000000000" + str(i) for i in range(1, 4)]
OA, OB = ["10000000-0000-4000-8000-00000000000" + str(i) for i in range(1, 3)]


def sql(statement: str, caller: Optional[str] = None, role: str = "authenticated", ok: bool = True):
    if caller:
        statement = f"SET ROLE {role}; SET test.caller='{caller}'; " + statement
    result = subprocess.run(
        [
            "docker", "exec", "-i", NAME, "psql", "-X", "-qAt", "-h", "/tmp",
            "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
        ],
        input=statement,
        text=True,
        capture_output=True,
    )
    if ok and result.returncode:
        raise AssertionError(result.stderr)
    return result


def rpc(function: str, expected_rows: List[dict], caller: str, error: Optional[str] = None):
    payload = json.dumps(expected_rows, separators=(",", ":")).replace("'", "''")
    result = sql(
        f"SELECT learning.{function}('{payload}'::jsonb);",
        caller,
        ok=error is None,
    )
    if error:
        assert result.returncode != 0 and error in result.stderr, result.stderr
        return None
    return int(result.stdout.strip())


def relation_import(
    rows: List[dict],
    caller: str,
    error: Optional[str] = None,
    role: str = "authenticated",
):
    payload = json.dumps(rows, separators=(",", ":")).replace("'", "''")
    result = sql(
        "SELECT coalesce(jsonb_agg(to_jsonb(result) - 'input_order' "
        "ORDER BY result.input_order), '[]'::jsonb) "
        f"FROM learning.upsert_capability_graph_relations('{payload}'::jsonb) "
        "WITH ORDINALITY AS result(id, source, input_order);",
        caller,
        role=role,
        ok=error is None,
    )
    if error:
        assert result.returncode != 0 and error in result.stderr, result.stderr
        return None
    return json.loads(result.stdout)


def relation_preimage(relation_id: str) -> dict:
    query = f"""
      SELECT jsonb_build_object(
        'id', id,
        'from_concept_id', from_concept_id,
        'to_concept_id', to_concept_id,
        'relation_type', relation_type,
        'source', source,
        'created_at', created_at,
        'updated_at', updated_at
      )
      FROM learning.concept_relations WHERE id='{relation_id}';
    """
    return json.loads(sql(query).stdout)


def claim_link_preimage(link_id: str) -> dict:
    query = f"""
      SELECT jsonb_build_object(
        'id', id,
        'claim_id', claim_id,
        'learner_id', learner_id,
        'concept_id', concept_id,
        'relation', relation,
        'created_at', created_at
      )
      FROM learning.claim_concepts WHERE id='{link_id}';
    """
    return json.loads(sql(query).stdout)


try:
    migration = ROOT / "db/migrations/0100_learning_capability_graph_endpoints.sql"
    assert migration.is_file(), "missing migration 0100_learning_capability_graph_endpoints.sql"

    subprocess.run(
        [
            "docker", "run", "-d", "--name", NAME, "--network", "none",
            "--user", "postgres", "--tmpfs", "/tmp:rw,mode=1777",
            "--entrypoint", "bash", "supabase/postgres:17.6.1.160", "-c",
            "initdb -D /tmp/db -A trust -U postgres >/tmp/init.log && "
            "exec postgres -D /tmp/db -k /tmp -c listen_addresses=",
        ],
        check=True,
        capture_output=True,
    )
    for _ in range(60):
        if subprocess.run(
            ["docker", "exec", NAME, "pg_isready", "-h", "/tmp", "-U", "postgres"],
            capture_output=True,
        ).returncode == 0:
            break
        time.sleep(0.25)

    sql(f"""
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE service_role NOLOGIN;
      CREATE SCHEMA itera;
      CREATE TABLE itera.users(id uuid PRIMARY KEY);
      CREATE TABLE itera.tenants(id uuid PRIMARY KEY, slug text);
      CREATE TABLE itera.memberships(user_id uuid, tenant_id uuid, role text);
      CREATE FUNCTION itera.current_itera_user_id() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('test.caller', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA itera TO authenticated;
      GRANT SELECT ON itera.users TO authenticated;
      INSERT INTO itera.users VALUES ('{OP}'), ('{A}'), ('{B}');
      INSERT INTO itera.tenants VALUES ('{OP}', 'itera');
      INSERT INTO itera.memberships VALUES ('{OP}', '{OP}', 'owner');
    """)

    migrations = ROOT / "db/migrations"
    for number in [67, 69, 70, 71, 72, 73, 74, 77, 78, 79, 80, 81]:
        matches = sorted(migrations.glob(f"{number:04d}_*.sql"))
        assert len(matches) == 1, f"missing migration {number:04d}"
        sql(matches[0].read_text())
    sql(migration.read_text())
    sql(migration.read_text())

    sql(f"""
      INSERT INTO learning.learners(id) VALUES ('{OP}'), ('{A}'), ('{B}');
      INSERT INTO learning.learning_objectives(id, learner_id, title) VALUES
        ('{OA}', '{A}', 'Owned'), ('{OB}', '{B}', 'Foreign');
      INSERT INTO learning.claims(id, objective_id, learner_id, title) VALUES
        ('20000000-0000-4000-8000-000000000001', '{OA}', '{A}', 'Owned claim'),
        ('20000000-0000-4000-8000-000000000002', '{OB}', '{B}', 'Foreign claim');
      INSERT INTO learning.concepts(id, label, kind, source) VALUES
        ('concept_a', 'A', 'principle', '{{}}'),
        ('concept_b', 'B', 'principle', '{{}}'),
        ('concept_c', 'C', 'principle', '{{}}'),
        ('concept_plain', 'Plain', 'principle', '{{}}');
      INSERT INTO learning.capabilities(id, title, concept_id, source, introduced_in) VALUES
        ('cap_a', 'A', 'concept_a', '{{"kind":"editorial"}}', 1),
        ('cap_b', 'B', 'concept_b', '{{"kind":"editorial"}}', 1),
        ('cap_c', 'C', 'concept_c', '{{"kind":"editorial"}}', 1);
      INSERT INTO learning.concept_relations(
        id, from_concept_id, to_concept_id, relation_type, source, created_at, updated_at
      ) VALUES
        ('30000000-0000-4000-8000-000000000001', 'concept_a', 'concept_plain',
         'requires', '{{"note":"one"}}', '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
        ('30000000-0000-4000-8000-000000000002', 'concept_b', 'concept_c',
         'composes', '{{"note":"two"}}', '2026-09-03T00:00:00Z', '2026-09-04T00:00:00Z');
      INSERT INTO learning.claim_concepts(
        id, claim_id, learner_id, concept_id, relation, created_at
      ) VALUES
        ('40000000-0000-4000-8000-000000000001',
         '20000000-0000-4000-8000-000000000001', '{A}', 'concept_a', 'targets',
         '2026-09-05T00:00:00Z'),
        ('40000000-0000-4000-8000-000000000002',
         '20000000-0000-4000-8000-000000000002', '{B}', 'concept_b', 'targets',
        '2026-09-06T00:00:00Z');
    """)

    # Existing imports name the legacy full unique indexes in ON CONFLICT.
    # These statements must still infer their conflict targets after 0100.
    sql(f"""
      INSERT INTO learning.concept_relations(
        from_concept_id, to_concept_id, relation_type, source
      ) VALUES ('concept_plain', 'concept_c', 'supports', '{{"writer":"legacy"}}')
      ON CONFLICT (from_concept_id, to_concept_id, relation_type)
      DO UPDATE SET source = excluded.source;
      INSERT INTO learning.concept_relations(
        from_concept_id, to_concept_id, relation_type, source
      ) VALUES ('concept_plain', 'concept_c', 'supports', '{{"writer":"legacy"}}')
      ON CONFLICT (from_concept_id, to_concept_id, relation_type)
      DO UPDATE SET source = excluded.source;
      INSERT INTO learning.claim_concepts(
        claim_id, learner_id, concept_id, relation
      ) VALUES (
        '20000000-0000-4000-8000-000000000001', '{A}', 'concept_plain', 'supports'
      )
      ON CONFLICT (claim_id, concept_id) DO NOTHING;
      INSERT INTO learning.claim_concepts(
        claim_id, learner_id, concept_id, relation
      ) VALUES (
        '20000000-0000-4000-8000-000000000001', '{A}', 'concept_plain', 'supports'
      )
      ON CONFLICT (claim_id, concept_id) DO NOTHING;
    """)
    assert sql("""
      SELECT
        (SELECT count(*) FROM learning.concept_relations
         WHERE from_concept_id='concept_plain' AND to_concept_id='concept_c'
           AND relation_type='supports') = 1
        AND
        (SELECT count(*) FROM learning.claim_concepts
         WHERE claim_id='20000000-0000-4000-8000-000000000001'
           AND concept_id='concept_plain') = 1;
    """).stdout.strip() == "t"

    legacy_id = sql("""
      SELECT id FROM learning.concept_relations
      WHERE from_concept_id='concept_plain' AND to_concept_id='concept_c'
        AND relation_type='supports';
    """).stdout.strip()
    legacy_import = {
        "from_concept_id": "concept_plain",
        "to_concept_id": "concept_c",
        "relation_type": "supports",
        "source": {"writer": "rpc", "confirmed": False},
        "updated_at": "2026-09-09T01:02:03Z",
    }
    relation_import([legacy_import], A, "42501", role="anon")
    relation_import([legacy_import], A, "42501", role="service_role")
    assert relation_import([legacy_import], A) == [
        {"id": legacy_id, "source": legacy_import["source"]}
    ]
    assert sql(f"""
      SELECT from_concept_id='concept_plain' AND from_capability_id IS NULL
        AND to_concept_id='concept_c' AND to_capability_id IS NULL
        AND source='{{"writer":"rpc","confirmed":false}}'::jsonb
        AND updated_at='2026-09-09T01:02:03Z'
      FROM learning.concept_relations WHERE id='{legacy_id}';
    """).stdout.strip() == "t"

    typed_import = {
        "from_concept_id": "concept_a",
        "to_concept_id": "concept_b",
        "relation_type": "generalizes",
        "source": {"writer": "rpc", "confirmed": True},
        "updated_at": "2026-09-09T02:03:04Z",
    }
    typed_result = relation_import([typed_import], OP)
    assert len(typed_result) == 1
    typed_id = typed_result[0]["id"]
    assert relation_import([typed_import], OP) == typed_result
    assert sql(f"""
      SELECT from_concept_id IS NULL AND from_capability_id='cap_a'
        AND to_concept_id IS NULL AND to_capability_id='cap_b'
      FROM learning.concept_relations WHERE id='{typed_id}';
    """).stdout.strip() == "t"
    ordered = relation_import([typed_import, legacy_import], OP)
    assert [row["id"] for row in ordered] == [typed_id, legacy_id]

    concurrent_base = {
        "from_concept_id": "concept_b",
        "to_concept_id": "concept_plain",
        "relation_type": "concurrent",
        "updated_at": "2026-09-09T02:04:05Z",
    }
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(
                relation_import,
                [{**concurrent_base, "source": {"writer": writer}}],
                OP,
            )
            for writer in ["one", "two"]
        ]
        concurrent_results = [future.result() for future in futures]
    assert concurrent_results[0][0]["id"] == concurrent_results[1][0]["id"]
    assert sql("""
      SELECT count(*) FROM learning.concept_relations
      WHERE relation_type='concurrent';
    """).stdout.strip() == "1"

    sql("""
      INSERT INTO learning.concept_relations(
        id, from_concept_id, to_concept_id, relation_type, source
      ) VALUES (
        '30000000-0000-4000-8000-000000000010',
        'concept_a', 'concept_plain', 'conflicts', '{"shape":"legacy"}'
      );
      INSERT INTO learning.concept_relations(
        id, from_capability_id, to_concept_id, relation_type, source
      ) VALUES (
        '30000000-0000-4000-8000-000000000011',
        'cap_a', 'concept_plain', 'conflicts', '{"shape":"typed"}'
      );
    """)
    ambiguous_import = {
        "from_concept_id": "concept_a",
        "to_concept_id": "concept_plain",
        "relation_type": "conflicts",
        "source": {"writer": "must-rollback"},
        "updated_at": "2026-09-09T03:04:05Z",
    }
    rollback_import = {
        "from_concept_id": "concept_b",
        "to_concept_id": "concept_plain",
        "relation_type": "precedes",
        "source": {"writer": "must-rollback"},
        "updated_at": "2026-09-09T03:04:05Z",
    }
    relation_import([rollback_import, ambiguous_import], OP, "P0001")
    assert sql("""
      SELECT count(*) FROM learning.concept_relations
      WHERE relation_type='precedes';
    """).stdout.strip() == "0"
    relation_import([typed_import, typed_import], OP, "22023")

    relation_one = relation_preimage("30000000-0000-4000-8000-000000000001")
    relation_two = relation_preimage("30000000-0000-4000-8000-000000000002")
    claim_one = claim_link_preimage("40000000-0000-4000-8000-000000000001")
    claim_two = claim_link_preimage("40000000-0000-4000-8000-000000000002")

    rpc("migrate_capability_relation_endpoints", [relation_one], A, "42501")
    assert rpc("migrate_capability_relation_endpoints", [relation_one], OP) == 1
    assert sql("""
      SELECT from_concept_id IS NULL AND from_capability_id='cap_a'
         AND to_concept_id='concept_plain' AND to_capability_id IS NULL
         AND created_at='2026-09-01T00:00:00Z' AND updated_at='2026-09-02T00:00:00Z'
      FROM learning.concept_relations
      WHERE id='30000000-0000-4000-8000-000000000001';
    """).stdout.strip() == "t"
    assert rpc("migrate_capability_relation_endpoints", [relation_one], OP) == 0

    # A replay must reject a different valid capability target.
    sql("""
      UPDATE learning.concept_relations SET from_capability_id='cap_b'
      WHERE id='30000000-0000-4000-8000-000000000001';
    """)
    rpc("migrate_capability_relation_endpoints", [relation_one], OP, "P0001")
    assert sql("""
      SELECT from_capability_id FROM learning.concept_relations
      WHERE id='30000000-0000-4000-8000-000000000001';
    """).stdout.strip() == "cap_b"

    # A conflict rolls back other old rows in the same request.
    rpc(
        "migrate_capability_relation_endpoints",
        [relation_one, relation_two],
        OP,
        "P0001",
    )
    assert sql("""
      SELECT from_concept_id FROM learning.concept_relations
      WHERE id='30000000-0000-4000-8000-000000000002';
    """).stdout.strip() == "concept_b"
    sql("""
      UPDATE learning.concept_relations SET from_capability_id='cap_a'
      WHERE id='30000000-0000-4000-8000-000000000001';
    """)
    assert rpc(
        "migrate_capability_relation_endpoints",
        [relation_one, relation_two],
        OP,
    ) == 1
    assert rpc(
        "migrate_capability_relation_endpoints",
        [relation_one, relation_two],
        OP,
    ) == 0

    # Separate physical indexes must not admit one logical edge twice.
    sql("""
      INSERT INTO learning.concept_relations(
        id, from_concept_id, to_concept_id, relation_type, source, created_at, updated_at
      ) VALUES (
        '30000000-0000-4000-8000-000000000003', 'concept_a', 'concept_plain',
        'requires', '{"note":"duplicate"}', '2026-09-07T00:00:00Z',
        '2026-09-08T00:00:00Z'
      );
    """)
    relation_duplicate = relation_preimage("30000000-0000-4000-8000-000000000003")
    rpc("migrate_capability_relation_endpoints", [relation_duplicate], OP, "P0001")
    assert sql("""
      SELECT from_concept_id FROM learning.concept_relations
      WHERE id='30000000-0000-4000-8000-000000000003';
    """).stdout.strip() == "concept_a"
    rpc("migrate_capability_relation_endpoints", [relation_one, relation_one], OP, "22023")
    rpc(
        "migrate_capability_relation_endpoints",
        [{**relation_one, "extra": True}],
        OP,
        "22023",
    )

    assert rpc("migrate_claim_concept_capability_links", [claim_one], A) == 1
    assert rpc("migrate_claim_concept_capability_links", [claim_one], A) == 0
    sql("""
      UPDATE learning.claim_concepts SET capability_id='cap_c'
      WHERE id='40000000-0000-4000-8000-000000000001';
    """)
    rpc("migrate_claim_concept_capability_links", [claim_one], A, "P0001")
    assert sql("""
      SELECT capability_id FROM learning.claim_concepts
      WHERE id='40000000-0000-4000-8000-000000000001';
    """).stdout.strip() == "cap_c"
    rpc("migrate_claim_concept_capability_links", [claim_two], A, "P0002")
    sql("""
      UPDATE learning.claim_concepts SET capability_id='cap_a'
      WHERE id='40000000-0000-4000-8000-000000000001';
      INSERT INTO learning.claim_concepts(
        id, claim_id, learner_id, concept_id, relation, created_at
      ) VALUES (
        '40000000-0000-4000-8000-000000000003',
        '20000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        'concept_a', 'supports', '2026-09-07T00:00:00Z'
      );
    """)
    claim_duplicate = claim_link_preimage("40000000-0000-4000-8000-000000000003")
    rpc("migrate_claim_concept_capability_links", [claim_duplicate], A, "P0001")
    assert sql("""
      SELECT concept_id FROM learning.claim_concepts
      WHERE id='40000000-0000-4000-8000-000000000003';
    """).stdout.strip() == "concept_a"

    relation_definition = sql("""
      SELECT lower(pg_get_functiondef(
        'learning.migrate_capability_relation_endpoints(jsonb)'::regprocedure
      ));
    """).stdout
    claim_definition = sql("""
      SELECT lower(pg_get_functiondef(
        'learning.migrate_claim_concept_capability_links(jsonb)'::regprocedure
      ));
    """).stdout
    import_definition = sql("""
      SELECT lower(pg_get_functiondef(
        'learning.upsert_capability_graph_relations(jsonb)'::regprocedure
      ));
    """).stdout
    for definition in [relation_definition, claim_definition]:
        assert "lock table learning.capabilities in share mode" in definition
        assert "in share row exclusive mode" in definition
        assert "for update" in definition
    assert "lock table learning.capabilities in share mode" in import_definition
    assert "lock table learning.concept_relations in share row exclusive mode" in import_definition
    assert sql("""
      SELECT bool_and(i.indpred IS NULL)
      FROM pg_index i
      WHERE i.indexrelid IN (
        'learning.uq_concept_relations_edge'::regclass,
        'learning.uq_claim_concepts_claim_concept'::regclass
      );
    """).stdout.strip() == "t"
    for signature in [
        "learning.upsert_capability_graph_relations(jsonb)",
        "learning.migrate_capability_relation_endpoints(jsonb)",
        "learning.migrate_claim_concept_capability_links(jsonb)",
    ]:
        assert sql(f"SELECT NOT prosecdef FROM pg_proc WHERE oid='{signature}'::regprocedure;").stdout.strip() == "t"
        assert sql(f"SELECT has_function_privilege('public', '{signature}', 'EXECUTE');").stdout.strip() == "f"
        assert sql(f"SELECT has_function_privilege('anon', '{signature}', 'EXECUTE');").stdout.strip() == "f"
        assert sql(f"SELECT has_function_privilege('authenticated', '{signature}', 'EXECUTE');").stdout.strip() == "t"

    print("PASS: graph endpoint transition preserves preimages, RLS, replay, and rollback")
finally:
    subprocess.run(["docker", "rm", "-f", NAME], capture_output=True)
