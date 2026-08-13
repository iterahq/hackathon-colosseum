#!/usr/bin/env bash
# ============================================================================
# apply-migrations.sh — apply Itera DB migrations EXACTLY ONCE, with a ledger.
#
# Target: the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
# NEVER DFL prod (yoojxnggaxcqtsyjdrdx) — that goes via devfellowship/dfl-schema.
#
# WHAT CHANGED, AND WHY IT HAD TO
# -------------------------------
# The previous version of this script had NO ledger: it re-ran every
# db/migrations/*.sql from 0001, in lexical order, on every invocation. That was
# tolerable for a rare manual run of files that were all idempotent by
# convention. It stopped being tolerable the moment this became the thing that
# fires on every merge to `main`: one non-idempotent file — a DROP, a backfill
# without ON CONFLICT, an UPDATE that is not a fixpoint — would then be re-run
# against production by the next unrelated merge, forever.
#
# So: a ledger (itera.schema_migrations), keyed by FILENAME, recording a
# checksum. Each file applies exactly once. What is pending is now a question
# with an answer, which is the other half of the point — the incident that
# prompted this (Tainan, TG 2026-08-04: "isso n pode acontecer. faz isso virar
# automacao bro") was 0036/0037/0038 sitting merged-and-unapplied for days with
# nothing able to say so.
#
# IDEMPOTENCY IS STILL MANDATORY IN EVERY MIGRATION FILE. The ledger prevents
# KNOWN re-application. Idempotency prevents UNKNOWN re-application: a restore
# from backup, a `-- itera:no-transaction` file that died between its DDL and its
# ledger row, a fresh environment, a bad baseline. Two layers, ~zero cost.
#
# Plan: 20260728-itera-migration-ci-lock (Fase 1 + Fase 5 camada 1).
#
# -- Commands ----------------------------------------------------------------
#   apply            (default) reconcile ledger -> apply pending -> refresh census
#   status           report applied / pending / checksum drift. Read-only.
#   plan             what `apply` WOULD do. Read-only. (alias: --dry-run)
#   drift            merged-but-not-applied + checksum drift + unaccounted
#                    objects. Read-only. Exit 3 if anything is off.
#   census-refresh   record a fresh schema census row
#   census-accept    record a fresh census AND acknowledge a diff (--reason req.)
#   rebaseline FILE  re-record the checksum of an already-applied file
#                    (--reason required). The explicit, audited way to say
#                    "yes, I edited an applied migration, and here is why".
#   baseline-add FILE  record FILE as applied WITHOUT running it (--reason
#                    required). For a migration that was already applied to this
#                    database out of ANOTHER repo and has now been consolidated
#                    into this one. See "adopting an already-applied file" below.
#
# -- Adopting an already-applied file ----------------------------------------
# `db/migrations/.baseline` reconciles the pre-ledger past, but it is ONE-SHOT:
# it is read only while the ledger has zero rows for this repo, and it has had
# rows since 2026-08-04. So it cannot be used to adopt a file that arrives later
# and is already applied — appending to it would be inert AND a lie in the repo.
#
# That case is real and recurring: on 2026-08-04 the `itera-api` and `itera-mcp`
# `migrations/` directories were deleted and their 14 files consolidated into
# this series (Tainan TG: *"deleta /migrations nesses dois repos e não permite
# mais criar via CI check"*). Every object they create already existed. Executing
# them would have re-run production DDL; leaving them unregistered would have
# made `db-apply` try to on the next merge.
#
# `baseline-add` is that operation, and it is deliberately the SAME INSERT
# `reconcile_baseline` performs — same `baseline:` provenance prefix, same
# never-execute semantics — just invocable after the one-shot has passed, with a
# mandatory reason recorded in the row.
#
# -- Connection --------------------------------------------------------------
# Either give a full URL:
#   ITERA_DB_URL='postgresql://postgres.kjefmwlopzeaqgqtlbdn@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'
#   PGPASSWORD='<Infisical /apps/itera SUPABASE_DB_PASSWORD>'
# ...or just the password, and let the defaults below build the URL:
#   SUPABASE_DB_PASSWORD='<same>'    # or PGPASSWORD
#
# WARNING: the DIRECT host db.<ref>.supabase.co is IPv6-only and unreachable
# from our VPSes and runners. Use the SESSION pooler `aws-1-us-east-1...` —
# `aws-1`, NOT `aws-0` (aws-0 answers "Tenant or user not found" for this
# project).
#
# -- Exit codes --------------------------------------------------------------
#   0  success
#   1  a migration FAILED to apply (the run stops at the first failure)
#   2  usage / environment error
#   3  DRIFT — checksum mismatch, unapplied migrations (in `drift`), or schema
#      objects no migration accounts for
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Overridable so db/scripts/test-baseline-precondition.sh can drive this script
# against throwaway fixtures. Nothing in CI or in production sets them.
MIG_DIR="${ITERA_MIGRATIONS_DIR:-${ROOT}/migrations}"
BASELINE_FILE="${MIG_DIR}/.baseline"
REPO_NAME="${ITERA_MIGRATIONS_REPO:-itera-player}"

