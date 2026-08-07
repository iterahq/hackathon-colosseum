#!/usr/bin/env bash
# ============================================================================
# test-fresh-apply.sh — prove fresh-apply.sh both REFUSES and ALLOWS.
#
# Same posture as test-check-migration-numbers.sh: a guard whose green has never
# been seen to go red is not evidence of anything, and a guard that only ever
# refuses gets switched off within a day. So both verdicts are asserted, on
# throwaway fixtures, in seconds — no dependency on the real 57-file series.
#
# Needs the same throwaway Postgres as fresh-apply.sh (PGHOST/PGPORT/PGUSER/
# PGPASSWORD/PGDATABASE). Every fixture confines itself to its own schema, so
# the cases cannot contaminate each other.
#
# Exit 0 = every case produced the expected verdict.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRESH="${HERE}/fresh-apply.sh"
TMP="$(mktemp -d)"
: > "${TMP}/empty.txt"
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0
N=0

# run_case <name> <expected-exit> <extra-args...>  — fixtures come from $DIR
run_case() {
  local name="$1" want="$2"; shift 2
  local out rc exc=()
  # The real exceptions file names the real migrations; a fixture dir has none
  # of them, so unless a case supplies its own list it gets an empty one.
  [[ "$*" == *--exceptions* ]] || exc=(--exceptions "${TMP}/empty.txt")
  out="$("$FRESH" --migrations-dir "$DIR" --bootstrap /dev/null --no-applier \
         ${exc[@]+"${exc[@]}"} "$@" 2>&1)"
  rc=$?
  if [[ "$rc" -eq "$want" ]]; then
    printf '  ok    %-58s exit %s\n' "$name" "$rc"; PASS=$((PASS + 1))
  else
    printf '  FAIL  %-58s exit %s, wanted %s\n' "$name" "$rc" "$want"
    printf '%s\n' "$out" | sed 's/^/          /'
    FAIL=$((FAIL + 1))
  fi
}

new_fixture() {   # -> sets $DIR and $SCHEMA
  N=$((N + 1))
  SCHEMA="fa_selftest_${N}"
  DIR="${TMP}/case${N}"
  mkdir -p "$DIR"
  # Idempotent on purpose: a base that dropped and recreated its schema would
  # wipe the previous pass's objects and quietly make every fixture look
  # re-runnable — which is how the "not idempotent" case first passed by
  # accident. Isolation comes from the per-case schema NAME, not from a reset.
  cat > "${DIR}/0001_base.sql" <<SQL
create schema if not exists ${SCHEMA};
create table if not exists ${SCHEMA}.thing (id int primary key);
SQL
}

echo "fresh-apply.sh self-test"

# ── ALLOW ───────────────────────────────────────────────────────────────────
# The case that matters most: a guard nobody has watched go GREEN on a correct
# migration will be tuned until it does, usually by weakening it.
new_fixture
cat > "${DIR}/0002_good.sql" <<SQL
alter table ${SCHEMA}.thing add column if not exists label text;
create index if not exists thing_label_idx on ${SCHEMA}.thing (label);
SQL
run_case "a correct, idempotent migration passes" 0 --new "0002_good.sql"

# ── REFUSE: the SQL does not parse ──────────────────────────────────────────
new_fixture
cat > "${DIR}/0002_syntax.sql" <<SQL
create tabel ${SCHEMA}.oops (id int);
SQL
run_case "a syntax error fails" 1 --new "0002_syntax.sql"

# ── REFUSE: the object it names is not there ────────────────────────────────
# The commonest real defect: a migration written against the author's mental
# model of the schema rather than the schema.
new_fixture
cat > "${DIR}/0002_missing.sql" <<SQL
alter table ${SCHEMA}.thingz add column if not exists label text;
SQL
run_case "a reference to a non-existent relation fails" 1 --new "0002_missing.sql"

# ── REFUSE: applies once, not twice ─────────────────────────────────────────
new_fixture
cat > "${DIR}/0002_nonidem.sql" <<SQL
create table ${SCHEMA}.once (id int);
SQL
run_case "a non-idempotent migration fails on the second pass" 1 --new "0002_nonidem.sql"

# ── REFUSE: forward reference, in sorted order ──────────────────────────────
# The defect that made this whole check worth writing: 0024 referencing a type
# created by 0047. In sorted order it cannot build.
new_fixture
cat > "${DIR}/0002_uses_type.sql" <<SQL
alter table ${SCHEMA}.thing add column if not exists st ${SCHEMA}.status_t;
SQL
cat > "${DIR}/0003_makes_type.sql" <<SQL
do \$\$ begin create type ${SCHEMA}.status_t as enum ('a','b'); exception when duplicate_object then null; end \$\$;
SQL
run_case "a forward reference fails in sorted order" 1 --new "0002_uses_type.sql"

# ── ALLOW: …and a declared hoist repairs exactly that ───────────────────────
cat > "${TMP}/exc${N}.txt" <<TXT
hoist 0003_makes_type.sql before 0002_uses_type.sql
TXT
run_case "a declared hoist repairs it" 0 --exceptions "${TMP}/exc${N}.txt"

# ── REFUSE: a PR may not exempt its own new migration ───────────────────────
# Without this, the exceptions file is an opt-out and the whole check is
# advisory.
new_fixture
cat > "${DIR}/0002_broken.sql" <<SQL
create tabel ${SCHEMA}.oops (id int);
SQL
cat > "${TMP}/exc_new${N}.txt" <<TXT
skip 0002_broken.sql
TXT
run_case "a new migration cannot be listed in the exceptions file" 4 \
  --exceptions "${TMP}/exc_new${N}.txt" --new "0002_broken.sql"

# ── REFUSE: a hoist naming a file that is not there ─────────────────────────
# A typo in the exceptions file must be loud, not silently inert.
new_fixture
cat > "${TMP}/exc_bad${N}.txt" <<TXT
hoist 0099_nope.sql before 0001_base.sql
TXT
run_case "a hoist naming a missing file is a usage error" 2 --exceptions "${TMP}/exc_bad${N}.txt"

echo
echo "passed ${PASS}, failed ${FAIL}"
[[ "$FAIL" -eq 0 ]] || exit 1
