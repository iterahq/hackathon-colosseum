#!/usr/bin/env bash
# ============================================================================
# schema-parity.sh — does this repository still build the schema production has?
#
# THE GAP THIS CLOSES
# -------------------
# db/scripts/fresh-apply.sh proves the migrations BUILD. It has never proved
# they build THE SAME THING. Those are different claims, and only the second one
# is disaster recovery.
#
# Measured 2026-08-12 while writing this: the schema built from zero and the
# live ITERA database agree on 875 of 886 catalogue facts and DISAGREE ON 11 —
# ten table privileges and one RLS policy predicate. Every existing check was
# green throughout. `db-drift` could not see it either: it compares production
# against a fingerprint of PRODUCTION taken earlier, so it detects change over
# time and is blind, by construction, to "the repository can no longer rebuild
# this".
#
# -- Commands ----------------------------------------------------------------
#   check        (default) census the connected database, diff against
#                db/census/expected-schema.txt. ANY difference fails.
#                This is the from-zero gate; run it after fresh-apply.sh.
#
#   production   census the connected database, diff against the same expected
#                file, and tolerate ONLY the differences declared in
#                db/census/known-differences.txt. A difference that is not
#                declared fails; a declared difference that has DISAPPEARED
#                fails too, because a stale allowance is a blindfold.
#
#   update       rewrite db/census/expected-schema.txt from the connected
#                database. Use it on a THROWAWAY build after adding a
#                migration, then read the diff — it is the review artefact that
#                says what your migration did to the schema.
#
# -- Connection --------------------------------------------------------------
# Standard PG* environment: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE.
# `check` and `update` REFUSE a host that looks like a real Supabase project —
# they are for throwaway databases. `production` is the one command that expects
# a real one, and it only ever SELECTs.
#
# -- Exit codes --------------------------------------------------------------
#   0  the schemas agree (or, in `production`, differ only as declared)
#   1  could not census the database
#   2  usage / environment error
#   3  DIFFERENCE — see the report
# ============================================================================
set -uo pipefail

# `comm` compares byte order and `sort` obeys the locale. Mixing them is how a
# comparison silently starts skipping lines — comm even says so ("input is not
# in sorted order") and then answers anyway. One collation for the whole script.
export LC_ALL=C

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CENSUS_SQL="${ROOT}/scripts/census.sql"
EXPECTED="${ROOT}/census/expected-schema.txt"
KNOWN="${ROOT}/census/known-differences.txt"

CMD="check"
case "${1:-}" in
  check|production|update) CMD="$1"; shift ;;
  -h|--help) sed -n '2,50p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
  "") ;;
  *) echo "ERROR: unknown command '$1' (see --help)" >&2; exit 2 ;;
esac
# Fixture overrides. Used only by db/scripts/test-schema-parity.sh, which has to
# be able to make this script go red on demand — a check nobody has watched fail
# is not evidence that it can.
while [[ $# -gt 0 ]]; do
  case "$1" in
    --expected) EXPECTED="${2:?}"; shift 2 ;;
    --known)    KNOWN="${2:?}";    shift 2 ;;
    *) echo "ERROR: unknown argument '$1' (see --help)" >&2; exit 2 ;;
  esac
done

say() { printf '[parity] %s\n' "$*"; }
die() { printf '[parity] ERROR: %s\n' "$1" >&2; exit "${2:-2}"; }

# Report lines reach stdout and, when asked, a file — same one-report-three-
# surfaces shape apply-migrations.sh uses.
REPORT_FILE="${REPORT_FILE:-}"
rep() {
  say "$*"
  [[ -n "$REPORT_FILE" ]] && printf '%s\n' "$*" >> "$REPORT_FILE"
  return 0
}

command -v psql >/dev/null 2>&1 || die "psql not found on PATH"
[[ -f "$CENSUS_SQL" ]] || die "no census definition at $CENSUS_SQL"
[[ -n "${PGHOST:-}" ]] || die "PGHOST is unset — refusing to guess the target database"

looks_live=0
case "${PGHOST}" in
  *kjefmwlopzeaqgqtlbdn*|*supabase.com|*supabase.co) looks_live=1 ;;
esac
case "${PGHOST}" in
  *yoojxnggaxcqtsyjdrdx*) die "REFUSED: that is the DFL prod project. Itera never touches it (CLAUDE.md)." ;;
esac
if [[ "$CMD" != "production" && "$looks_live" -eq 1 ]]; then
  die "REFUSED: '${CMD}' is for throwaway databases and PGHOST looks like a real Supabase project."
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
NOW="${TMP}/now.txt"