DB_HOST="${ITERA_DB_HOST:-aws-1-us-east-1.pooler.supabase.com}"
DB_PORT="${ITERA_DB_PORT:-5432}"
DB_REF="${ITERA_DB_REF:-kjefmwlopzeaqgqtlbdn}"
DB_NAME="${ITERA_DB_NAME:-postgres}"

# -- args --------------------------------------------------------------------
CMD="apply"
REASON=""
TARGET=""
case "${1:-}" in
  apply|status|plan|drift|census-refresh|census-accept|rebaseline|baseline-add) CMD="$1"; shift ;;
  --dry-run)                                                                    CMD="plan"; shift ;;
  -h|--help) sed -n '2,84p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
  "")        ;;
  *) echo "ERROR: unknown command '$1' (see --help)" >&2; exit 2 ;;
esac
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)  CMD="plan"; shift ;;
    --reason)   REASON="${2:-}"; shift 2 ;;
    -h|--help)  sed -n '2,84p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
    -*)         echo "ERROR: unknown flag '$1'" >&2; exit 2 ;;
    *)          TARGET="$1"; shift ;;
  esac
done

say()  { printf '[migrate] %s\n' "$*"; }
warn() { printf '[migrate] %s\n' "$*" >&2; }
die()  { warn "ERROR: $*"; exit "${2:-2}"; }

# Report lines are accumulated so the same rendering reaches stdout, the GitHub
# step summary and the PR comment. One report, three surfaces.
REPORT_FILE="${REPORT_FILE:-}"
rep() {
  say "$*"
  [[ -n "$REPORT_FILE" ]] && printf '%s\n' "$*" >> "$REPORT_FILE"
  return 0
}

# -- connection --------------------------------------------------------------
if [[ -z "${ITERA_DB_URL:-}" ]]; then
  if [[ -n "${SUPABASE_DB_PASSWORD:-}" && -z "${PGPASSWORD:-}" ]]; then
    export PGPASSWORD="$SUPABASE_DB_PASSWORD"
  fi
  [[ -n "${PGPASSWORD:-}" ]] || die "need ITERA_DB_URL, or SUPABASE_DB_PASSWORD/PGPASSWORD to build one"
  ITERA_DB_URL="postgresql://postgres.${DB_REF}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"
fi
# Guardrail, same rule as the itera-supabase-helpers skill: this script must
# never be pointed at DFL prod, whatever the caller passes.
case "$ITERA_DB_URL" in
  *yoojxnggaxcqtsyjdrdx*) die "REFUSED: that is the DFL prod project. Itera migrations never touch it (CLAUDE.md)." ;;
esac
unset SUPABASE_DB_PASSWORD

APPLIED_BY="${APPLIED_BY:-manual:$(id -un 2>/dev/null || echo unknown)@$(hostname -s 2>/dev/null || echo unknown)}"

command -v psql >/dev/null 2>&1 || die "psql not found on PATH"

q() { psql "$ITERA_DB_URL" -v ON_ERROR_STOP=1 -qtAX -c "$1"; }
lit() { printf "%s" "${1//\'/\'\'}"; }   # single-quote escaping for SQL literals

# The transaction-mode logic lives in ONE place, db/scripts/tx-mode.sh, and is
# shared with db/scripts/fresh-apply.sh. Before that, each script carried its
# own copy and they disagreed: this one wrapped 55 of the 66 files in
# BEGIN/COMMIT, the checker ran every file in autocommit. See that file.
# shellcheck source=db/scripts/tx-mode.sh
. "${ROOT}/scripts/tx-mode.sh"
TX_PSQL=(psql "$ITERA_DB_URL" -v ON_ERROR_STOP=1 -qX)

# -- the ledger DDL, bootstrapped by the tool itself -------------------------
# Chicken and egg: the script cannot read a ledger that does not exist. It
# creates the two tables from the same DDL as migration 0039, which is why 0039
# is a no-op against a database this script has already touched — and why 0039
# exists anyway: without it, the census would report the ledger itself as an
# object no migration accounts for.
ensure_ledger() {
  psql "$ITERA_DB_URL" -v ON_ERROR_STOP=1 -qX >/dev/null <<'SQL'
set client_min_messages = warning;
create table if not exists itera.schema_migrations (
  id           text primary key,
  repo         text        not null,
  filename     text        not null,
  checksum     text        not null,
  applied_at   timestamptz not null default now(),
  applied_by   text        not null,
  duration_ms  integer
);
create unique index if not exists schema_migrations_repo_filename_idx
  on itera.schema_migrations (repo, filename);
create table if not exists itera.schema_object_census (
  id           bigint generated by default as identity primary key,
  captured_at  timestamptz not null default now(),
  digest       text        not null,
  objects      text        not null,
  captured_by  text        not null,
  note         text
);
create index if not exists schema_object_census_captured_at_idx
  on itera.schema_object_census (captured_at desc);
SQL
}

