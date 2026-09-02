#!/usr/bin/env bash
# ============================================================================
# test-rls-activity-visibility.sh — assert, BEHAVIOURALLY, that a learner
# cannot read a draft activity, that a learner who has paid for nothing cannot
# read ANY activity, and that an author can read both.
#
# WHY A BEHAVIOURAL TEST AND NOT ANOTHER SHAPE CHECK
# --------------------------------------------------
# On 2026-08-10 `itera.activities.activities_select_tenant` was found in
# production carrying NO `status` predicate: 24 draft activities were readable
# by learners, and `draft` had been hiding nothing. Migration 0047 had created
# that predicate correctly in July. It was reverted outside the ledger.
#
# Every guard this repo owns was blind to it, and each for a structural reason:
#
#   db-migration-numbering  is about filenames.
#   migration-human-gate    is about who merges.
#   db-apply                applies PENDING files; the policy was never pending.
#   fresh-apply.sh          builds from ZERO — and from zero, 0002 runs long
#                           before 0047, so a from-scratch build produces the
#                           CORRECT policy. It cannot see production drift.
#   db-drift / census       records object NAMES, not definitions. The line
#                           `pol itera.activities activities_select_tenant` is
#                           byte-identical in all six census snapshots taken
#                           before and after the regression. A policy's WHERE
#                           clause can be replaced without moving the digest.
#
# The common failure: all of them ask "is the object THERE?". None asks "does
# it DO anything?". This script asks the second question. It is the only check
# in the repo that would go red if the predicate disappeared again.
#
# WHAT MAKES THE ANSWER REAL
# --------------------------
# RLS is evaluated against `current_user`. The assertions run after
# `SET LOCAL ROLE authenticated` — a role with `rolbypassrls = f` — with real
# JWT claims in `request.jwt.claims`. That is literally what PostgREST does per
# request, so this is the app's code path and not an approximation of it.
# `supabase_admin` (the session role) has BYPASSRLS, so an assertion that
# accidentally ran as the session role would see everything and pass
# vacuously — the guard block below refuses to let that happen.
#
# BOTH VERDICTS ARE PROVEN, ALWAYS
# --------------------------------
# Same posture as test-fresh-apply.sh and test-check-migration-numbers.sh: a
# guard nobody has watched go RED is not evidence. So this script runs twice
# against the same database:
#
#   phase 1  GREEN  the real policy -> learner sees published only, author sees both
#   phase 2  RED    the predicate is stripped (the exact broken production
#                   shape) -> the learner assertion MUST fail
#
# If phase 2 passes, the test has no teeth and the script exits 1 saying so.
# Every fixture lives in one transaction that is ROLLED BACK, including the
# mutation, so the database is untouched either way.
#
# Needs the same throwaway Postgres as fresh-apply.sh (PGHOST/PGPORT/PGUSER/
# PGPASSWORD/PGDATABASE), with the schema already built.
#
# Exit 0 = the learner is blocked, the author is not, and the test can go red.
# Exit 1 = an assertion failed, or the mutation did not turn it red.
# Exit 2 = usage / environment error.
# ============================================================================
set -uo pipefail

command -v psql >/dev/null 2>&1 || { echo "ERROR: psql not found on PATH" >&2; exit 2; }
[[ -n "${PGHOST:-}" ]] || { echo "ERROR: PGHOST is unset — refusing to guess the target database" >&2; exit 2; }

# This script writes fixture rows (inside a rolled-back transaction) and, in
# phase 2, replaces a policy. Neither belongs anywhere near a real project.
case "${PGHOST}:${PGDATABASE:-}" in
  *kjefmwlopzeaqgqtlbdn*|*yoojxnggaxcqtsyjdrdx*|*supabase.com*|*supabase.co*)
    echo "ERROR: REFUSED: PGHOST looks like a real Supabase project. Throwaway databases only." >&2
    exit 2 ;;
esac

# Fixed ids so a failure message can be traced back to a row.
T_TENANT='dddddddd-0000-4000-8000-000000000001'
T_PROGRAM='dddddddd-0000-4000-8000-000000000002'
T_UNIT='dddddddd-0000-4000-8000-000000000003'
T_LESSON='dddddddd-0000-4000-8000-000000000004'
A_DRAFT='dddddddd-0000-4000-8000-000000000005'
A_PUB='dddddddd-0000-4000-8000-000000000006'
U_LEARNER='dddddddd-0000-4000-8000-000000000007'
U_AUTHOR='dddddddd-0000-4000-8000-000000000008'
U_OUTSIDER='dddddddd-0000-4000-8000-000000000009'
S_LEARNER='eeeeeeee-0000-4000-8000-000000000007'   # auth.uid() of the learner
S_AUTHOR='eeeeeeee-0000-4000-8000-000000000008'
S_OUTSIDER='eeeeeeee-0000-4000-8000-000000000009'

