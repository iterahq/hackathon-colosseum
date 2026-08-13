#!/usr/bin/env bash
# ============================================================================
# test-baseline-precondition.sh — prove the .baseline evidence gate decides all
# three ways, on throwaway fixtures.
#
# WHAT IT IS GUARDING
# -------------------
# Until 2026-08-12, `apply-migrations.sh` read an empty ledger as proof that the
# database was the pre-ledger PRODUCTION database, and recorded 36 files as
# applied without running them. An empty ledger is also what a BRAND NEW
# database has. Measured on a throwaway Postgres, that produced a ledger
# claiming 36 migrations over a schema with 2 tables — both of them the
# ledger's own — and 0 functions.
#
# The gate now probes, per baselined file, the object that proves it ran:
#
#   all probes hold  -> the pre-ledger production database. Baseline.
#   none hold        -> an empty database. Build it instead.
#   some hold        -> refuse (exit 3).
#
# Same posture as test-fresh-apply.sh: assert the ALLOW as carefully as the
# REFUSE. A gate whose green has never been watched go red proves nothing, and a
# gate that only ever refuses gets switched off within a day.
#
# Needs a throwaway Postgres: PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE.
# Every case gets its own schema AND its own ledger repo name, so they cannot
# contaminate each other.
#
# Exit 0 = every case produced the expected verdict.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLIER="${HERE}/apply-migrations.sh"
TMP="$(mktemp -d)"
: > "${TMP}/no-exceptions.txt"
trap 'rm -rf "$TMP"' EXIT

[[ -n "${PGHOST:-}" ]] || { echo "PGHOST is unset — this selftest needs a throwaway Postgres" >&2; exit 2; }
DB_URL="postgresql://${PGUSER:-postgres}@${PGHOST}:${PGPORT:-5432}/${PGDATABASE:-postgres}"

PASS=0; FAIL=0; N=0
psql_q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qtAX -c "$1"; }

# ensure_ledger() creates itera.schema_migrations, so the `itera` schema has to
# exist first. On a real bootstrap 0001 makes it; here the fixtures live in
# their own schemas, so the selftest provides it. The ledger rows are keyed by
# `repo`, and every case uses a unique one, so the shared ledger is safe.
psql "$DB_URL" -v ON_ERROR_STOP=1 -qX -c "create schema if not exists itera" >/dev/null \
  || { echo "cannot reach the throwaway database at ${PGHOST}" >&2; exit 2; }

# run_case <name> <expected-exit> <grep-for>  — uses $DIR and $REPO
run_case() {
  local name="$1" want="$2" needle="${3:-}" out rc
  out="$(ITERA_MIGRATIONS_DIR="$DIR" \
         ITERA_MIGRATIONS_REPO="$REPO" \
         ITERA_BUILD_EXCEPTIONS="${TMP}/no-exceptions.txt" \
         ITERA_DB_URL="$DB_URL" \
         APPLIED_BY="baseline-selftest" \
         bash "$APPLIER" apply 2>&1)"
  rc=$?
  local ok=1
  [[ "$rc" -eq "$want" ]] || ok=0
  if [[ -n "$needle" ]] && ! printf '%s' "$out" | command grep -qF "$needle"; then ok=0; fi
  if [[ "$ok" -eq 1 ]]; then
    printf '  ok    %-58s exit %s\n' "$name" "$rc"; PASS=$((PASS + 1))
  else
    printf '  FAIL  %-58s exit %s, wanted %s\n' "$name" "$rc" "$want"
    [[ -n "$needle" ]] && printf '        expected to see: %s\n' "$needle"
    printf '%s\n' "$out" | sed 's/^/          /' | head -25
    FAIL=$((FAIL + 1))
  fi
}

