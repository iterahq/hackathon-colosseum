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
MIG_DIR="${ROOT}/migrations"
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

# -- the census query --------------------------------------------------------
# Everything this project owns that DDL can change. Deliberately includes column
# types and NOT NULL, because 0037/0038 are column additions and a census blind
# to columns would have been blind to the exact incident that prompted it.
read -r -d '' CENSUS_SQL <<'SQL'
select line from (
  select format('rel  %s.%s %s', n.nspname, c.relname, c.relkind) as line
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('itera','billing') and c.relkind in ('r','v','m','p','f')
  union all
  select format('col  %s.%s.%s %s%s', n.nspname, c.relname, a.attname,
                format_type(a.atttypid, a.atttypmod),
                case when a.attnotnull then ' NOT NULL' else '' end)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('itera','billing') and c.relkind in ('r','v','m','p','f')
     and a.attnum > 0 and not a.attisdropped
  union all
  select format('idx  %s.%s', n.nspname, c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('itera','billing') and c.relkind = 'i'
  union all
  select format('fn   %s.%s(%s)', n.nspname, p.proname,
                pg_get_function_identity_arguments(p.oid))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('itera','billing')
  union all
  select format('type %s.%s %s [%s]', n.nspname, t.typname, t.typtype,
                coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder)
                            from pg_enum e where e.enumtypid = t.oid), ''))
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
   where n.nspname in ('itera','billing') and t.typtype in ('e','d')
  union all
  select format('pol  %s.%s %s', schemaname, tablename, policyname)
    from pg_policies
   where schemaname in ('itera','billing')
      or (schemaname = 'realtime' and policyname like 'itera%')
  union all
  select format('trg  %s.%s %s', n.nspname, c.relname, t.tgname)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('itera','billing') and not t.tgisinternal
) s order by line
SQL

census_now() { q "$CENSUS_SQL"; }

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
reconcile_baseline() {
  [[ "$LEDGER_COUNT" -eq 0 ]] || return 0
  [[ -f "$BASELINE_FILE" ]] || { rep "ledger empty and no .baseline file — treating ALL files as pending"; return 0; }

  local git_sha b f n=0
  local names=()
  git_sha="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  while IFS= read -r b; do
    b="${b%%#*}"; b="${b//[$'\r\t ']/}"
    [[ -n "$b" ]] && names+=("$b")
  done < "$BASELINE_FILE"

  rep "FIRST RUN — ledger is empty. Reconciling ${#names[@]} baselined file(s) as already applied, WITHOUT running them."
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
  local f="$1" b s start end dur no_tx=0 self_tx=0 mode rc
  b="$(basename "$f")"; s="$(sum_of "$f")"
  head -1 "$f" | command grep -q 'itera:no-transaction' && no_tx=1
  command grep -qiE '^[[:space:]]*begin[[:space:]]*;' "$f" && self_tx=1
  if   [[ "$no_tx"   -eq 1 ]]; then mode=none
  elif [[ "$self_tx" -eq 1 ]]; then mode=self
  else                              mode=wrap
  fi

  start="$(date +%s%3N)"
  # NOTE: every branch below ends in a command that SUCCEEDS. `set -o pipefail`
  # takes the rightmost non-zero status in the pipeline, so a trailing
  # `[[ cond ]] && echo ...` whose condition is false would make this function
  # report a failure for a migration that applied perfectly. That bug was real
  # and was caught by the ephemeral-Postgres test before this shipped.
  {
    echo "\\set ON_ERROR_STOP on"
    if [[ "$mode" == "wrap" ]]; then echo "begin;"; fi
    printf '\\i %s\n' "$f"
    echo "insert into itera.schema_migrations (id, repo, filename, checksum, applied_by)
          values ('$(lit "${REPO_NAME}:${b}")', '$(lit "$REPO_NAME")', '$(lit "$b")',
                  '$(lit "$s")', '$(lit "$APPLIED_BY")')
          on conflict (id) do nothing;"
    if [[ "$mode" == "wrap" ]]; then echo "commit;"; fi
    true
  } | psql "$ITERA_DB_URL" -v ON_ERROR_STOP=1 -qX
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
    if [[ -z "$dig_last" ]]; then
      rep "census: no stored fingerprint yet — recording the first one (nothing to compare against this run)"
      store_census "first census"
    elif [[ "$dig_now" != "$dig_last" ]]; then
      bad=1
      tmp_last="$(mktemp)"
      q "select objects from itera.schema_object_census order by captured_at desc limit 1" > "$tmp_last"
      rep "DRIFT: the schema no longer matches the last recorded census (${dig_last:0:12} -> ${dig_now:0:12})."
      rep "       (+) present now and not in the census, (-) gone since:"
      while IFS= read -r l; do rep "  ${l}"; done < <(diff <(sort "$tmp_last") <(sort "$tmp_now") \
        | command grep -E '^[<>]' | sed 's/^>/+/; s/^</-/' | head -60)
      rep "       Expected causes: DDL applied by hand, or a hand-applied itera-api /"
      rep "       itera-mcp migration — those series are out-of-band for this pipeline."
      rep "       If legitimate:  db/scripts/apply-migrations.sh census-accept --reason '<why>'"
      rm -f "$tmp_last"
    else
      rep "census: schema matches the last recorded fingerprint (${dig_now:0:12})"
    fi
    rm -f "$tmp_now"
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

    rep "applying ${#PENDING[@]} pending migration(s) as ${APPLIED_BY}:"
    failed=""
    for b in "${PENDING[@]}"; do
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

    store_census "" || warn "WARNING: census refresh failed (the migrations DID apply)"
    rep "done — ${#PENDING[@]} applied, 0 pending."
    exit 0
    ;;
esac
