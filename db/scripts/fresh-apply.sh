#!/usr/bin/env bash
# ============================================================================
# fresh-apply.sh — build the Itera schema FROM ZERO against a throwaway
# Postgres, then apply the pull request's new migrations through the real
# applier. Never touches a real database.
#
# THE GAP THIS CLOSES
# -------------------
# Before this existed, `db/migrations/*.sql` had four guards — a numbering
# collision guard, a code-owner merge gate, a daily drift alarm, and the
# apply-on-merge job — and NOT ONE of them ever executed a line of the SQL.
# The first machine to run a new migration was the ITERA production database
# (kjefmwlopzeaqgqtlbdn). The human gate protects against the wrong INTENT;
# nothing protected against SQL that simply does not run.
#
# Modelled on devfellowship/dfl-schema `.github/workflows/migration-check.yml`,
# which stands up a `supabase/postgres` service container and applies the
# migrations with `psql -v ON_ERROR_STOP=1`. Same idea, deliberately not a new
# one. The differences are all forced by this repo's shape and are documented
# where they occur.
#
# -- What it asserts ---------------------------------------------------------
#   1. FROM ZERO. Every migration applies against an empty database, in the
#      declared order, stopping at the first error. A migration that cannot
#      build the schema from nothing is broken regardless of what the current
#      production state happens to tolerate.
#   2. IDEMPOTENT. The whole series applies a SECOND time, cleanly. Every
#      migration in this repo is REQUIRED to be re-runnable — apply-migrations.sh
#      says so in its header, and the ledger's safety depends on it (a restore,
#      a `-- itera:no-transaction` file that died between its DDL and its ledger
#      row, a fresh environment). Nothing enforced it until now.
#   2b. AND THE SECOND PASS CHANGES NOTHING. "Applies without an error" and "is
#      a no-op" are different claims, and only the first one was ever checked.
#      The census (db/scripts/census.sql, the SAME ruler --parity uses) is taken
#      after pass 1 and again after pass 2, and the two must be identical.
#
#      Measured 2026-08-13 on this series: the second pass exited 0 and added
#      EIGHT grant rows over five relations. `grant select on all tables in
#      schema itera` in 0002 is a SNAPSHOT, not a rule; from zero it reaches the
#      14 tables of 0001, re-run against a current schema it reaches all 65.
#      Two of the five — itera.schema_migrations and itera.schema_object_census
#      — have RLS DISABLED, so the grant alone is the whole of the protection.
#      Migration 0065 makes the series a fixpoint. Exit code 5.
#   3. THE REAL APPLIER RUNS THE NEW FILES. With `--new`, the ledger is seeded
#      with everything already on main and `apply-migrations.sh apply` is then
#      pointed at the throwaway database — so the PR's migrations go through the
#      exact code path `db-apply` uses on merge, including its transaction-mode
#      detection and its ledger write.
#   4. NEW MIGRATIONS CANNOT BE EXEMPTED. A file added by the PR that appears in
#      fresh-apply-exceptions.txt is refused (exit 4). An exception list a PR can
#      append to is not a check.
#
# -- Usage -------------------------------------------------------------------
#   fresh-apply.sh [options]
#     --new FILE            a migration added by this PR (repeatable, or a
#                           space/newline-separated list). Enables assertion 3+4.
#     --migrations-dir DIR  default db/migrations           (selftest override)
#     --exceptions FILE     default db/scripts/fresh-apply-exceptions.txt
#     --bootstrap FILE      default db/scripts/fresh-apply-bootstrap.sql
#                           (pass /dev/null for none)
#     --parity              after the FIRST pass, assert the catalogue equals
#                           db/census/expected-schema.txt (schema-parity.sh)
#     --no-second-pass      skip the idempotency pass AND the fixpoint assertion
#     --no-applier          skip the apply-migrations.sh phase
#
#   Connection comes from the standard PG* environment — PGHOST, PGPORT,
#   PGUSER, PGPASSWORD, PGDATABASE. PGUSER should be `supabase_admin`: in the
#   supabase/postgres image `postgres` is NOT a superuser, and several
#   migrations need one (CREATE EXTENSION pg_cron, policies on realtime.messages).
#
# -- Exit codes --------------------------------------------------------------
#   0  everything applied, twice, and the new migrations went through the applier
#   1  a migration FAILED to apply (first pass, second pass, or via the applier)
#   2  usage / environment error
#   4  a file added by this PR is listed in fresh-apply-exceptions.txt
#   5  the second pass applied cleanly but CHANGED the schema
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG_DIR="${ROOT}/migrations"
EXC_FILE="${ROOT}/scripts/fresh-apply-exceptions.txt"
BOOTSTRAP="${ROOT}/scripts/fresh-apply-bootstrap.sql"
SECOND_PASS=1
RUN_APPLIER=1
PARITY=0
PRINT_ORDER=0
PRINT_SKIPS=0
NEW_FILES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --new)             _n=(); read -r -a _n <<< "${2:-}"
                       [[ "${#_n[@]}" -gt 0 ]] && NEW_FILES+=("${_n[@]}"); shift 2 ;;
    --migrations-dir)  MIG_DIR="${2:?}"; shift 2 ;;
    --exceptions)      EXC_FILE="${2:?}"; shift 2 ;;
    --bootstrap)       BOOTSTRAP="${2:?}"; shift 2 ;;
    --no-second-pass)  SECOND_PASS=0; shift ;;
    --parity)          PARITY=1; shift ;;
    --no-applier)      RUN_APPLIER=0; shift ;;
    --print-order)     PRINT_ORDER=1; shift ;;
    --print-skips)     PRINT_SKIPS=1; shift ;;
    -h|--help)         sed -n '2,76p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
    *)                 echo "ERROR: unknown argument '$1' (see --help)" >&2; exit 2 ;;
  esac
