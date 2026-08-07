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
#     --no-second-pass      skip the idempotency pass
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
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG_DIR="${ROOT}/migrations"
EXC_FILE="${ROOT}/scripts/fresh-apply-exceptions.txt"
BOOTSTRAP="${ROOT}/scripts/fresh-apply-bootstrap.sql"
SECOND_PASS=1
RUN_APPLIER=1
NEW_FILES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --new)             _n=(); read -r -a _n <<< "${2:-}"
                       [[ "${#_n[@]}" -gt 0 ]] && NEW_FILES+=("${_n[@]}"); shift 2 ;;
    --migrations-dir)  MIG_DIR="${2:?}"; shift 2 ;;
    --exceptions)      EXC_FILE="${2:?}"; shift 2 ;;
    --bootstrap)       BOOTSTRAP="${2:?}"; shift 2 ;;
    --no-second-pass)  SECOND_PASS=0; shift ;;
    --no-applier)      RUN_APPLIER=0; shift ;;
    -h|--help)         sed -n '2,64p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
    *)                 echo "ERROR: unknown argument '$1' (see --help)" >&2; exit 2 ;;
  esac
done

say()  { printf '[fresh-apply] %s\n' "$*"; }
die()  { printf '[fresh-apply] ERROR: %s\n' "$1" >&2; exit "${2:-2}"; }

command -v psql >/dev/null 2>&1 || die "psql not found on PATH"
[[ -d "$MIG_DIR" ]] || die "no such migrations dir: $MIG_DIR"

# A bare `psql` with no host is a unix-socket connection to a database this
# script must never assume anything about. Require the target to be stated.
[[ -n "${PGHOST:-}" ]] || die "PGHOST is unset — refusing to guess the target database"
# Belt for the one mistake that would be unrecoverable: this script applies DDL,
# so it must never be pointed at either production project.
case "${PGHOST}:${PGDATABASE:-}" in
  *kjefmwlopzeaqgqtlbdn*|*yoojxnggaxcqtsyjdrdx*|*supabase.com*|*supabase.co*)
    die "REFUSED: PGHOST looks like a real Supabase project. This script applies DDL and is for throwaway databases only." ;;
esac

PSQL=(psql -v ON_ERROR_STOP=1 -qX)

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
    if ! "${PSQL[@]}" -f "${MIG_DIR}/${b}" > >(sed "s/^/    /") 2>&1; then
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

# ── 3. again, for idempotency ───────────────────────────────────────────────
if [[ "$SECOND_PASS" -eq 1 ]]; then
  apply_pass "second pass — every migration must be re-runnable" || exit 1
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
