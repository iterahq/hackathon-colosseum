#!/usr/bin/env bash
# ============================================================================
# test-rls-learner-state-history.sh — assert, BEHAVIOURALLY, that
# learning.learner_state_history is per-learner, append-only, and refuses a row
# that records no change.
#
# Migration 0077. Plan 20260902-itera-learning-apps-ux-redesign, task T15,
# question Q14 answered A.
#
# WHY A BEHAVIOURAL TEST AND NOT A SHAPE CHECK
# --------------------------------------------
# Every guard this repository owns asks "is the object THERE?".
# `test-rls-activity-visibility.sh` is the only one that asks "does it DO
# anything?", and it exists because on 2026-08-10 a policy was found in
# production with its predicate silently removed — byte-identical in every
# census snapshot, and readable by the wrong people for weeks.
#
# This table carries FOUR claims that a name check cannot see:
#
#   1. a learner reads their OWN transitions and nobody else's;
#   2. `anon` reads nothing at all;
#   3. it is APPEND-ONLY — no UPDATE, no DELETE, enforced by the absent grant
#      rather than by a policy or a trigger;
#   4. a row must record a CHANGE. `learner_state_history_is_a_change` is what
#      keeps a TRANSITION log from decaying into a RECOMPUTE log, and it carries
#      a deliberate asymmetry on `gate` that a reviewer will read as a typo (see
#      phase `noop-gate-appeared` below).
#
# Each is asserted, and each is then MUTATED so the assertion is watched going
# red. A guard nobody has seen fail is not evidence that it can.
#
# WHAT MAKES THE ANSWER REAL
# --------------------------
# RLS is evaluated against `current_user`. Assertions run after
# `SET LOCAL ROLE authenticated` — `rolbypassrls = f` — with real JWT claims in
# `request.jwt.claims`, which is literally what PostgREST does per request. The
# guard block refuses to let an assertion run as the BYPASSRLS session role,
# where everything would pass vacuously.
#
# Both claim GUCs are set, for the reason `test-rls-activity-visibility.sh`
# measured on 2026-08-10: `auth.uid()` is NOT the same function in the CI image
# as in production, and setting only the JSON form leaves it NULL in CI.
#
# Every fixture and every mutation lives in ONE transaction that is ROLLED
# BACK, so the database is untouched whatever happens.
#
# Needs the same throwaway Postgres as fresh-apply.sh (PGHOST/PGPORT/PGUSER/
# PGPASSWORD/PGDATABASE), with the schema already built.
#
# Exit 0 = all four claims hold, and every one of them can be turned red.
# Exit 1 = an assertion failed, or a mutation did not turn its assertion red.
# Exit 2 = usage / environment error.
# ============================================================================
set -uo pipefail

command -v psql >/dev/null 2>&1 || { echo "ERROR: psql not found on PATH" >&2; exit 2; }
[[ -n "${PGHOST:-}" ]] || { echo "ERROR: PGHOST is unset — refusing to guess the target database" >&2; exit 2; }

# This script writes fixture rows (inside a rolled-back transaction) and, in the
# mutation phases, replaces a policy, drops a constraint and grants UPDATE.
# None of that belongs anywhere near a real project.
case "${PGHOST}:${PGDATABASE:-}" in
  *kjefmwlopzeaqgqtlbdn*|*yoojxnggaxcqtsyjdrdx*|*supabase.com*|*supabase.co*)
    echo "ERROR: REFUSED: PGHOST looks like a real Supabase project. Throwaway databases only." >&2
    exit 2 ;;
esac

# Print every "  ok " line of a psql transcript, stripping psql's NOTICE prefix.
print_ok_lines() {
  local line
  while IFS= read -r line; do
    [[ "$line" == *"  ok "* ]] || continue
    printf '%s\n' "${line#NOTICE:  }"
  done <<< "$1"
}

