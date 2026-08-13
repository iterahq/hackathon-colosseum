#!/usr/bin/env bash
# ============================================================================
# test-schema-parity.sh — prove schema-parity.sh goes RED, and prove it goes
# GREEN, against a real database rather than against a mock of one.
#
# The check it guards is the one that says "this repository still builds the
# schema production has". Nothing else in this repo makes that claim, so a
# silent failure of THIS script would restore the exact blindness it was
# written to remove.
#
# Every case takes the census of a throwaway database that is already built,
# then feeds schema-parity.sh a doctored expectation. Real census, real diff
# logic, no fixtures pretending to be a catalogue.
#
# Needs a throwaway Postgres with the Itera schema ALREADY BUILT — run
# db/scripts/fresh-apply.sh first. PGHOST / PGPORT / PGUSER / PGPASSWORD /
# PGDATABASE.
#
# Exit 0 = every case produced the expected verdict.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARITY="${HERE}/schema-parity.sh"
CENSUS="${HERE}/census.sql"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[[ -n "${PGHOST:-}" ]] || { echo "PGHOST is unset — this selftest needs a throwaway Postgres" >&2; exit 2; }

PASS=0; FAIL=0
run_case() {
  local name="$1" want="$2" needle="$3"; shift 3
  local out rc ok=1
  out="$("$PARITY" "$@" 2>&1)"; rc=$?
  [[ "$rc" -eq "$want" ]] || ok=0
  [[ -z "$needle" ]] || printf '%s' "$out" | command grep -qF "$needle" || ok=0
  if [[ "$ok" -eq 1 ]]; then
    printf '  ok    %-58s exit %s\n' "$name" "$rc"; PASS=$((PASS + 1))
  else
    printf '  FAIL  %-58s exit %s, wanted %s\n' "$name" "$rc" "$want"
    [[ -n "$needle" ]] && printf '        expected to see: %s\n' "$needle"
    printf '%s\n' "$out" | sed 's/^/          /' | head -14
    FAIL=$((FAIL + 1))
  fi
}

echo "schema-parity.sh self-test"

# The truth, straight from the database under test.
psql -v ON_ERROR_STOP=1 -qtAX -f "$CENSUS" 2>/dev/null | grep -v '^[[:space:]]*$' \
  | LC_ALL=C sort > "${TMP}/truth.txt"
[[ -s "${TMP}/truth.txt" ]] || { echo "could not census the database — is the schema built?" >&2; exit 2; }
: > "${TMP}/empty.txt"

# ── GREEN. Watched first, on purpose: a check that only ever refuses gets
#    switched off, and one whose green nobody has seen proves nothing.
run_case "an identical schema passes" 0 "OK —" \
  check --expected "${TMP}/truth.txt"

# ── RED: something in the database that the declaration does not have. ──────
# This is the shape of "a migration added an object and nobody regenerated the
# declaration", and also of "DDL arrived out of band".
command grep -v '^type  itera.progress_status' "${TMP}/truth.txt" > "${TMP}/missing-a-line.txt"
run_case "an undeclared object fails" 3 "type  itera.progress_status" \
  check --expected "${TMP}/missing-a-line.txt"

# ── RED: the declaration has something the database does not. ──────────────
# The shape of "a migration merged and never took effect".
{ cat "${TMP}/truth.txt"; echo "rel   itera.ghost_table r rls=t force=f"; } \
  | LC_ALL=C sort > "${TMP}/extra-line.txt"
run_case "a declared object that is absent fails" 3 "itera.ghost_table" \
  check --expected "${TMP}/extra-line.txt"

# ── RED: the census DEFINITION moved without the declaration. ──────────────
# Otherwise editing census.sql reports the whole schema as drifted, which is a
# false incident loud enough that the next real one gets ignored.
sed 's/^#cens version=.*/#cens version=999/' "${TMP}/truth.txt" \
  | LC_ALL=C sort > "${TMP}/wrong-version.txt"
run_case "a census version mismatch fails" 3 "CENSUS VERSION MISMATCH" \
  check --expected "${TMP}/wrong-version.txt"

# ── production: a DECLARED difference is tolerated. ────────────────────────
printf -- '- %s\n' "$(command grep '^type  itera.progress_status' "${TMP}/truth.txt")" \
  > "${TMP}/known-ok.txt"
run_case "production tolerates a declared difference" 0 "declared census line" \
  production --expected "${TMP}/missing-a-line.txt" --known "${TMP}/known-ok.txt"

# ── production: an UNDECLARED difference is not. ───────────────────────────
run_case "production refuses an undeclared difference" 3 "UNDECLARED DIFFERENCE" \
  production --expected "${TMP}/missing-a-line.txt" --known "${TMP}/empty.txt"

# ── production: an allowance for a difference that no longer exists. ───────
# The case that keeps the list honest. Without it, every resolved entry stays
# forever and the file stops meaning anything.
printf -- '- rel   itera.long_gone r rls=t force=f\n' > "${TMP}/known-stale.txt"
run_case "production refuses a stale allowance" 3 "STALE ALLOWANCE" \
  production --expected "${TMP}/truth.txt" --known "${TMP}/known-stale.txt"

# NOTE: this selftest deliberately does NOT re-assert the committed
# declaration against the live build. `fresh-apply.sh --parity` already does
# that, and it does it in the only place where the answer is well defined —
# after the FIRST pass, where every file has run exactly once. By the time this
# selftest runs the second pass has been through, and 0002's
# `grant select on all tables` has widened `anon` (see D1 in
# db/census/known-differences.txt). Asserting it here would encode that
# accident as the expectation.

echo
echo "passed ${PASS}, failed ${FAIL}"
[[ "$FAIL" -eq 0 ]] || exit 1