# new_fixture -> sets $DIR, $SCHEMA, $REPO. Two migrations, one probeable each.
new_fixture() {
  N=$((N + 1))
  SCHEMA="bp_selftest_${N}"
  REPO="bp-selftest-${N}"
  DIR="${TMP}/case${N}"
  mkdir -p "$DIR"
  cat > "${DIR}/0001_first.sql" <<SQL
create schema if not exists ${SCHEMA};
create table if not exists ${SCHEMA}.alpha (id int primary key);
SQL
  cat > "${DIR}/0002_second.sql" <<SQL
create table if not exists ${SCHEMA}.beta (id int primary key);
SQL
  cat > "${DIR}/0003_later.sql" <<SQL
create table if not exists ${SCHEMA}.gamma (id int primary key);
SQL
  cat > "${DIR}/.baseline" <<TXT
0001_first.sql   table ${SCHEMA}.alpha
0002_second.sql  table ${SCHEMA}.beta
TXT
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qX -c "drop schema if exists ${SCHEMA} cascade" >/dev/null 2>&1
}

echo ".baseline evidence-gate self-test"

# ── none of the evidence exists -> it is a FRESH database. Build it. ────────
# The case that used to silently produce an empty schema with a full ledger.
new_fixture
run_case "empty database is built, not baselined" 0 "NOT baselining"
got="$(psql_q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='${SCHEMA}' and c.relkind='r'")"
if [[ "$got" == "3" ]]; then
  printf '  ok    %-58s 3 tables really exist\n' "…and the schema is actually there"; PASS=$((PASS + 1))
else
  printf '  FAIL  %-58s got %s tables, wanted 3\n' "…and the schema is actually there" "$got"; FAIL=$((FAIL + 1))
fi

# ── all the evidence exists -> the pre-ledger database. Baseline. ───────────
# Build the baselined objects BY HAND, so the files were genuinely "already
# applied", then check that only the un-baselined file runs.
new_fixture
psql "$DB_URL" -v ON_ERROR_STOP=1 -qX >/dev/null <<SQL
create schema if not exists ${SCHEMA};
create table if not exists ${SCHEMA}.alpha (id int primary key);
create table if not exists ${SCHEMA}.beta  (id int primary key);
SQL
run_case "pre-ledger database is baselined" 0 "all 2 baselined objects are present"
got="$(psql_q "select count(*) from itera.schema_migrations where repo='${REPO}'")"
if [[ "$got" == "3" ]]; then
  printf '  ok    %-58s 2 baselined + 1 applied\n' "…and the ledger has all three files"; PASS=$((PASS + 1))
else
  printf '  FAIL  %-58s got %s ledger rows, wanted 3\n' "…and the ledger has all three files" "$got"; FAIL=$((FAIL + 1))
fi

# ── some of the evidence exists -> REFUSE. ─────────────────────────────────
# A half-built database is not a state .baseline can describe, and guessing
# between "apply" and "skip" is how it goes wrong without saying so.
new_fixture
psql "$DB_URL" -v ON_ERROR_STOP=1 -qX >/dev/null <<SQL
create schema if not exists ${SCHEMA};
create table if not exists ${SCHEMA}.alpha (id int primary key);
SQL
run_case "half-built database is refused" 3 "REFUSING TO BASELINE"

# ── a line with no evidence column is a usage error ────────────────────────
# The old format was exactly this: a bare filename. Accepting it would re-open
# the hole, so it is refused rather than treated as `none`.
new_fixture
cat > "${DIR}/.baseline" <<TXT
0001_first.sql
0002_second.sql  table ${SCHEMA}.beta
TXT
run_case "a bare filename with no evidence is refused" 2 "has no evidence column"

# ── `none` is allowed, and takes no part in the vote ───────────────────────
# Pure-DML files create nothing, so their application cannot be observed. That
# is declared, not hidden — but a baseline of NOTHING but `none` would be
# unverifiable, and is refused.
new_fixture
cat > "${DIR}/.baseline" <<TXT
0001_first.sql   none  fixture, creates nothing observable
0002_second.sql  none  fixture, creates nothing observable
TXT
run_case "a baseline with no checkable evidence at all is refused" 2 "no checkable evidence"

echo
echo "passed ${PASS}, failed ${FAIL}"
[[ "$FAIL" -eq 0 ]] || exit 1