done

say()  { printf '[fresh-apply] %s\n' "$*"; }
die()  { printf '[fresh-apply] ERROR: %s\n' "$1" >&2; exit "${2:-2}"; }

[[ -d "$MIG_DIR" ]] || die "no such migrations dir: $MIG_DIR"

# --print-order / --print-skips touch no database, so they are checked before
# the connection guards. That matters: apply-migrations.sh calls
# `--print-order` to bootstrap a real project from zero, and it must not be
# refused by a guard that exists to stop this script APPLYING DDL there.
PRINT_ONLY=0
[[ "$PRINT_ORDER" -eq 1 || "$PRINT_SKIPS" -eq 1 ]] && PRINT_ONLY=1

if [[ "$PRINT_ONLY" -eq 0 ]]; then
  command -v psql >/dev/null 2>&1 || die "psql not found on PATH"
  # A bare `psql` with no host is a unix-socket connection to a database this
  # script must never assume anything about. Require the target to be stated.
  [[ -n "${PGHOST:-}" ]] || die "PGHOST is unset — refusing to guess the target database"
  # Belt for the one mistake that would be unrecoverable: this script applies DDL,
  # so it must never be pointed at either production project.
  case "${PGHOST}:${PGDATABASE:-}" in
    *kjefmwlopzeaqgqtlbdn*|*yoojxnggaxcqtsyjdrdx*|*supabase.com*|*supabase.co*)
      die "REFUSED: PGHOST looks like a real Supabase project. This script applies DDL and is for throwaway databases only." ;;
  esac
fi

PSQL=(psql -v ON_ERROR_STOP=1 -qX)

# ONE engine, not two. Migrations go through db/scripts/tx-mode.sh, the same
# module apply-migrations.sh uses on merge, instead of this script carrying its
# own `psql -f`. TX_FROM_ZERO=1 states explicitly what this script used to do by
# accident: a from-zero build runs every file in autocommit, because the
# BEGIN/COMMIT wrapper exists to keep a file atomic with its ledger row on
# production and there is no production here. apply-migrations.sh takes the same
# branch through the same flag when it proves the target database is empty.
#
# This is not a way for a broken migration to slip through. Phase 4 below hands
# the pull request's NEW files to apply-migrations.sh against a SEEDED ledger,
# where TX_FROM_ZERO is 0 and `wrap` is real.
# shellcheck source=db/scripts/tx-mode.sh
. "${ROOT}/scripts/tx-mode.sh"
TX_PSQL=("${PSQL[@]}")
TX_FROM_ZERO=1

# Every migration here is written to be re-runnable, so a from-scratch build
# emits hundreds of "already exists, skipping" NOTICEs on the second pass and a
# fair number on the first. They bury the one line that matters. WARNING and
# above still print, and ON_ERROR_STOP still stops.
export PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c client_min_messages=warning"