# ── the fixture ─────────────────────────────────────────────────────────────
# One lesson, one DRAFT activity and one PUBLISHED activity, in a tenant nobody
# else belongs to. Three identities: a learner OF that tenant, an author OF that
# tenant, and a member of no tenant at all.
#
# `kind` is picked from the live enum rather than hardcoded, so a future rename
# of an activity kind cannot silently break this test into a false green.
read -r -d '' FIXTURE <<SQL
-- subscription_exempt is set so that phases 1 and 2 keep testing exactly what
-- they always tested — draft vs published — with the 0076 entitlement gate
-- satisfied and therefore out of the way. Phases 3 and 4 clear the flag and
-- test the gate itself.
INSERT INTO itera.tenants (id, slug, name, subscription_exempt)
  VALUES ('${T_TENANT}', 'rls-selftest-tenant', 'RLS selftest', true);
INSERT INTO itera.programs (id, tenant_id, slug)
  VALUES ('${T_PROGRAM}', '${T_TENANT}', 'rls-selftest-program');
INSERT INTO itera.units (id, program_id, ordinal)
  VALUES ('${T_UNIT}', '${T_PROGRAM}', 0);
INSERT INTO itera.lessons (id, unit_id, ordinal)
  VALUES ('${T_LESSON}', '${T_UNIT}', 0);

INSERT INTO itera.activities (id, lesson_id, ordinal, kind, status)
  VALUES ('${A_DRAFT}', '${T_LESSON}', 0,
          (SELECT MIN(e.enumlabel::text)::itera.activity_kind
             FROM pg_enum e
             JOIN pg_type t ON t.oid = e.enumtypid
             JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'itera' AND t.typname = 'activity_kind'),
          'draft');
INSERT INTO itera.activities (id, lesson_id, ordinal, kind, status)
  VALUES ('${A_PUB}', '${T_LESSON}', 1,
          (SELECT MIN(e.enumlabel::text)::itera.activity_kind
             FROM pg_enum e
             JOIN pg_type t ON t.oid = e.enumtypid
             JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'itera' AND t.typname = 'activity_kind'),
          'published');

INSERT INTO itera.users (id, email) VALUES
  ('${U_LEARNER}',  'rls-selftest-learner@example.invalid'),
  ('${U_AUTHOR}',   'rls-selftest-author@example.invalid'),
  ('${U_OUTSIDER}', 'rls-selftest-outsider@example.invalid');

INSERT INTO itera.identities (user_id, provider, provider_subject) VALUES
  ('${U_LEARNER}',  'password', '${S_LEARNER}'),
  ('${U_AUTHOR}',   'password', '${S_AUTHOR}'),
  ('${U_OUTSIDER}', 'password', '${S_OUTSIDER}');

-- The author is given the literal 'author' role. The policy admits four roles
-- via itera.current_author_tenant_ids() (author|instructor|tenant_admin|owner);
-- 'author' is the weakest of them, so proving it is enough to prove the set.
INSERT INTO itera.memberships (user_id, tenant_id, role) VALUES
  ('${U_LEARNER}', '${T_TENANT}', 'learner'),
  ('${U_AUTHOR}',  '${T_TENANT}', 'author');
SQL