# -- the census ---------------------------------------------------------------
# The definition now lives in db/scripts/census.sql, ONE file shared with
# db/scripts/schema-parity.sh and the db-drift workflow. Until 2026-08-12 it was
# inline here and nothing else could reach it, so "the schema builds from zero"
# and "the schema has not drifted" were measured with two different rulers —
# and neither could answer whether the repository still rebuilds production.
#
# It also grew: it now reads constraint definitions, index definitions, policy
# PREDICATES, function body hashes, column defaults, grants, RLS flags,
# publication membership and COMMENTs. The old one read names and signatures,
# and was blind to a policy that keeps its name and changes its meaning. See the
# header of census.sql for the list and for what each part caught.
#
# The first census line is `#cens version=<n>`. `drift` compares the version
# BEFORE comparing the contents and re-records instead of reporting a diff when
# it moved — otherwise editing census.sql would masquerade as a schema-drift
# incident on the next daily run.
CENSUS_FILE="${ROOT}/scripts/census.sql"

census_now() {
  [[ -f "$CENSUS_FILE" ]] || { warn "no census definition at $CENSUS_FILE"; return 1; }
  psql "$ITERA_DB_URL" -v ON_ERROR_STOP=1 -qtAX -f "$CENSUS_FILE" | grep -v '^[[:space:]]*$'
}