# ── the exceptions file ─────────────────────────────────────────────────────
declare -A SKIP=()          # filename -> 1
declare -A HOIST_ANCHOR=()  # filename -> anchor filename
HOIST_ORDER=()              # hoisted filenames, in file order
if [[ -f "$EXC_FILE" ]]; then
  ln=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    ln=$((ln + 1))
    line="${line%%#*}"
    # shellcheck disable=SC2206
    parts=($line)
    [[ "${#parts[@]}" -eq 0 ]] && continue
    case "${parts[0]}" in
      skip)
        [[ "${#parts[@]}" -eq 2 ]] || die "$EXC_FILE:$ln: 'skip' takes exactly one filename"
        [[ -f "${MIG_DIR}/${parts[1]}" ]] || die "$EXC_FILE:$ln: no such migration '${parts[1]}'"
        SKIP["${parts[1]}"]=1 ;;
      hoist)
        [[ "${#parts[@]}" -eq 4 && "${parts[2]}" == "before" ]] \
          || die "$EXC_FILE:$ln: expected 'hoist <file> before <anchor>'"
        [[ -f "${MIG_DIR}/${parts[1]}" ]] || die "$EXC_FILE:$ln: no such migration '${parts[1]}'"
        [[ -f "${MIG_DIR}/${parts[3]}" ]] || die "$EXC_FILE:$ln: no such anchor '${parts[3]}'"
        HOIST_ANCHOR["${parts[1]}"]="${parts[3]}"
        HOIST_ORDER+=("${parts[1]}") ;;
      *) die "$EXC_FILE:$ln: unknown directive '${parts[0]}'" ;;
    esac
  done < "$EXC_FILE"
fi

# ── assertion 4: the exceptions file is closed to this PR ───────────────────
# Checked BEFORE anything is applied, so the refusal is unambiguous rather than
# arriving after a long green log.
if [[ "${#NEW_FILES[@]}" -gt 0 ]]; then
  offenders=()
  for p in "${NEW_FILES[@]}"; do
    b="$(basename "$p")"
    if [[ -n "${SKIP[$b]:-}" || -n "${HOIST_ANCHOR[$b]:-}" ]]; then offenders+=("$b"); fi
  done
  if [[ "${#offenders[@]}" -gt 0 ]]; then
    say "REFUSED — this pull request adds a migration and also lists it in $(basename "$EXC_FILE"):"
    for b in "${offenders[@]}"; do say "    $b"; done
    say ""
    say "That file records deviations that already existed and cannot be undone."
    say "It is not a way to opt a new migration out of being executed. A new"
    say "migration that does not build from zero is a broken migration: fix the"
    say "SQL, or renumber it so it lands after what it depends on."
    exit 4
  fi
fi

