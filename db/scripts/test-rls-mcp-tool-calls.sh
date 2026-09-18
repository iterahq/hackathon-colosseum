#!/usr/bin/env bash
# ============================================================================
# test-rls-mcp-tool-calls.sh — assert, BEHAVIOURALLY, the RLS contract of
# itera.mcp_tool_calls (migration 0101).
#
# Plan 20260918-umami-traffic-report-and-tracking-coverage, task T19. The DFL
# twin of this proof is devfellowship/dfl-schema
# e2e/verify-mcp-tool-calls-rls.sql.
#
# THE CLAIMS
# ----------
#   1. a signed-in user inserts its own row with user_id OMITTED (the default
#      is auth.uid()) — this is exactly what the itera-mcp `supabase` sink does;
#   2. a signed-in user cannot insert a row that names another user;
#   3. a user reads its own rows and not the rows of another user;
#   4. the platform operator (itera.is_learning_operator()) reads every row;
#   5. append-only: UPDATE and DELETE are refused;
#   6. anon can neither read nor insert;
#   7. a User-Agent longer than 200 characters is refused.
#
# Each claim is then MUTATED so the assertion is watched going red. A guard
# nobody has seen fail is not evidence that it can.
#
# Same mechanics as test-rls-learner-state-history.sh: `SET LOCAL ROLE
# authenticated` with BOTH claim GUCs (auth.uid() differs between the CI image
# and production), a guard that refuses a BYPASSRLS role, and ONE transaction
# that is ROLLED BACK.
#
# The fixture inserts into auth.users. The 0009/0015/0044 provisioning trigger
# then creates the itera.users + itera.identities rows, which is the real path.
#
# Needs the throwaway Postgres of fresh-apply.sh, with the schema built.
#
# Exit 0 = every claim holds, and each one can be turned red.
# Exit 1 = an assertion failed, or a mutation did not turn its assertion red.
# Exit 2 = usage / environment error.
# ============================================================================
set -uo pipefail

command -v psql >/dev/null 2>&1 || { echo "ERROR: psql not found on PATH" >&2; exit 2; }
[[ -n "${PGHOST:-}" ]] || { echo "ERROR: PGHOST is unset — refusing to guess the target database" >&2; exit 2; }

case "${PGHOST}:${PGDATABASE:-}" in
  *kjefmwlopzeaqgqtlbdn*|*yoojxnggaxcqtsyjdrdx*|*supabase.com*|*supabase.co*)
    echo "ERROR: REFUSED: PGHOST looks like a real Supabase project. Throwaway databases only." >&2
    exit 2 ;;
esac

print_ok_lines() {
  local line
  while IFS= read -r line; do
    [[ "$line" == *"  ok "* ]] || continue
    printf '%s\n' "${line#NOTICE:  }"
  done <<< "$1"
}

print_first_error() {
  local line
  while IFS= read -r line; do
    if [[ "$line" == *"ERROR:"* ]]; then
      printf '        ERROR:%s\n' "${line#*ERROR:}"
      return 0
    fi
  done <<< "$1"
}

# auth.users ids (= JWT sub). Fixed so a failure traces back to a row.
S_A='dddddddd-0000-4000-8000-00000000000a'     # writer A
S_B='dddddddd-0000-4000-8000-00000000000b'     # writer B
S_OP='dddddddd-0000-4000-8000-00000000000c'    # platform operator

# ── the fixture ─────────────────────────────────────────────────────────────
# Three auth users. The provisioning trigger creates their itera.users rows.
# The operator then becomes owner of the `itera` platform tenant (0003 seed).
# B writes one row as the session role, so "A sees 0 of B" means HIDDEN, not
# empty.
read -r -d '' FIXTURE <<SQL
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('${S_A}',  'mtc-selftest-a@example.invalid',  'authenticated', 'authenticated'),
  ('${S_B}',  'mtc-selftest-b@example.invalid',  'authenticated', 'authenticated'),
  ('${S_OP}', 'mtc-selftest-op@example.invalid', 'authenticated', 'authenticated');

INSERT INTO itera.memberships (user_id, tenant_id, role)
SELECT i.user_id, t.id, 'owner'
  FROM itera.identities i, itera.tenants t
 WHERE i.provider_subject = '${S_OP}' AND t.slug = 'itera'
ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = 'owner';

INSERT INTO itera.mcp_tool_calls (server, tool, user_id, ok, error_code)
VALUES ('itera', 'list_programs', '${S_B}', false, 'tool_error');
SQL