# Print the first `ERROR:` line of a psql transcript. Pure bash — see the note
# inside expect_red about the PATH `grep` on the authoring host.
print_first_error() {
  local line
  while IFS= read -r line; do
    if [[ "$line" == *"ERROR:"* ]]; then
      printf '        ERROR:%s\n' "${line#*ERROR:}"
      return 0
    fi
  done <<< "$1"
}

# Fixed ids so a failure message can be traced back to a row.
U_A='cccccccc-0000-4000-8000-000000000001'        # learner A, itera.users.id
U_B='cccccccc-0000-4000-8000-000000000002'        # learner B, a different person
S_A='cccccccc-0000-4000-8000-00000000000a'        # auth.uid() of A
S_B='cccccccc-0000-4000-8000-00000000000b'
OBJ_A='cccccccc-0000-4000-8000-000000000011'
OBJ_B='cccccccc-0000-4000-8000-000000000012'
CLAIM_A='cccccccc-0000-4000-8000-000000000021'
CLAIM_B='cccccccc-0000-4000-8000-000000000022'
EP_A='cccccccc-0000-4000-8000-000000000031'
H_A='cccccccc-0000-4000-8000-000000000041'        # A's one existing transition
H_B='cccccccc-0000-4000-8000-000000000042'        # B's one existing transition
# The DELETE-grant fixture (migration 0077's third object). One activity, one
# response and one evidence row per learner, so "deleted my own" and "could not
# touch yours" are different answers.
A_ACT='cccccccc-0000-4000-8000-000000000051'
B_ACT='cccccccc-0000-4000-8000-000000000052'
A_RESP='cccccccc-0000-4000-8000-000000000061'
B_RESP='cccccccc-0000-4000-8000-000000000062'
A_EV='cccccccc-0000-4000-8000-000000000071'
B_EV='cccccccc-0000-4000-8000-000000000072'

# ── the fixture ─────────────────────────────────────────────────────────────
# Two learners who share nothing. Each already has ONE recorded transition, so
# "sees 1" and "sees 2" are different answers and the isolation assertion cannot
# pass by the table simply being empty.
read -r -d '' FIXTURE <<SQL
INSERT INTO itera.users (id, email) VALUES
  ('${U_A}', 'lsh-selftest-a@example.invalid'),
  ('${U_B}', 'lsh-selftest-b@example.invalid');

INSERT INTO itera.identities (user_id, provider, provider_subject) VALUES
  ('${U_A}', 'password', '${S_A}'),
  ('${U_B}', 'password', '${S_B}');

INSERT INTO learning.learners (id, display_name) VALUES
  ('${U_A}', 'selftest A'),
  ('${U_B}', 'selftest B');

INSERT INTO learning.learning_objectives (id, learner_id, title) VALUES
  ('${OBJ_A}', '${U_A}', 'selftest objective A'),
  ('${OBJ_B}', '${U_B}', 'selftest objective B');

INSERT INTO learning.claims (id, objective_id, learner_id, title) VALUES
  ('${CLAIM_A}', '${OBJ_A}', '${U_A}', 'selftest claim A'),
  ('${CLAIM_B}', '${OBJ_B}', '${U_B}', 'selftest claim B');

INSERT INTO learning.work_episodes (id, learner_id, source, session_ref, started_at)
  VALUES ('${EP_A}', '${U_A}', 'selftest', 'selftest-session-1', '2026-09-03T10:00:00Z');

-- One transition each, written as the session role so both exist before any
-- policy is asked about them.
INSERT INTO learning.learner_state_history
  (id, learner_id, claim_id, level, evidence_count, gate,
   previous_level, previous_evidence_count, previous_gate,
   reducer_version, episode_id, computed_at)
VALUES
  ('${H_A}', '${U_A}', '${CLAIM_A}', 'weak', 1, 'scored',
   'unknown', 0, 'unknown-no-mastery-evidence',
   'reducer-v3', '${EP_A}', '2026-09-03T10:05:00Z'),
  ('${H_B}', '${U_B}', '${CLAIM_B}', 'weak', 1, 'scored',
   'unknown', 0, 'unknown-no-mastery-evidence',
   'reducer-v3', NULL, '2026-09-03T10:05:00Z');