# -- file discovery ----------------------------------------------------------
mig_files() {
  local f
  for f in "$MIG_DIR"/*.sql; do [[ -e "$f" ]] && printf '%s\n' "$f"; done | LC_ALL=C sort
}
sum_of() { sha256sum "$1" | cut -d' ' -f1; }

# -- ledger reads ------------------------------------------------------------
declare -A LEDGER_SUM=()
LEDGER_COUNT=0
load_ledger() {
  LEDGER_SUM=(); LEDGER_COUNT=0
  local fn cs
  while IFS='|' read -r fn cs; do
    [[ -n "$fn" ]] || continue
    LEDGER_SUM["$fn"]="$cs"
    LEDGER_COUNT=$((LEDGER_COUNT + 1))
  done < <(q "select filename, checksum from itera.schema_migrations where repo = '$(lit "$REPO_NAME")'")
}

# -- does the object a baselined file claims to have created actually exist? --
# One SQL probe per kind, each returning exactly `t` or `f`. Kept boring on
# purpose: a probe language nobody can read is a probe language nobody checks.
probe_holds() {
  local kind="$1" a="${2:-}" b="${3:-}" sql=""
  case "$kind" in
    table)
      sql="select to_regclass('$(lit "$a")') is not null" ;;
    column)
      local tbl="${a%.*}" col="${a##*.}"
      sql="select exists (select 1 from pg_attribute at
             join pg_class c on c.oid = at.attrelid
             where c.oid = to_regclass('$(lit "$tbl")')
               and at.attname = '$(lit "$col")'
               and at.attnum > 0 and not at.attisdropped)" ;;
    function)
      local sch="${a%.*}" fn="${a##*.}"
      sql="select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = '$(lit "$sch")' and p.proname = '$(lit "$fn")')" ;;
    policy)
      sql="select exists (select 1 from pg_policy pol
             where pol.polrelid = to_regclass('$(lit "$a")')
               and pol.polname = '$(lit "$b")')" ;;
    trigger)
      sql="select exists (select 1 from pg_trigger t
             where t.tgrelid = to_regclass('$(lit "$a")')
               and t.tgname = '$(lit "$b")' and not t.tgisinternal)" ;;
    enum)
      local sch="${a%.*}" typ="${a##*.}"
      sql="select exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
             join pg_namespace n on n.oid = t.typnamespace
             where n.nspname = '$(lit "$sch")' and t.typname = '$(lit "$typ")'
               and e.enumlabel = '$(lit "$b")')" ;;
    *) warn "unknown probe kind '${kind}'"; return 2 ;;
  esac
  [[ "$(q "$sql" 2>/dev/null)" == "t" ]]
}

# -- one-shot reconciliation of the pre-ledger past --------------------------
# Runs ONLY when this repo has zero ledger rows. Records the files declared in
# db/migrations/.baseline as applied WITHOUT EXECUTING THEM, and nothing else —
# so anything merged after the baseline (0036/0037/0038 on day one) is still
# seen as pending and gets applied normally.
#
# The naive alternative — "empty ledger, so mark everything present as applied"
# — would have silently swallowed exactly the three migrations this automation
# was built to rescue. That is why the baseline is a declared list, not a
# heuristic.
#
# ⚠️ 2026-08-12 — AND WHY THE LIST ALONE WAS NOT ENOUGH EITHER.
# An empty ledger was read as "this is the pre-ledger production database". It
# is also what a BRAND NEW database has. Measured on a throwaway Postgres: this
# function recorded 36 files as applied against an empty database, leaving a
# ledger claiming a complete schema over 2 tables (both the ledger's own) and 0
# functions. Disaster recovery from this repository produced nothing, and said
# it had succeeded.
#
# So the baseline now carries, per file, the object that proves it ran, and the
# three outcomes are decided by measurement rather than by assumption:
#
#   every probe holds -> the pre-ledger production database. Baseline.
#   no probe holds    -> an EMPTY database. Do NOT baseline. Every file is
#                        pending, which is what actually builds a schema.
#   some hold         -> REFUSE, exit 3. A half-built database is not a state
#                        this file can describe, and choosing between "apply"
#                        and "skip" by guessing is how it goes silently wrong.
reconcile_baseline() {
  [[ "$LEDGER_COUNT" -eq 0 ]] || return 0
  [[ -f "$BASELINE_FILE" ]] || { rep "ledger empty and no .baseline file — treating ALL files as pending"; return 0; }

  local git_sha b f n=0 line rest kind pa pb
  local names=() probe_kind=() probe_a=() probe_b=()
  git_sha="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    # shellcheck disable=SC2206
    local parts=($line)
    [[ "${#parts[@]}" -eq 0 ]] && continue
    b="${parts[0]}"
    kind="${parts[1]:-}"
    [[ -n "$kind" ]] || die ".baseline: '${b}' has no evidence column. Every line must name the object that proves the file ran, or 'none <reason>'." 2
    names+=("$b"); probe_kind+=("$kind")
    probe_a+=("${parts[2]:-}"); probe_b+=("${parts[3]:-}")
  done < "$BASELINE_FILE"

  # ── evaluate the evidence before writing a single ledger row ──────────────
  local held=() failed=() i total_probes=0
  for i in "${!names[@]}"; do
    [[ "${probe_kind[$i]}" == "none" ]] && continue
    total_probes=$((total_probes + 1))
    if probe_holds "${probe_kind[$i]}" "${probe_a[$i]}" "${probe_b[$i]}"; then
      held+=("${names[$i]}")
    else
      failed+=("${names[$i]}")
    fi
  done
  [[ "$total_probes" -gt 0 ]] || die ".baseline declares no checkable evidence at all — refusing to baseline on an unverifiable claim." 2

  if [[ "${#held[@]}" -eq 0 ]]; then
    rep "FIRST RUN — the ledger is empty AND none of the ${total_probes} baselined objects exist."
    rep "  This is a FRESH database, not the pre-ledger production one. NOT baselining:"
    rep "  every migration is pending and will be applied, which is what builds the schema."
    FROM_ZERO=1
    return 0
  fi

  if [[ "${#failed[@]}" -gt 0 ]]; then
    rep "REFUSING TO BASELINE — the database matches ${#held[@]} of ${total_probes} baselined objects, not all and not none."
    rep "A half-built database is not a state db/migrations/.baseline can describe."
    rep "Baselining would record these files as applied while their objects are absent:"
    for b in "${failed[@]}"; do rep "  MISSING  ${b}"; done
    rep ""
    rep "Decide explicitly. Either finish building this database, or point the script"
    rep "at the right one. Do not edit .baseline to make the check pass."
    exit 3
  fi

  rep "FIRST RUN — ledger is empty and all ${total_probes} baselined objects are present."
  rep "Reconciling ${#names[@]} baselined file(s) as already applied, WITHOUT running them."
  for b in "${names[@]}"; do
    f="${MIG_DIR}/${b}"
    if [[ ! -f "$f" ]]; then
      warn "  baseline names '${b}' but that file does not exist — skipping (fix .baseline)"
      continue
    fi
    q "insert into itera.schema_migrations (id, repo, filename, checksum, applied_by)
       values ('$(lit "${REPO_NAME}:${b}")', '$(lit "$REPO_NAME")', '$(lit "$b")',
               '$(lit "$(sum_of "$f")")', '$(lit "baseline:${git_sha}")')
       on conflict (id) do nothing" >/dev/null || die "baseline insert failed for ${b}" 1
    n=$((n + 1))
  done
  rep "  baselined ${n} file(s) as applied at ${git_sha} (NOT executed)"
  load_ledger
}

# -- building an EMPTY database: order, and the one declared skip -------------
# Set by reconcile_baseline when it proves the target is a fresh database.
FROM_ZERO=0

# INCREMENTAL ORDER IS NOT BUILD ORDER, AND THAT IS NOT A BUG.
# On production this script applies a PENDING file onto a schema that already
# has everything before it, so lexical order is right and the question of a
# forward reference never arises. On an EMPTY database it does: 0024 references
# a type created by 0047, because PR #282 renumbered fourteen files out of
# itera-api / itera-mcp into positions after the files that depend on them.
# That order is already declared, once, in fresh-apply-exceptions.txt, and
# db/scripts/fresh-apply.sh already resolves it. So this asks that script for
# the answer instead of parsing the file a second time — two parsers of one
# declaration is how the two silently start disagreeing.
#
# ⚠️ REACHABLE ONLY WHEN THE LEDGER IS EMPTY. Production's ledger has had rows
# since 2026-08-04, so on production none of this executes.
FRESH_APPLY="${ROOT}/scripts/fresh-apply.sh"

declare -A BUILD_SKIP=()
BUILD_ORDER=()
load_build_order() {
  [[ -f "$FRESH_APPLY" ]] || die "cannot build from zero: $FRESH_APPLY is missing" 2
  local b
  local _exc=()
  [[ -n "${ITERA_BUILD_EXCEPTIONS:-}" ]] && _exc=(--exceptions "$ITERA_BUILD_EXCEPTIONS")
  BUILD_ORDER=(); BUILD_SKIP=()
  while IFS= read -r b; do [[ -n "$b" ]] && BUILD_ORDER+=("$b"); done \
    < <(bash "$FRESH_APPLY" --migrations-dir "$MIG_DIR" ${_exc[@]+"${_exc[@]}"} --print-order)
  while IFS= read -r b; do [[ -n "$b" ]] && BUILD_SKIP["$b"]=1; done \
    < <(bash "$FRESH_APPLY" --migrations-dir "$MIG_DIR" ${_exc[@]+"${_exc[@]}"} --print-skips)
  [[ "${#BUILD_ORDER[@]}" -gt 0 ]] || die "the declared build order came back empty" 2
}

# A declared skip has to leave a ledger row, or the file stays PENDING forever
# and every later `apply` and every daily `drift` reports a database that is
# actually complete. The row says `declared-skip`, never `applied`, so the
# distinction survives in the audit trail — and the checksum is still recorded,
# so editing the file later still trips drift detection exactly as it should.
#
# This is only sound because the skip is PROVEN inert: db/census/expected-schema.txt
# is generated from a build that omits 0005 and matches production's catalogue
# fact for fact. If a skipped file ever created an object, schema-parity.sh goes
# red. That is what makes this a record rather than a second baseline.
record_declared_skip() {
  local b="$1" f="${MIG_DIR}/$1"
  q "insert into itera.schema_migrations (id, repo, filename, checksum, applied_by)
     values ('$(lit "${REPO_NAME}:${b}")', '$(lit "$REPO_NAME")', '$(lit "$b")',
             '$(lit "$(sum_of "$f")")',
             '$(lit "declared-skip:fresh-apply-exceptions.txt:${APPLIED_BY}")')
     on conflict (id) do nothing" >/dev/null \
    || die "could not record the declared skip for ${b}" 1
  rep "  SKIP  ${b}  (declared in fresh-apply-exceptions.txt; creates no schema object)"
}

# -- classify: applied / pending / drifted -----------------------------------
PENDING=(); DRIFTED=(); APPLIED_OK=0
classify() {
  PENDING=(); DRIFTED=(); APPLIED_OK=0
  local f b s
  while IFS= read -r f; do
    b="$(basename "$f")"; s="$(sum_of "$f")"
    if [[ -n "${LEDGER_SUM[$b]:-}" ]]; then
      if [[ "${LEDGER_SUM[$b]}" == "$s" ]]; then
        APPLIED_OK=$((APPLIED_OK + 1))
      else
        DRIFTED+=("$b")
      fi
    else
      PENDING+=("$b")
    fi
  done < <(mig_files)
}

# -- apply one file ----------------------------------------------------------
# The file and its ledger row go in ONE psql session. Three transaction modes,
# picked by reading the file rather than by assuming:
#
#   self  the file opens its own `begin;` — most recent migrations do. We add no
#         wrapper: a nested BEGIN is only a WARNING, but it would also mean the
#         file's own `commit;` silently closes OUR transaction, so wrapping buys
#         nothing and costs two confusing warnings per file in the CI log.
#   none  the first line carries `-- itera:no-transaction`, for DDL Postgres
#         refuses to run inside a transaction block (ALTER TYPE ... ADD VALUE is
#         the real case, in itera-mcp:0002).
#   wrap  everything else — we open BEGIN and COMMIT around the file AND its
#         ledger row, so "applied" and "recorded as applied" cannot come apart.
#
# HONEST CAVEAT for `self` and `none`: the ledger INSERT lands in its own
# implicit transaction just after the file committed. If the connection dies in
# that gap the file is applied and unrecorded, and the next run re-applies it —
# safe only because every migration is idempotent. That is one of the two
# reasons idempotency is still mandatory even with a ledger.
apply_one() {
  local f="$1" b s mode rc start end dur
  b="$(basename "$f")"; s="$(sum_of "$f")"
  # ONE implementation, in db/scripts/tx-mode.sh, shared with fresh-apply.sh.
  # The from-zero carve-out (`wrap` collapses to `none` on an empty database,
  # so 0041_mcp0002 can build a schema from nothing) lives there too, behind
  # TX_FROM_ZERO, instead of being restated here and implied there.
  TX_FROM_ZERO="$FROM_ZERO"
  mode="$(tx_mode_of "$f")"

  start="$(date +%s%3N)"
  # NOTE: tx_apply ends in a command that SUCCEEDS. `set -o pipefail` takes the
  # rightmost non-zero status in the pipeline, so a trailing
  # `[[ cond ]] && echo ...` whose condition is false would make this function
  # report a failure for a migration that applied perfectly. That bug was real
  # and was caught by the ephemeral-Postgres test before this shipped.
  tx_apply "$f" \
    "insert into itera.schema_migrations (id, repo, filename, checksum, applied_by)
           values ('$(lit "${REPO_NAME}:${b}")', '$(lit "$REPO_NAME")', '$(lit "$b")',
                   '$(lit "$s")', '$(lit "$APPLIED_BY")')
           on conflict (id) do nothing;"
  rc=$?
  end="$(date +%s%3N)"; dur=$((end - start))

  if [[ "$rc" -ne 0 ]]; then
    rep "  FAIL  ${b}  (tx=${mode}, psql exit ${rc}, ${dur}ms)"
    return 1
  fi
  q "update itera.schema_migrations set duration_ms = ${dur}
     where id = '$(lit "${REPO_NAME}:${b}")' and duration_ms is null" >/dev/null 2>&1 || true
  rep "  OK    ${b}  (tx=${mode}, ${dur}ms)"
  return 0
}

# -- census ------------------------------------------------------------------
store_census() {
  local note="${1:-}" dig tmp rc n
  tmp="$(mktemp)"
  census_now > "$tmp" || { rm -f "$tmp"; return 1; }
  dig="$(sha256sum "$tmp" | cut -d' ' -f1)"
  n="$(wc -l < "$tmp" | tr -d ' ')"
  psql "$ITERA_DB_URL" -v ON_ERROR_STOP=1 -qX >/dev/null <<SQL
\\set objs \`cat ${tmp}\`
insert into itera.schema_object_census (digest, objects, captured_by, note)
values ('$(lit "$dig")', :'objs', '$(lit "$APPLIED_BY")',
        $( [[ -n "$note" ]] && echo "'$(lit "$note")'" || echo "null" ));
delete from itera.schema_object_census
 where id not in (select id from itera.schema_object_census order by captured_at desc limit 30);
SQL
  rc=$?
  rm -f "$tmp"
  [[ "$rc" -eq 0 ]] || return 1
  rep "census recorded — digest ${dig:0:12}, ${n} objects${note:+ — note: ${note}}"
}

# ============================================================================
# COMMANDS
# ============================================================================
ensure_ledger || die "cannot reach the database (or cannot create the ledger)" 1
load_ledger

case "$CMD" in

  status|plan)
    classify
    rep "repo=${REPO_NAME}  files=$(mig_files | wc -l | tr -d ' ')  applied=${APPLIED_OK}  pending=${#PENDING[@]}  checksum-drift=${#DRIFTED[@]}"
    if [[ "$LEDGER_COUNT" -eq 0 ]]; then
      rep "ledger is EMPTY — the next \`apply\` will first reconcile the .baseline list (without running those files), then apply the rest"
    fi
    for b in ${PENDING[@]+"${PENDING[@]}"}; do rep "  PENDING  ${b}"; done
    for b in ${DRIFTED[@]+"${DRIFTED[@]}"}; do rep "  DRIFT    ${b}  (applied, but the file changed since)"; done
    [[ "${#DRIFTED[@]}" -gt 0 ]] && exit 3
    exit 0
    ;;

  drift)
    classify
    bad=0
    # (1) merged but not applied — the exact failure mode that caused this work.
    if [[ "${#PENDING[@]}" -gt 0 ]]; then
      bad=1
      rep "DRIFT: ${#PENDING[@]} migration(s) merged to main but NOT applied to the database:"
      for b in "${PENDING[@]}"; do rep "  NOT APPLIED  ${b}"; done
    fi
    # (2) an applied migration whose file was edited afterwards.
    if [[ "${#DRIFTED[@]}" -gt 0 ]]; then
      bad=1
      rep "DRIFT: ${#DRIFTED[@]} applied migration(s) were EDITED after being applied:"
      for b in "${DRIFTED[@]}"; do rep "  CHECKSUM  ${b}"; done
    fi
    # (3) ledger rows with no file — a migration was deleted or renamed.
    if [[ "${#LEDGER_SUM[@]}" -gt 0 ]]; then
      for b in "${!LEDGER_SUM[@]}"; do
        if [[ ! -f "${MIG_DIR}/${b}" ]]; then
          bad=1; rep "  ORPHAN    ${b}  (ledger row with no file on main)"
        fi
      done
    fi
    # (4) objects no migration accounts for.
    tmp_now="$(mktemp)"; census_now > "$tmp_now"
    dig_now="$(sha256sum "$tmp_now" | cut -d' ' -f1)"
    dig_last="$(q "select digest from itera.schema_object_census order by captured_at desc limit 1")"
    tmp_last="$(mktemp)"
    q "select objects from itera.schema_object_census order by captured_at desc limit 1" > "$tmp_last"
    # The census DEFINITION is versioned. Comparing a v2 reading against a v1
    # fingerprint would report the entire schema as drifted — a false incident
    # loud enough that the next real one gets ignored. A version change means
    # re-record, and say so.
    ver_now="$(command grep '^#cens ' "$tmp_now" || true)"
    ver_last="$(command grep '^#cens ' "$tmp_last" || true)"
    if [[ -z "$dig_last" ]]; then
      rep "census: no stored fingerprint yet — recording the first one (nothing to compare against this run)"
      store_census "first census"
    elif [[ "$ver_now" != "$ver_last" ]]; then
      rep "census: the DEFINITION changed ('${ver_last:-v1, unversioned}' -> '${ver_now}')."
      rep "        Re-recording instead of diffing — a new ruler is not a schema change."
      store_census "census definition moved to ${ver_now}"
    elif [[ "$dig_now" != "$dig_last" ]]; then
      bad=1
      rep "DRIFT: the schema no longer matches the last recorded census (${dig_last:0:12} -> ${dig_now:0:12})."
      rep "       (+) present now and not in the census, (-) gone since:"
      while IFS= read -r l; do rep "  ${l}"; done < <(diff <(sort "$tmp_last") <(sort "$tmp_now") \
        | command grep -E '^[<>]' | sed 's/^>/+/; s/^</-/' | head -60)
      rep "       Expected causes: DDL applied by hand, or a hand-applied itera-api /"
      rep "       itera-mcp migration — those series are out-of-band for this pipeline."
      rep "       If legitimate:  db/scripts/apply-migrations.sh census-accept --reason '<why>'"
    else
      rep "census: schema matches the last recorded fingerprint (${dig_now:0:12})"
    fi
    rm -f "$tmp_now" "$tmp_last"
    [[ "$bad" -eq 0 ]] && { rep "no drift."; exit 0; }
    exit 3
    ;;

  census-refresh) store_census "$REASON" || exit 1; exit 0 ;;

  census-accept)
    [[ -n "$REASON" ]] || die "census-accept requires --reason '<why this out-of-band change is legitimate>'"
    store_census "ACCEPTED: ${REASON}" || exit 1
    exit 0
    ;;

  rebaseline)
    [[ -n "$TARGET" ]] || die "rebaseline needs a filename"
    [[ -n "$REASON" ]] || die "rebaseline requires --reason '<why the applied file was edited>'"
    b="$(basename "$TARGET")"; f="${MIG_DIR}/${b}"
    [[ -f "$f" ]] || die "no such migration: ${b}"
    [[ -n "${LEDGER_SUM[$b]:-}" ]] || die "${b} is not in the ledger — nothing to rebaseline (just apply it)"
    q "update itera.schema_migrations
          set checksum = '$(lit "$(sum_of "$f")")',
              applied_by = '$(lit "rebaseline:${APPLIED_BY}: ${REASON}")'
        where id = '$(lit "${REPO_NAME}:${b}")'" >/dev/null || die "rebaseline failed" 1
    rep "rebaselined ${b} — reason: ${REASON}"
    exit 0
    ;;

  # -- baseline-add ----------------------------------------------------------
  # Record a file as applied WITHOUT executing it, after the one-shot .baseline
  # reconciliation is spent. The insert is deliberately identical to the one in
  # reconcile_baseline(), including the `baseline:` provenance prefix, because it
  # is the same claim: "this was applied to this database before it arrived in
  # this series, and re-running it is not what we want".
  #
  # REFUSES if the file already has a ledger row. That is not a nicety: silently
  # overwriting an existing row would let someone launder a checksum mismatch
  # through this command instead of through `rebaseline`, which is the one that
  # requires you to say a human decided the file changed.
  #
  # It does NOT touch the census — nothing about the schema changed. If the
  # adopted objects were previously reported as unaccounted-for by `drift`
  # (they would have been, being out-of-band), accept that separately with
  # `census-accept --reason '<why>'`.
  baseline-add)
    [[ -n "$TARGET" ]] || die "baseline-add needs a filename"
    [[ -n "$REASON" ]] || die "baseline-add requires --reason '<why this file is already applied>'"
    b="$(basename "$TARGET")"; f="${MIG_DIR}/${b}"
    [[ -f "$f" ]] || die "no such migration: ${b}"
    if [[ -n "${LEDGER_SUM[$b]:-}" ]]; then
      die "${b} is ALREADY in the ledger. baseline-add never overwrites a row — if the
       file was edited after being applied, that is a rebaseline decision:
         apply-migrations.sh rebaseline ${b} --reason '<why>'" 3
    fi
    git_sha="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    q "insert into itera.schema_migrations (id, repo, filename, checksum, applied_by)
       values ('$(lit "${REPO_NAME}:${b}")', '$(lit "$REPO_NAME")', '$(lit "$b")',
               '$(lit "$(sum_of "$f")")', '$(lit "baseline-add:${git_sha}: ${REASON}")')" \
      >/dev/null || die "baseline-add insert failed for ${b}" 1
    rep "baseline-added ${b} — recorded as applied at ${git_sha}, NOT executed. Reason: ${REASON}"
    exit 0
    ;;

  apply)
    reconcile_baseline
    classify

    if [[ "${#DRIFTED[@]}" -gt 0 ]]; then
      rep "REFUSING TO APPLY — ${#DRIFTED[@]} already-applied migration(s) have been EDITED since:"
      for b in "${DRIFTED[@]}"; do rep "  ${b}"; done
      rep ""
      rep "An edited applied migration means the repo and the database disagree about what"
      rep "is IN the database. Skipping it silently — what a checksum-blind ledger would do"
      rep "— hides that disagreement forever. Decide explicitly:"
      rep "  * cosmetic edit / already reflected in prod:"
      rep "      db/scripts/apply-migrations.sh rebaseline <file> --reason '<why>'"
      rep "  * a real schema change: revert the file and write a NEW migration."
      exit 3
    fi

    if [[ "${#PENDING[@]}" -eq 0 ]]; then
      rep "nothing to do — ${APPLIED_OK} migration(s) applied, 0 pending."
      store_census "" || true
      exit 0
    fi

    # Building an empty database is a different job from advancing production,
    # and it needs the declared build order rather than the lexical one. Only
    # reachable when reconcile_baseline proved the target is fresh.
    RUN_LIST=("${PENDING[@]}")
    if [[ "$FROM_ZERO" -eq 1 ]]; then
      load_build_order
      RUN_LIST=()
      declare -A _pending_set=()
      for b in "${PENDING[@]}"; do _pending_set["$b"]=1; done
      for b in "${BUILD_ORDER[@]}"; do
        [[ -n "${_pending_set[$b]:-}" ]] && RUN_LIST+=("$b")
      done
      rep "BUILDING FROM ZERO — using the declared build order from"
      rep "  db/scripts/fresh-apply-exceptions.txt (${#RUN_LIST[@]} file(s), ${#BUILD_SKIP[@]} declared skip(s))."
      rep "  The lexical order cannot build this schema: 0024 references a type that 0047 creates."
      for b in "${!BUILD_SKIP[@]}"; do
        [[ -n "${_pending_set[$b]:-}" ]] && record_declared_skip "$b"
      done
      # A file that is pending, not skipped and not in the order would be
      # silently dropped. Say so instead.
      for b in "${PENDING[@]}"; do
        if [[ -z "${BUILD_SKIP[$b]:-}" ]] && ! printf '%s\n' ${RUN_LIST[@]+"${RUN_LIST[@]}"} | command grep -qxF "$b"; then
          die "the declared build order does not contain pending file '${b}' — fix fresh-apply-exceptions.txt" 2
        fi
      done
    fi

    rep "applying ${#RUN_LIST[@]} pending migration(s) as ${APPLIED_BY}:"
    failed=""
    for b in "${RUN_LIST[@]}"; do
      if ! apply_one "${MIG_DIR}/${b}"; then failed="$b"; break; fi
    done

    if [[ -n "$failed" ]]; then
      rep ""
      rep "STOPPED at ${failed}. Later migrations were NOT attempted — order matters, and"
      rep "applying past a failure is how a half-migrated schema becomes a mystery."
      rep "State: everything before ${failed} is applied; ${failed} is partially applied or"
      rep "not at all (see the psql error above). Forward-fix and re-run — every migration"
      rep "is idempotent, so a re-run is safe."
      exit 1
    fi

    # ── the ledger's own tables must not be readable by the client roles ──────
    # Caught by schema-parity.sh on the first end-to-end recovery run, 2026-08-12.
    # ensure_ledger() creates itera.schema_migrations and
    # itera.schema_object_census BEFORE any migration runs — it has to, since the
    # script cannot read a ledger that does not exist. On a from-zero build that
    # puts them inside the `itera` schema in time for
    #
    #     0002_itera_rls.sql:152  grant select on all tables in schema itera
    #                             to anon, authenticated;
    #
    # to pick them up. Production does not have those grants, because there the
    # ledger tables were created in 2026-08-04, long after 0002 last ran. So a
    # recovered database would have handed `anon` read access to the migration
    # ledger — and neither table has RLS.
    #
    # It is the same defect as D1 in db/census/known-differences.txt wearing a
    # different hat: `GRANT ON ALL TABLES` is a snapshot of the moment, and the
    # moment moved.
    if [[ "$FROM_ZERO" -eq 1 ]]; then
      q "revoke all on itera.schema_migrations, itera.schema_object_census
         from anon, authenticated" >/dev/null 2>&1 \
        && rep "revoked client-role access to the ledger tables (0002's blanket grant caught them)"
    fi

    store_census "" || warn "WARNING: census refresh failed (the migrations DID apply)"
    rep "done — ${#RUN_LIST[@]} applied, 0 pending."
    exit 0
    ;;
esac