# ── the apply order ─────────────────────────────────────────────────────────
build_order() {
  local f b h
  local sorted=()
  while IFS= read -r f; do sorted+=("$(basename "$f")"); done \
    < <(for f in "$MIG_DIR"/*.sql; do [[ -e "$f" ]] && printf '%s\n' "$f"; done | LC_ALL=C sort)
  for b in "${sorted[@]}"; do
    [[ -n "${SKIP[$b]:-}"         ]] && continue
    [[ -n "${HOIST_ANCHOR[$b]:-}" ]] && continue   # emitted at its anchor instead
    for h in ${HOIST_ORDER[@]+"${HOIST_ORDER[@]}"}; do
      [[ "${HOIST_ANCHOR[$h]}" == "$b" ]] && printf '%s\n' "$h"
    done
    printf '%s\n' "$b"
  done
}

mapfile -t ORDER < <(build_order)

# The ONE declared build order, published so there cannot be a second one.
# apply-migrations.sh consumes these two flags when it bootstraps an empty
# database; duplicating the parser there is how the two would silently diverge.
if [[ "$PRINT_SKIPS" -eq 1 ]]; then
  for _b in "${!SKIP[@]}"; do printf '%s\n' "$_b"; done | LC_ALL=C sort
  exit 0
fi
if [[ "$PRINT_ORDER" -eq 1 ]]; then
  printf '%s\n' ${ORDER[@]+"${ORDER[@]}"}
  exit 0
fi

[[ "${#ORDER[@]}" -gt 0 ]] && say "order resolved: ${#ORDER[@]} file(s) to apply, ${#SKIP[@]} skipped, ${#HOIST_ORDER[@]} hoisted"
[[ "${#ORDER[@]}" -eq 0 ]] && die "no migrations to apply in $MIG_DIR"

# A hoist whose anchor is itself hoisted or skipped would silently vanish from
# the order. Assert the count instead of trusting the loop.
expected=$(( $(printf '%s\n' "${ORDER[@]}" | wc -l) ))
actual=$(( $(ls -1 "$MIG_DIR"/*.sql 2>/dev/null | wc -l) - ${#SKIP[@]} ))
[[ "$expected" -eq "$actual" ]] \
  || die "order is $expected file(s) but $actual were expected — a hoist anchor is skipped or hoisted"

apply_pass() {
  local label="$1" b rc=0
  say "── ${label} ──"
  for b in "${ORDER[@]}"; do
    if ! tx_apply "${MIG_DIR}/${b}" "" > >(sed "s/^/    /") 2>&1; then
      say ""
      say "FAILED: ${b}  (${label})"
      if [[ "$label" == second\ pass* ]]; then
        say ""
        say "The first pass applied this file cleanly and the second did not, so"
        say "${b} is NOT idempotent. Every migration here must be re-runnable —"
        say "the ledger prevents KNOWN re-application, idempotency prevents the"
        say "unknown kind (a restore, a fresh environment, a file that died"
        say "between its DDL and its ledger row). Guard the DDL with IF NOT"
        say "EXISTS / DROP ... IF EXISTS / ON CONFLICT and re-push."
      fi
      rc=1
      break
    fi
  done
  return $rc
}

# ── 1. bootstrap ────────────────────────────────────────────────────────────
if [[ "$BOOTSTRAP" != "/dev/null" && -f "$BOOTSTRAP" ]]; then
  say "bootstrapping Supabase runtime objects the image does not ship…"
  "${PSQL[@]}" -f "$BOOTSTRAP" >/dev/null 2>&1 || die "bootstrap failed: $BOOTSTRAP" 1
fi

# ── 2. from zero ────────────────────────────────────────────────────────────
apply_pass "first pass — building the schema from an empty database" || exit 1

# ── 2b. the schema this build produced IS the schema the repo declares ──────
# Deliberately BETWEEN the two passes, because after the first pass every file
# has run EXACTLY ONCE — which is what a real bootstrap does, the ledger
# guaranteeing it — and that is the only well-defined "the schema this
# repository builds".
#
# ⚠️ MEASURED 2026-08-12: THE SECOND PASS USED TO CHANGE THE SCHEMA.
# 0002_itera_rls.sql line 152 is
#
#     grant select on all tables in schema itera to anon, authenticated;
#
# `ON ALL TABLES` is a snapshot of the moment it runs, not a rule. On pass 1 it
# sees only 0001's tables. On pass 2 the whole series exists, so `anon` picked
# up SELECT on relations created long after 0002. Same files, same order,
# different schema, decided purely by how many times you ran them. That is
# exactly how production got the grant set it has — the pre-ledger applier
# re-ran every file on every invocation — and it is recorded as D1 in
# db/census/known-differences.txt.
#
# ✅ CLOSED 2026-08-13 by migration 0065, which revokes the eight rows a
# re-run added and nothing else. Re-measured after it: the census is identical
# after pass 1 and after pass 2, 933 facts each. The series is a fixpoint, and
# step 3 below now ASSERTS that instead of this comment describing it.
#
# The placement above still stands on its own reasoning: after the first pass
# every file has run exactly once, which is what a real bootstrap does.
if [[ "$PARITY" -eq 1 ]]; then
  say "── the schema built here vs db/census/expected-schema.txt ──"
  bash "${ROOT}/scripts/schema-parity.sh" check || exit 1
fi

# ── 3. again, for idempotency, and it must CHANGE NOTHING ──────────────────
# The comment on 2b above used to end "the second pass changes the schema, so it
# cannot be the thing the declaration is measured against". That was true and it
# was the right call for --parity. It also left the change itself unasserted:
# eight grant rows appeared on every second pass, with exit code 0.
#
# Migration 0065 removes them, so the series is a fixpoint and this can be
# asserted rather than described. The ruler is census.sql — the SAME one
# --parity and db-drift use. A second ruler here would recreate exactly the
# problem census.sql was extracted to solve.
census_to() {
  local out="$1"
  psql -v ON_ERROR_STOP=1 -qtAX -f "${ROOT}/scripts/census.sql" > "$out" 2>/dev/null || return 1
  [[ -s "$out" ]] || return 1
  LC_ALL=C sort -o "$out" "$out" || return 1
}

if [[ "$SECOND_PASS" -eq 1 ]]; then
  CEN1="$(mktemp)"; CEN2="$(mktemp)"
  trap 'rm -f "$CEN1" "$CEN2"' EXIT
  census_to "$CEN1" || die "could not census the schema after the first pass" 1
  say "census after pass 1: $(wc -l < "$CEN1" | tr -d ' ') facts"

  apply_pass "second pass — every migration must be re-runnable" || exit 1

  census_to "$CEN2" || die "could not census the schema after the second pass" 1
  say "census after pass 2: $(wc -l < "$CEN2" | tr -d ' ') facts"

  # `comm`, not `diff`: the diff in the supabase/postgres image is BusyBox and
  # emits unified format only, so a parser written for GNU '<' / '>' markers
  # prints an EMPTY delta there. Burned exactly that way while writing this.
  ONLY1="$(LC_ALL=C comm -23 "$CEN1" "$CEN2")"
  ONLY2="$(LC_ALL=C comm -13 "$CEN1" "$CEN2")"
  if [[ -n "$ONLY1" || -n "$ONLY2" ]]; then
    say ""
    say "FAILED: the second pass applied cleanly and CHANGED THE SCHEMA."
    say ""
    say "  '-' only the FIRST pass produced it."
    say "  '+' the SECOND pass added it — this is what re-applying the series"
    say "      would do to a database that is already current."
    say ""
    [[ -n "$ONLY1" ]] && printf '%s\n' "$ONLY1" | sed 's/^/  -/'
    [[ -n "$ONLY2" ]] && printf '%s\n' "$ONLY2" | sed 's/^/  +/'
    say ""
    say "A migration in this series is not a fixpoint. The usual cause is a"
    say "statement that reads the schema at execution time instead of naming its"
    say "objects: 'grant ... on all tables in schema itera', a DO block looping"
    say "over pg_class, an UPDATE with no predicate. From zero it sees a small"
    say "schema; re-run against a current one it sees everything."
    say ""
    say "If you just added a table: grant it explicitly to the roles that need"
    say "it and 'revoke all ... from anon', the way 0060 does. Not via 0002."
    exit 5
  fi
  say "the second pass changed nothing — the series is a fixpoint"
fi

# ── 4. the real applier, on the PR's new files ──────────────────────────────
# Seed the ledger with everything ALREADY on main, then hand the database to
# apply-migrations.sh. It classifies the PR's files as PENDING and applies them
# through the same code path db-apply uses on merge — the transaction-mode
# detection (`self` / `none` / `wrap`), the ledger insert, the census refresh.
# Nothing else in CI exercises that script at all.
if [[ "$RUN_APPLIER" -eq 1 && "${#NEW_FILES[@]}" -gt 0 ]]; then
  say "── the real applier: db/scripts/apply-migrations.sh, on this PR's migrations ──"
  APPLIER="${ROOT}/scripts/apply-migrations.sh"
  [[ -x "$APPLIER" || -f "$APPLIER" ]] || die "apply-migrations.sh not found at $APPLIER" 2

  export ITERA_DB_URL="postgresql://${PGUSER:-postgres}@${PGHOST}:${PGPORT:-5432}/${PGDATABASE:-postgres}"
  export APPLIED_BY="ci-fresh-apply:${GITHUB_RUN_ID:-local}"

  # `status` is read-only and creates the ledger tables as a side effect
  # (ensure_ledger), which is what the seeding INSERT below needs.
  bash "$APPLIER" status >/dev/null 2>&1 || die "apply-migrations.sh could not reach the throwaway database" 1

  declare -A IS_NEW=()
  for p in "${NEW_FILES[@]}"; do IS_NEW["$(basename "$p")"]=1; done

  # EVERY file except the PR's, including the ones `skip` kept out of the build.
  # apply-migrations.sh classifies from the directory, not from our order — a
  # skipped file left out of the ledger would come back as PENDING and the
  # applier would try to run it. (Burned exactly that way on the first run.)
  values=""; seeded=0
  for f in "$MIG_DIR"/*.sql; do
    b="$(basename "$f")"
    [[ -n "${IS_NEW[$b]:-}" ]] && continue
    sum="$(sha256sum "$f" | cut -d' ' -f1)"
    values="${values}${values:+,}('itera-player:${b}','itera-player','${b}','${sum}','fresh-apply:pre-existing')"
    seeded=$((seeded + 1))
  done
  if [[ -n "$values" ]]; then
    "${PSQL[@]}" -c "insert into itera.schema_migrations
      (id, repo, filename, checksum, applied_by) values ${values}
      on conflict (id) do nothing;" >/dev/null \
      || die "could not seed the ledger" 1
  fi
  say "ledger seeded with ${seeded} pre-existing file(s); ${#IS_NEW[@]} left pending"

  if ! bash "$APPLIER" apply; then
    say ""
    say "apply-migrations.sh FAILED on this PR's migration(s) against a throwaway"
    say "database. Merging would have run exactly this against ITERA production."
    exit 1
  fi
fi

say "OK — the schema builds from zero, twice, and every migration in this PR ran."