as_authenticated() {
  local sub="$1"
  cat <<SQL
SET LOCAL ROLE authenticated;
DO \$guard\$
BEGIN
  PERFORM set_config('request.jwt.claims',
                     '{"sub":"${sub}","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '${sub}', true);
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'RLS NOT ENFORCED: current_user=% has BYPASSRLS', current_user;
  END IF;
  IF NOT current_setting('row_security')::bool THEN
    RAISE EXCEPTION 'RLS NOT ENFORCED: row_security is off';
  END IF;
  IF auth.uid() IS DISTINCT FROM '${sub}'::uuid THEN
    RAISE EXCEPTION 'identity did not resolve: auth.uid()=%, expected %', auth.uid(), '${sub}';
  END IF;
END
\$guard\$;
SQL
}

# ── claims 1, 2, 5, 7 as writer A ───────────────────────────────────────────
read -r -d '' ASSERT_WRITER <<SQL
$(as_authenticated "$S_A")
DO \$a\$
DECLARE n int;
BEGIN
  -- 1. own insert, user_id omitted — the sink's exact shape
  INSERT INTO itera.mcp_tool_calls (server, tool, session_id, client_name, duration_ms, ok)
  VALUES ('itera', 'list_programs', 'probe-session-a', 'probe', 12, true);
  SELECT count(*) INTO n FROM itera.mcp_tool_calls WHERE user_id = '${S_A}';
  IF n <> 1 THEN
    RAISE EXCEPTION 'writer A inserts and reads back its own row: reads % rows', n;
  END IF;
  RAISE NOTICE '  ok    writer A inserts its own row with user_id omitted';

  -- 2. forged attribution
  BEGIN
    INSERT INTO itera.mcp_tool_calls (server, tool, user_id, ok)
    VALUES ('itera', 'list_programs', '${S_B}', true);
    RAISE EXCEPTION 'forged user_id is refused: the insert was ACCEPTED';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '  ok    a row that names another user is refused';
  END;

  -- 5. append-only
  BEGIN
    UPDATE itera.mcp_tool_calls SET ok = false WHERE user_id = '${S_A}';
    RAISE EXCEPTION 'append-only: UPDATE was ACCEPTED';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '  ok    append-only: UPDATE refused';
  END;
  BEGIN
    DELETE FROM itera.mcp_tool_calls WHERE user_id = '${S_A}';
    RAISE EXCEPTION 'append-only: DELETE was ACCEPTED';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '  ok    append-only: DELETE refused';
  END;

  -- 7. the User-Agent cap
  BEGIN
    INSERT INTO itera.mcp_tool_calls (server, tool, ok, user_agent)
    VALUES ('itera', 'x', true, repeat('u', 201));
    RAISE EXCEPTION 'user_agent cap: a 201-character user_agent was STORED';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE '  ok    a 201-character user_agent is refused';
  END;
END
\$a\$;
RESET ROLE;
SQL

# ── claim 3: A reads only A ─────────────────────────────────────────────────
read -r -d '' ASSERT_ISOLATION <<SQL
$(as_authenticated "$S_A")
DO \$a\$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM itera.mcp_tool_calls WHERE user_id = '${S_B}';
  IF n <> 0 THEN
    RAISE EXCEPTION 'writer A reads a row of writer B: % rows', n;
  END IF;
  RAISE NOTICE '  ok    writer A does not read the row of writer B';
END
\$a\$;
RESET ROLE;
SQL

# ── claim 4: the operator reads both ────────────────────────────────────────
read -r -d '' ASSERT_OPERATOR <<SQL
$(as_authenticated "$S_OP")
DO \$a\$
DECLARE n int;
BEGIN
  IF NOT itera.is_learning_operator() THEN
    RAISE EXCEPTION 'fixture: the operator is not itera.is_learning_operator()';
  END IF;
  SELECT count(*) INTO n FROM itera.mcp_tool_calls WHERE user_id IN ('${S_A}', '${S_B}');
  IF n <> 2 THEN
    RAISE EXCEPTION 'the platform operator reads every row: reads % of 2', n;
  END IF;
  RAISE NOTICE '  ok    the platform operator reads both writers'' rows';
END
\$a\$;
RESET ROLE;
SQL

# ── claim 6: anon (claims cleared first — see the learner-state-history test)
read -r -d '' ASSERT_ANON <<SQL
SET LOCAL ROLE anon;
DO \$a\$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    SELECT count(*) INTO n FROM itera.mcp_tool_calls;
    RAISE EXCEPTION 'anon reads nothing: anon SELECTed the table and got % rows', n;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '  ok    anon cannot read';
  END;
  BEGIN
    INSERT INTO itera.mcp_tool_calls (server, tool, user_id, ok)
    VALUES ('itera', 'x', '${S_A}', true);
    RAISE EXCEPTION 'anon writes nothing: anon INSERTed a row';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '  ok    anon cannot insert';
  END;
END
\$a\$;
RESET ROLE;
SQL

# ── mutations: each must turn one named assertion red ───────────────────────
read -r -d '' MUT_INSERT_OPEN <<'SQL'
DROP POLICY IF EXISTS mcp_tool_calls_insert_self ON itera.mcp_tool_calls;
CREATE POLICY mcp_tool_calls_insert_self ON itera.mcp_tool_calls
  FOR INSERT TO authenticated WITH CHECK (true);
SQL

read -r -d '' MUT_READ_OPEN <<'SQL'
DROP POLICY IF EXISTS mcp_tool_calls_read_self ON itera.mcp_tool_calls;
CREATE POLICY mcp_tool_calls_read_self ON itera.mcp_tool_calls
  FOR SELECT TO authenticated USING (true);
SQL

read -r -d '' MUT_NO_OPERATOR <<'SQL'
DROP POLICY IF EXISTS mcp_tool_calls_read_operator ON itera.mcp_tool_calls;
SQL

read -r -d '' MUT_NO_INSERT_GRANT <<'SQL'
REVOKE INSERT ON itera.mcp_tool_calls FROM authenticated;
SQL

read -r -d '' MUT_UPDATE_GRANT <<'SQL'
GRANT UPDATE, DELETE ON itera.mcp_tool_calls TO authenticated;
CREATE POLICY mcp_tool_calls_mut_rw ON itera.mcp_tool_calls
  FOR ALL TO authenticated USING (user_id = auth.uid());
SQL

read -r -d '' MUT_ANON <<'SQL'
GRANT SELECT, INSERT ON itera.mcp_tool_calls TO anon;
CREATE POLICY mcp_tool_calls_mut_anon ON itera.mcp_tool_calls
  FOR ALL TO anon USING (true) WITH CHECK (true);
SQL

read -r -d '' MUT_UA_CAP <<'SQL'
ALTER TABLE itera.mcp_tool_calls DROP CONSTRAINT mcp_tool_calls_user_agent_chk;
SQL

run_phase() {
  local mutation="${1:-}" sql
  sql="BEGIN;
${FIXTURE}
${mutation}
${ASSERT_WRITER}
${ASSERT_ISOLATION}
${ASSERT_OPERATOR}
${ASSERT_ANON}
ROLLBACK;"
  printf '%s\n' "$sql" | psql -v ON_ERROR_STOP=1 -qX 2>&1
}

expect_red() {
  local label="$1" mutation="$2" needle="$3" out
  echo "phase — mutation: ${label}"
  if out="$(run_phase "$mutation")"; then
    echo "FAIL: ${label} was applied and every assertion still passed." >&2
    return 1
  fi
  if [[ "$out" == *"$needle"* ]]; then
    print_first_error "$out"
    echo "  -> RED, as required"
    return 0
  fi
  printf '%s\n' "$out" | sed 's/^/  /'
  echo "FAIL: the mutated run failed, but NOT on '${needle}'. The mutation proves nothing." >&2
  return 1
}

echo "RLS behaviour: itera.mcp_tool_calls (migration 0101)"
echo
echo "phase 1 — the table as migration 0101 defines it"
if OUT="$(run_phase '')"; then
  print_ok_lines "$OUT"
  echo "  -> GREEN"
else
  printf '%s\n' "$OUT" | sed 's/^/  /'
  echo "FAIL: itera.mcp_tool_calls does not hold its contract." >&2
  exit 1
fi
echo

expect_red 'INSERT policy opened to WITH CHECK (true)' \
           "$MUT_INSERT_OPEN" 'forged user_id is refused: the insert was ACCEPTED' || exit 1
expect_red 'own-row SELECT policy opened to USING (true)' \
           "$MUT_READ_OPEN" 'writer A reads a row of writer B' || exit 1
expect_red 'operator SELECT policy dropped' \
           "$MUT_NO_OPERATOR" 'the platform operator reads every row' || exit 1
expect_red 'INSERT grant revoked (the sink would drop every call)' \
           "$MUT_NO_INSERT_GRANT" 'permission denied for table mcp_tool_calls' || exit 1
expect_red 'UPDATE and DELETE granted' \
           "$MUT_UPDATE_GRANT" 'append-only: UPDATE was ACCEPTED' || exit 1
expect_red 'anon granted SELECT and INSERT' \
           "$MUT_ANON" 'anon reads nothing: anon SELECTed the table' || exit 1
expect_red 'the user_agent cap dropped' \
           "$MUT_UA_CAP" 'user_agent cap: a 201-character user_agent was STORED' || exit 1
echo
echo "passed: own insert, forged attribution refused, own-row read, operator"
echo "        reads all, append-only, anon refused, User-Agent capped — every"
echo "        assertion watched going red."