# assert_as <subject-uuid> <label> <expected-total> <expected-drafts>
# Emits SQL that becomes `authenticated`, installs the claims, proves RLS is
# genuinely engaged, and then asserts what this identity may read.
assert_as() {
  local sub="$1" label="$2" want_total="$3" want_draft="$4"
  cat <<SQL
SET LOCAL ROLE authenticated;

DO \$guard\$
BEGIN
  -- BOTH claim GUCs are set, on purpose. \`auth.uid()\` is NOT the same function
  -- in the CI image as in production, and the difference is silent:
  --
  --   supabase/postgres:17.6.1.160   select nullif(current_setting(
  --                                    'request.jwt.claim.sub', true), '')::uuid
  --   ITERA production                reads the 'request.jwt.claims' JSON ->> 'sub'
  --
  -- Setting only the JSON form (what PostgREST sends, and what the
  -- itera-supabase-helpers as-user path uses) leaves auth.uid() NULL in CI, and
  -- a NULL auth.uid() makes current_tenant_ids() empty — which would make the
  -- learner see zero rows and this test pass for entirely the wrong reason.
  -- Measured 2026-08-10; the guard below is what caught it. Set both, and the
  -- assertions are faithful under either definition.
  PERFORM set_config('request.jwt.claims',
                     '{"sub":"${sub}","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '${sub}', true);

  -- Without this, an assertion that silently ran as the BYPASSRLS session role
  -- would see every row and pass while proving nothing.
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'RLS NOT ENFORCED: current_user=% has BYPASSRLS', current_user;
  END IF;
  IF NOT current_setting('row_security')::bool THEN
    RAISE EXCEPTION 'RLS NOT ENFORCED: row_security is off';
  END IF;
  IF auth.uid() IS DISTINCT FROM '${sub}'::uuid THEN
    RAISE EXCEPTION 'claims not in effect: auth.uid()=% expected %',
                    auth.uid(), '${sub}';
  END IF;
  -- The identity must actually resolve, or "sees 0 rows" would be indistinguishable
  -- from "the policy blocked it" for the learner case.
  IF itera.current_itera_user_id() IS NULL THEN
    RAISE EXCEPTION 'identity did not resolve for auth.uid()=%', auth.uid();
  END IF;
END
\$guard\$;

DO \$assert\$
DECLARE
  total int;
  drafts int;
BEGIN
  SELECT count(*) INTO total
    FROM itera.activities WHERE lesson_id = '${T_LESSON}';
  SELECT count(*) INTO drafts
    FROM itera.activities WHERE lesson_id = '${T_LESSON}' AND status = 'draft';

  IF total <> ${want_total} THEN
    RAISE EXCEPTION '${label}: sees % activities, expected ${want_total}', total;
  END IF;
  IF drafts <> ${want_draft} THEN
    RAISE EXCEPTION '${label}: sees % DRAFT activities, expected ${want_draft}', drafts;
  END IF;
  RAISE NOTICE '  ok    ${label}: % total, % draft', total, drafts;
END
\$assert\$;
RESET ROLE;
SQL
}

# The broken production shape: tenant membership only, no status predicate.
# Byte-for-byte the policy that migration 0002 creates, which is exactly what
# was found live on 2026-08-10.
read -r -d '' MUTATION <<'SQL'
DROP POLICY IF EXISTS activities_select_tenant ON itera.activities;
CREATE POLICY activities_select_tenant ON itera.activities
  FOR SELECT
  USING (
    lesson_id IN (
      SELECT l.id
      FROM itera.lessons l
      JOIN itera.units u ON u.id = l.unit_id
      JOIN itera.programs p ON p.id = u.program_id
      WHERE p.tenant_id IN (SELECT itera.current_tenant_ids())
    )
  );
SQL

# Clears the entitlement the fixture was born with: no exemption, no test
# flag, no subscription row. A learner in this tenant has paid for nothing.
read -r -d '' UNENTITLE <<SQL
UPDATE itera.tenants SET subscription_exempt = false WHERE id = '${T_TENANT}';
SQL

# The pre-0076 shape: right on draft/published, blind to entitlement. This is
# the policy this repo shipped between 0064 and 0076, so a revert lands here
# and not somewhere invented.
read -r -d '' PAYWALL_MUTATION <<'SQL'
DROP POLICY IF EXISTS activities_select_tenant ON itera.activities;
CREATE POLICY activities_select_tenant ON itera.activities
  FOR SELECT
  USING (
    lesson_id IN (
      SELECT l.id
      FROM itera.lessons l
      JOIN itera.units u ON u.id = l.unit_id
      JOIN itera.programs p ON p.id = u.program_id
      WHERE p.tenant_id IN (SELECT itera.current_tenant_ids())
    )
    AND (
      status = 'published'
      OR lesson_id IN (
        SELECT l.id
        FROM itera.lessons l
        JOIN itera.units u ON u.id = l.unit_id
        JOIN itera.programs p ON p.id = u.program_id
        WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())
      )
    )
  );
SQL

# run_phase <mutate:0|1>  -> exit status of psql
run_phase() {
  local mutate="$1" sql
  sql="BEGIN;
${FIXTURE}
"
  [[ "$mutate" == "1" ]] && sql="${sql}
${MUTATION}
"
  sql="${sql}
$(assert_as "${S_LEARNER}"  'learner reads published only' 1 0)
$(assert_as "${S_AUTHOR}"   'author reads drafts too'      2 1)
$(assert_as "${S_OUTSIDER}" 'non-member reads nothing'     0 0)
ROLLBACK;"
  printf '%s\n' "$sql" | psql -v ON_ERROR_STOP=1 -qX 2>&1
}

# run_paywall_phase <strip:0|1> -> exit status of psql
# Same fixture, entitlement removed. The learner has a membership and the
# activity is published, so ONLY the 0076 clause can be what stops them.
run_paywall_phase() {
  local strip="$1" sql
  sql="BEGIN;
${FIXTURE}
${UNENTITLE}
"
  [[ "$strip" == "1" ]] && sql="${sql}
${PAYWALL_MUTATION}
"
  sql="${sql}
$(assert_as "${S_LEARNER}" 'unentitled learner reads nothing' 0 0)
$(assert_as "${S_AUTHOR}"  'author is never paywalled'        2 1)
ROLLBACK;"
  printf '%s\n' "$sql" | psql -v ON_ERROR_STOP=1 -qX 2>&1
}

echo "RLS behaviour: drafts are invisible to learners, content is invisible to non-payers"
echo

# ── phase 1: the real policy must be correct ────────────────────────────────
echo "phase 1 — the policy as this repo defines it"
if OUT="$(run_phase 0)"; then
  printf '%s\n' "$OUT" | command grep -E '^(NOTICE:)?\s*ok ' | sed 's/^NOTICE:  //'
  echo "  -> GREEN"
else
  printf '%s\n' "$OUT" | sed 's/^/  /'
  echo
  echo "FAIL: a learner can read a draft activity, or an author cannot." >&2
  echo "      The status predicate on activities_select_tenant is missing or wrong." >&2
  exit 1
fi

echo

# ── phase 2: strip the predicate; the learner assertion must go red ─────────
echo "phase 2 — mutation: the predicate removed (the broken production shape)"
if OUT="$(run_phase 1)"; then
  echo "  -> GREEN, and that is the failure." >&2
  echo >&2
  echo "FAIL: the predicate was stripped and every assertion still passed." >&2
  echo "      This test cannot detect the regression it exists to detect." >&2
  exit 1
fi
if printf '%s\n' "$OUT" | command grep -q 'learner reads published only'; then
  echo "  ok    stripping the predicate turns the learner assertion RED"
  printf '%s\n' "$OUT" | command grep -o 'ERROR:.*' | head -1 | sed 's/^/        /'
  echo "  -> RED, as required"
else
  printf '%s\n' "$OUT" | sed 's/^/  /'
  echo
  echo "FAIL: the mutated run failed, but NOT on the learner assertion." >&2
  echo "      The failure above is something else and the mutation proves nothing." >&2
  exit 1
fi

echo

# ── phase 3: the 0076 entitlement gate must hold ────────────────────────────
echo "phase 3 — the same learner, with nothing paid for"
if OUT="$(run_paywall_phase 0)"; then
  printf '%s\n' "$OUT" | command grep -E '^(NOTICE:)?\s*ok ' | sed 's/^NOTICE:  //'
  echo "  -> GREEN"
else
  printf '%s\n' "$OUT" | sed 's/^/  /'
  echo
  echo "FAIL: an unentitled learner can read published activities." >&2
  echo "      itera.current_user_is_entitled() is missing from activities_select_tenant," >&2
  echo "      or the predicate itself admits somebody who has paid nothing." >&2
  exit 1
fi

echo

# ── phase 4: strip the entitlement clause; phase 3 must go red ──────────────
echo "phase 4 — mutation: the entitlement clause removed (the pre-0076 shape)"
if OUT="$(run_paywall_phase 1)"; then
  echo "  -> GREEN, and that is the failure." >&2
  echo >&2
  echo "FAIL: the entitlement clause was stripped and the learner still read nothing." >&2
  echo "      Phase 3 is passing for some other reason and proves nothing." >&2
  exit 1
fi
if printf '%s\n' "$OUT" | command grep -q 'unentitled learner reads nothing'; then
  echo "  ok    stripping the entitlement clause turns the learner assertion RED"
  printf '%s\n' "$OUT" | command grep -o 'ERROR:.*' | head -1 | sed 's/^/        /'
  echo "  -> RED, as required"
else
  printf '%s\n' "$OUT" | sed 's/^/  /'
  echo
  echo "FAIL: the mutated run failed, but NOT on the learner assertion." >&2
  echo "      The failure above is something else and the mutation proves nothing." >&2
  exit 1
fi

echo
echo "passed: drafts are hidden from learners, content is hidden from non-payers,"
echo "        authors keep both, and both mutations turn the test red."