-- The cleanup chain T19's DELETE /v1/activities/:id walks, one per learner:
-- activity -> response -> the evidence that response produced.
INSERT INTO learning.activities (id, learner_id, claim_id, kind, spec, status) VALUES
  ('${A_ACT}', '${U_A}', '${CLAIM_A}', 'question', '{"kind":"question"}'::jsonb, 'answered'),
  ('${B_ACT}', '${U_B}', '${CLAIM_B}', 'question', '{"kind":"question"}'::jsonb, 'answered');

INSERT INTO learning.activity_responses (id, activity_id, learner_id, response) VALUES
  ('${A_RESP}', '${A_ACT}', '${U_A}', '{"option_ids":["a"]}'::jsonb),
  ('${B_RESP}', '${B_ACT}', '${U_B}', '{"option_ids":["a"]}'::jsonb);

INSERT INTO learning.evidence
  (id, claim_id, learner_id, activity_response_id, observed, actor, direction, strength, provenance)
VALUES
  ('${A_EV}', '${CLAIM_A}', '${U_A}', '${A_RESP}', 'answered it', 'learner', 'supports', 'medium',
   '{"extractor":"selftest"}'::jsonb),
  ('${B_EV}', '${CLAIM_B}', '${U_B}', '${B_RESP}', 'answered it', 'learner', 'supports', 'medium',
   '{"extractor":"selftest"}'::jsonb);
SQL

# ── the guard every authenticated assertion opens with ──────────────────────
# Becomes `authenticated`, installs real claims, and refuses to proceed unless
# RLS is genuinely engaged and the identity actually resolved. Without the last
# check, "sees 0 rows" would be indistinguishable from "the policy blocked it".
as_authenticated() {
  local sub="$1" sub_user="$2"
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
  IF itera.current_itera_user_id() IS DISTINCT FROM '${sub_user}'::uuid THEN
    RAISE EXCEPTION 'identity did not resolve: current_itera_user_id()=%, expected %',
                    itera.current_itera_user_id(), '${sub_user}';
  END IF;
END
\$guard\$;
SQL
}

# ── assertion 1: a learner reads only their own transitions ─────────────────
# assert_isolation <auth-sub> <itera-user-id> <label> <expected-own> <expected-total>
assert_isolation() {
  local sub="$1" sub_user="$2" label="$3" want_own="$4" want_total="$5"
  cat <<SQL
$(as_authenticated "$sub" "$sub_user")
DO \$a\$
DECLARE own int; total int;
BEGIN
  SELECT count(*) INTO own
    FROM learning.learner_state_history WHERE learner_id = '${sub_user}';
  SELECT count(*) INTO total
    FROM learning.learner_state_history
   WHERE id IN ('${H_A}', '${H_B}');

  IF own <> ${want_own} THEN
    RAISE EXCEPTION '${label}: sees % of its own rows, expected ${want_own}', own;
  END IF;
  IF total <> ${want_total} THEN
    RAISE EXCEPTION '${label}: sees % fixture rows in total, expected ${want_total}', total;
  END IF;
  RAISE NOTICE '  ok    ${label}: % own, % total', own, total;
END
\$a\$;
RESET ROLE;
SQL
}