# The census pins its own search_path (see census.sql); nothing else is set here
# so that both sides are read exactly the same way.
if ! psql -v ON_ERROR_STOP=1 -qtAX -f "$CENSUS_SQL" > "$NOW" 2>"${TMP}/err"; then
  say "could not census the database:"; sed 's/^/    /' "${TMP}/err" >&2
  exit 1
fi
grep -v '^[[:space:]]*$' "$NOW" | LC_ALL=C sort -o "$NOW"
[[ -s "$NOW" ]] || die "the census returned nothing — that is not an empty schema, it is a broken read" 1

if [[ "$CMD" == "update" ]]; then
  mkdir -p "$(dirname "$EXPECTED")"
  cp "$NOW" "$EXPECTED"
  say "wrote $(wc -l < "$EXPECTED" | tr -d ' ') fact(s) to db/census/expected-schema.txt"
  say "READ THE DIFF before committing — it is the review artefact for what your migration changed."
  exit 0
fi

[[ -f "$EXPECTED" ]] || die "no expected census at $EXPECTED (generate one with: $0 update)" 2
LC_ALL=C sort "$EXPECTED" | grep -v '^[[:space:]]*$' > "${TMP}/expected.txt"

# Version gate. Comparing a v2 census against a v1 file would report the whole
# schema as changed, which is a false incident, not a finding.
v_now="$(grep '^#cens ' "$NOW" || true)"
v_exp="$(grep '^#cens ' "${TMP}/expected.txt" || true)"
if [[ "$v_now" != "$v_exp" ]]; then
  rep "CENSUS VERSION MISMATCH — database reports '${v_now:-none}', expected file says '${v_exp:-none}'."
  rep "db/scripts/census.sql changed without db/census/expected-schema.txt being regenerated."
  rep "Fix: $0 update, against a from-zero build."
  exit 3
fi

# `- ` = the database has it and the expected file does not.
# `+ ` = the expected file has it and the database does not.
comm -23 "$NOW" "${TMP}/expected.txt" | sed 's/^/- /'  > "${TMP}/diff.txt"
comm -13 "$NOW" "${TMP}/expected.txt" | sed 's/^/+ /' >> "${TMP}/diff.txt"
LC_ALL=C sort -o "${TMP}/diff.txt" "${TMP}/diff.txt"
n_diff="$(grep -c . "${TMP}/diff.txt" || true)"

if [[ "$CMD" == "check" ]]; then
  if [[ "$n_diff" -eq 0 ]]; then
    rep "OK — the schema built from this repository matches db/census/expected-schema.txt ($(wc -l < "${TMP}/expected.txt" | tr -d ' ') facts)."
    exit 0
  fi
  rep "DIFFERENCE — the schema this build produced is not the one the repository declares."
  rep "  '-' the build has it and the expected file does not; '+' the reverse."
  while IFS= read -r l; do rep "  ${l:0:200}"; done < "${TMP}/diff.txt"
  rep ""
  rep "If your migration changed the schema ON PURPOSE, regenerate the declaration:"
  rep "    db/scripts/schema-parity.sh update    # against the throwaway build"
  rep "and commit db/census/expected-schema.txt. The diff IS the review artefact."
  exit 3
fi

# ── production ──────────────────────────────────────────────────────────────
[[ -f "$KNOWN" ]] || die "no declared-differences file at $KNOWN" 2
grep -E '^[-+] ' "$KNOWN" | LC_ALL=C sort > "${TMP}/known.txt"

undeclared="$(comm -23 "${TMP}/diff.txt" "${TMP}/known.txt")"
vanished="$(comm -13 "${TMP}/diff.txt" "${TMP}/known.txt")"
bad=0

if [[ -n "$undeclared" ]]; then
  bad=1
  rep "UNDECLARED DIFFERENCE — production and this repository disagree in a way nobody wrote down."
  rep "  '-' production has it and the repository does not build it; '+' the reverse."
  while IFS= read -r l; do [[ -n "$l" ]] && rep "  ${l:0:200}"; done <<< "$undeclared"
  rep ""
  rep "A '-' line is DDL that reached production outside db/migrations/, or a"
  rep "migration that was recorded as applied without being run. A '+' line is a"
  rep "migration that merged and never took effect."
fi

if [[ -n "$vanished" ]]; then
  bad=1
  rep "STALE ALLOWANCE — db/census/known-differences.txt declares a difference that no longer exists:"
  while IFS= read -r l; do [[ -n "$l" ]] && rep "  ${l:0:200}"; done <<< "$vanished"
  rep ""
  rep "Somebody resolved it and left the allowance behind. Delete those lines —"
  rep "an exception nobody removes is how the check stops meaning anything."
fi

if [[ "$bad" -eq 0 ]]; then
  rep "OK — production differs from this repository in exactly the $(grep -c . "${TMP}/known.txt" || true) declared census line(s), and nothing else."
  exit 0
fi
exit 3