# ── assertion 2: anon reads nothing ─────────────────────────────────────────
# `revoke all ... from anon` means anon is refused by PRIVILEGE, before RLS is
# even consulted. That is a stronger answer than "zero rows", so the assertion
# demands the privilege error by SQLSTATE and refuses to accept anything else.
#
# ⚠️ THE CLAIMS MUST BE CLEARED FIRST, and this was measured the hard way.
# `set_config(..., is_local => true)` is TRANSACTION-local, not role-local, so
# it survives `RESET ROLE`. Without the two resets below, this block runs as
# `anon` while still carrying the PREVIOUS assertion's learner JWT — and
# `itera.current_itera_user_id()` happily resolves it. The first run of the
# anon mutation reported "anon SELECTed the table and got 1 rows": anon was
# reading learner B's row through learner B's leftover identity. The assertion
# was red for the wrong reason, and in phase 1 it had been GREEN for the wrong
# reason too (the privilege refusal fires before RLS, so the stale identity was
# invisible).
#
# A real anonymous request carries no claims at all. The guard proves the reset
# took, so this cannot silently regress into the same false answer.
read -r -d '' ASSERT_ANON <<'SQL'
SET LOCAL ROLE anon;
DO $a$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF itera.current_itera_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'anon still carries an identity: current_itera_user_id()=%',
                    itera.current_itera_user_id();
  END IF;

  BEGIN
    SELECT count(*) INTO n FROM learning.learner_state_history;
    RAISE EXCEPTION 'anon reads nothing: anon SELECTed the table and got % rows', n;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '  ok    anon reads nothing: refused with insufficient_privilege';
  END;
END
$a$;
RESET ROLE;
SQL

# ── assertion 3: a genuine transition appends; a no-op does not ─────────────
# Three inserts as learner A, each with its own required verdict:
#
#   real-change        level moves weak -> intermediate            MUST be accepted
#   noop               every column identical to the previous      MUST be refused (23514)
#   noop-gate-appeared level and count unchanged, previous_gate    MUST be refused (23514)
#                      NULL and gate 'scored'
#
# The third is the reducer-v1 trap the migration header names: 4 live rows
# predate `inputs.gate`, so their first v3 recompute would look like a gate
# transition purely because the key appeared. If that row were accepted, the S7
# achievement band would render a `gate passed` nobody achieved.
read -r -d '' ASSERT_APPEND <<SQL
$(as_authenticated "$S_A" "$U_A")
DO \$a\$
DECLARE before_n int; after_n int;
BEGIN
  SELECT count(*) INTO before_n
    FROM learning.learner_state_history WHERE claim_id = '${CLAIM_A}';

  -- a real change: accepted
  INSERT INTO learning.learner_state_history
    (learner_id, claim_id, level, evidence_count, gate,
     previous_level, previous_evidence_count, previous_gate,
     reducer_version, episode_id, computed_at)
  VALUES ('${U_A}', '${CLAIM_A}', 'intermediate', 2, 'scored',
          'weak', 1, 'scored',
          'reducer-v3', '${EP_A}', '2026-09-03T11:00:00Z');

  SELECT count(*) INTO after_n
    FROM learning.learner_state_history WHERE claim_id = '${CLAIM_A}';
  IF after_n <> before_n + 1 THEN
    RAISE EXCEPTION 'a transition appends exactly one row: % -> %', before_n, after_n;
  END IF;
  RAISE NOTICE '  ok    a real transition appends one row (% -> %)', before_n, after_n;

  -- a no-op: refused by the constraint
  BEGIN
    INSERT INTO learning.learner_state_history
      (learner_id, claim_id, level, evidence_count, gate,
       previous_level, previous_evidence_count, previous_gate,
       reducer_version, computed_at)
    VALUES ('${U_A}', '${CLAIM_A}', 'intermediate', 2, 'scored',
            'intermediate', 2, 'scored',
            'reducer-v3', '2026-09-03T11:01:00Z');
    RAISE EXCEPTION 'a no-op row is refused: the insert was ACCEPTED';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE '  ok    a no-op row is refused by learner_state_history_is_a_change';
  END;

  -- the reducer-v1 trap: gate appeared, nothing moved. Refused.
  BEGIN
    INSERT INTO learning.learner_state_history
      (learner_id, claim_id, level, evidence_count, gate,
       previous_level, previous_evidence_count, previous_gate,
       reducer_version, computed_at)
    VALUES ('${U_A}', '${CLAIM_A}', 'intermediate', 2, 'scored',
            'intermediate', 2, NULL,
            'reducer-v3', '2026-09-03T11:02:00Z');
    RAISE EXCEPTION 'gate appearing is not a transition: the insert was ACCEPTED';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE '  ok    NULL -> scored alone is refused (the reducer-v1 trap)';
  END;

  -- and a learner may not write another learner's history
  BEGIN
    INSERT INTO learning.learner_state_history
      (learner_id, claim_id, level, evidence_count, gate,
       previous_level, previous_evidence_count, previous_gate,
       reducer_version, computed_at)
    VALUES ('${U_B}', '${CLAIM_B}', 'strong', 9, 'scored',
            'weak', 1, 'scored',
            'reducer-v3', '2026-09-03T11:03:00Z');
    RAISE EXCEPTION 'cross-learner write is refused: the insert was ACCEPTED';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '  ok    a learner cannot write another learner''s history';
  END;
END
\$a\$;
RESET ROLE;
SQL

# ── assertion 4: append-only — UPDATE and DELETE are refused ────────────────
# No grant exists for either verb, so Postgres refuses before RLS is consulted.
read -r -d '' ASSERT_APPEND_ONLY <<SQL
$(as_authenticated "$S_A" "$U_A")
DO \$a\$
BEGIN
  BEGIN
    UPDATE learning.learner_state_history SET level = 'strong' WHERE id = '${H_A}';
    RAISE EXCEPTION 'append-only: UPDATE was ACCEPTED';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '  ok    append-only: UPDATE refused';
  END;

  BEGIN
    DELETE FROM learning.learner_state_history WHERE id = '${H_A}';
    RAISE EXCEPTION 'append-only: DELETE was ACCEPTED';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '  ok    append-only: DELETE refused';
  END;
END
\$a\$;
RESET ROLE;
SQL

# ── assertion 5: the DELETE grants, and that RLS still scopes them ──────────
# Migration 0077's third object. Two opposite answers, and the negative is the
# one that matters: a learner walking T19's cleanup chain deletes their OWN
# activity, response and evidence, and gets ZERO rows when aiming at another
# learner's — no error, just nothing, because `activities_rw_self` filters the
# DELETE before it reaches a row.
#
# The order mirrors T19's endpoint exactly (evidence -> response -> activity),
# because evidence points at the response and the other order strands the FK.
#
# Each block catches `insufficient_privilege` and re-raises with the assertion's
# OWN wording, so revoking a grant fails on the sentence this test is making
# rather than on a bare "permission denied" that a mutation needle cannot aim at.
read -r -d '' ASSERT_DELETE_SCOPE <<SQL
$(as_authenticated "$S_A" "$U_A")
DO \$a\$
DECLARE n int;
BEGIN
  -- the negative, first: another learner's activity is untouchable
  BEGIN
    DELETE FROM learning.activities WHERE id = '${B_ACT}';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN
      RAISE EXCEPTION 'a learner cannot delete another learner''s activity: deleted % row(s)', n;
    END IF;
    RAISE NOTICE '  ok    a learner cannot delete another learner''s activity (0 rows)';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'a learner cannot delete another learner''s activity: refused by grant, so the scoping was never exercised';
  END;

  -- the positive: the learner's own cleanup chain, in T19's order
  BEGIN
    DELETE FROM learning.evidence WHERE activity_response_id = '${A_RESP}' AND learner_id = '${U_A}';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'a learner deletes their own evidence: % row(s)', n; END IF;
    RAISE NOTICE '  ok    a learner deletes their own evidence';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'a learner deletes their own evidence: refused by grant';
  END;

  BEGIN
    DELETE FROM learning.activity_responses WHERE id = '${A_RESP}';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'a learner deletes their own response: % row(s)', n; END IF;
    RAISE NOTICE '  ok    a learner deletes their own response';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'a learner deletes their own response: refused by grant';
  END;

  BEGIN
    DELETE FROM learning.activities WHERE id = '${A_ACT}';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'a learner deletes their own activity: % row(s)', n; END IF;
    RAISE NOTICE '  ok    a learner deletes their own activity';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'a learner deletes their own activity: refused by grant';
  END;
END
\$a\$;
RESET ROLE;

-- And B's chain is still whole, asserted as B rather than on trust.
$(as_authenticated "$S_B" "$U_B")
DO \$b\$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM learning.activities WHERE id = '${B_ACT}';
  IF n <> 1 THEN RAISE EXCEPTION 'B keeps its activity: found %', n; END IF;
  SELECT count(*) INTO n FROM learning.evidence WHERE id = '${B_EV}';
  IF n <> 1 THEN RAISE EXCEPTION 'B keeps its evidence: found %', n; END IF;
  RAISE NOTICE '  ok    the other learner''s chain is untouched';
END
\$b\$;
RESET ROLE;
SQL

# ── the mutations, each aimed at exactly one assertion ──────────────────────
read -r -d '' MUT_POLICY <<'SQL'
-- The policy with its predicate removed: the shape a copy-paste from a shared
-- vocabulary table (0074's `using (true)`) would produce.
DROP POLICY IF EXISTS learner_state_history_rw_self ON learning.learner_state_history;
CREATE POLICY learner_state_history_rw_self ON learning.learner_state_history
  FOR ALL USING (true) WITH CHECK (true);
SQL

read -r -d '' MUT_CONSTRAINT <<'SQL'
-- The transition constraint removed: the table becomes a recompute log.
ALTER TABLE learning.learner_state_history
  DROP CONSTRAINT IF EXISTS learner_state_history_is_a_change;
SQL

read -r -d '' MUT_GRANT <<'SQL'
-- Append-only weakened: the grant block copied from a mutable table.
GRANT UPDATE, DELETE ON learning.learner_state_history TO authenticated;
SQL

# ⚠️ MEASURED, NOT ASSUMED: `anon` is blocked TWICE OVER, and the first attempt
# at this mutation proved it by failing to break anything.
#
#   layer 1  0067: `revoke all on schema learning from anon`  — no USAGE, so
#            anon cannot NAME an object in the schema at all.
#   layer 2  0077: `revoke all on learning.learner_state_history from anon` —
#            no table privilege.
#
# Granting the TABLE alone leaves anon refused by layer 1, so a mutation that
# only does that reports GREEN and proves nothing. To create the real exposure
# both revokes must be undone — which is what the 0063 / 0065 regressions
# actually looked like: a copied grant block that handed anon a schema and a
# table together.
read -r -d '' MUT_ANON <<'SQL'
GRANT USAGE ON SCHEMA learning TO anon;
GRANT SELECT ON learning.learner_state_history TO anon;
SQL

# The table grant WITHOUT the schema grant. This one must stay GREEN: it is the
# evidence that layer 1 holds on its own, which is the fact the paragraph above
# claims. Asserted, not written down and trusted.
read -r -d '' MUT_ANON_TABLE_ONLY <<'SQL'
GRANT SELECT ON learning.learner_state_history TO anon;
SQL

# The DELETE grant forgotten — the exact state production is in TODAY, and the
# reason T26's "the smoke row is cleaned up" cannot be satisfied.
read -r -d '' MUT_NO_DELETE_GRANT <<'SQL'
REVOKE DELETE ON learning.activities FROM authenticated;
SQL

# The owner predicate lost on activities: a learner could delete anyone's.
read -r -d '' MUT_ACTIVITIES_OPEN <<'SQL'
DROP POLICY IF EXISTS activities_rw_self ON learning.activities;
CREATE POLICY activities_rw_self ON learning.activities
  FOR ALL USING (true) WITH CHECK (true);
SQL

# run_phase <mutation-sql-or-empty>  -> exit status of psql, output on stdout
run_phase() {
  local mutation="${1:-}" sql
  sql="BEGIN;
${FIXTURE}
${mutation}
$(assert_isolation "${S_A}" "${U_A}" 'learner A reads only A' 1 1)
$(assert_isolation "${S_B}" "${U_B}" 'learner B reads only B' 1 1)
${ASSERT_ANON}
${ASSERT_APPEND}
${ASSERT_APPEND_ONLY}
${ASSERT_DELETE_SCOPE}
ROLLBACK;"
  printf '%s\n' "$sql" | psql -v ON_ERROR_STOP=1 -qX 2>&1
}

echo "RLS + append-only behaviour: learning.learner_state_history (migration 0077)"
echo

# ── phase 1: everything as this repository defines it ───────────────────────
echo "phase 1 — the table as migration 0077 defines it"
if OUT="$(run_phase '')"; then
  print_ok_lines "$OUT"
  echo "  -> GREEN"
else
  printf '%s\n' "$OUT" | sed 's/^/  /'
  echo
  echo "FAIL: the table does not behave as migration 0077 claims." >&2
  exit 1
fi
echo

# ── phases 2..5: one mutation each; each MUST turn its own assertion red ────
# expect_red <label> <mutation-sql> <substring the failure must contain>
expect_red() {
  local label="$1" mutation="$2" needle="$3" out
  echo "phase — mutation: ${label}"
  if out="$(run_phase "$mutation")"; then
    echo "  -> GREEN, and that is the failure." >&2
    echo >&2
    echo "FAIL: ${label} was applied and every assertion still passed." >&2
    echo "      This test cannot detect the regression it exists to detect." >&2
    return 1
  fi
  # Pure bash, deliberately: the VERDICT of this guard must not depend on which
  # `grep` is on PATH. Measured 2026-09-03 on the authoring host, where `grep`
  # resolved to a wrapper (`/root/grep`, not /usr/bin/grep) whose exit code for
  # `-qF` on stdin did not track the match — the needle WAS present in "$out"
  # and this function still reported "the mutation proves nothing". A guard that
  # returns the wrong verdict because of an unrelated shim is worse than none.
  if [[ "$out" == *"$needle"* ]]; then
    echo "  ok    ${label} turns the right assertion RED"
    print_first_error "$out"
    echo "  -> RED, as required"
    return 0
  fi
  printf '%s\n' "$out" | sed 's/^/  /'
  echo
  echo "FAIL: the mutated run failed, but NOT on '${needle}'." >&2
  echo "      The failure above is something else and the mutation proves nothing." >&2
  return 1
}

expect_red 'the _rw_self predicate replaced by USING (true)' \
           "$MUT_POLICY" 'sees 2 fixture rows in total' || exit 1
echo
expect_red 'learner_state_history_is_a_change dropped' \
           "$MUT_CONSTRAINT" 'a no-op row is refused: the insert was ACCEPTED' || exit 1
echo
expect_red 'UPDATE and DELETE granted to authenticated' \
           "$MUT_GRANT" 'append-only: UPDATE was ACCEPTED' || exit 1
echo
expect_red 'the anon revokes forgotten — BOTH of them' \
           "$MUT_ANON" 'anon SELECTed the table' || exit 1
echo
expect_red 'the DELETE grant on activities revoked (production TODAY)' \
           "$MUT_NO_DELETE_GRANT" 'a learner cannot delete another learner' || exit 1
echo
expect_red 'activities_rw_self opened to USING (true)' \
           "$MUT_ACTIVITIES_OPEN" 'a learner cannot delete another learner' || exit 1
echo

# ── the one phase that must stay GREEN, and says why ────────────────────────
echo "phase — defence in depth: the TABLE granted to anon, the SCHEMA still not"
if OUT="$(run_phase "$MUT_ANON_TABLE_ONLY")"; then
  echo "  ok    anon is still refused — the schema USAGE revoke holds on its own"
  echo "  -> GREEN, as required"
else
  printf '%s\n' "$OUT" | sed 's/^/  /'
  echo
  echo "FAIL: granting anon the TABLE alone was enough to reach it." >&2
  echo "      The 'revoke all on schema learning from anon' of migration 0067 is gone." >&2
  exit 1
fi

echo
echo "passed: per-learner, anon-blind, append-only, transitions-only, and the"
echo "        DELETE grants scoped to the caller — every assertion watched going red."
