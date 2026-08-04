#!/usr/bin/env bash
# test-require-code-owner-merge.sh — prove the migration gate BOTH refuses and
# allows. No network: `gh` is stubbed from fixture JSON on PATH.
#
# The point of the "allows" cases is not symmetry. A guard that refuses
# everything gets disabled within a day, and one shipped in this fleet on
# 2026-08-04 that refused every PR with an empty reason was caught only by a
# live dry run. So the not-blocked verdicts are asserted as carefully as the
# blocked ones.
#
# Run: bash db/scripts/test-require-code-owner-merge.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUT="$HERE/require-code-owner-merge.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"

# ── `gh` stub ────────────────────────────────────────────────────────────────
# Serves $TMP/files.json and $TMP/reviews.json through the same `--jq` filters
# the real gh would apply. `FAIL_API=1` makes it exit non-zero, to check that an
# unreadable API fails CLOSED.
cat > "$TMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
if [ "${FAIL_API:-0}" = "1" ]; then
  echo "gh: simulated API failure" >&2
  exit 1
fi
url=""; jqf=""
while [ $# -gt 0 ]; do
  case "$1" in
    api) shift ;;
    --paginate) shift ;;
    --jq) jqf="$2"; shift 2 ;;
    *) url="$1"; shift ;;
  esac
done
case "$url" in
  */files)   src="$FIXTURE_DIR/files.json" ;;
  */reviews) src="$FIXTURE_DIR/reviews.json" ;;
  *) echo "stub: unexpected url $url" >&2; exit 1 ;;
esac
jq -r "$jqf" < "$src"
STUB
chmod +x "$TMP/bin/gh"
export PATH="$TMP/bin:$PATH"
export FIXTURE_DIR="$TMP"

pass=0; fail=0
run_case() { # name  expected_exit  files_json  reviews_json  author  [FAIL_API]
  local name="$1" want="$2" author="$5" out rc
  printf '%s' "$3" > "$TMP/files.json"
  printf '%s' "$4" > "$TMP/reviews.json"
  out="$(FAIL_API="${6:-0}" REPO=iterahq/itera-player PR=999 AUTHOR="$author" \
         CODE_OWNERS=taigfs GH_TOKEN=stub bash "$SUT" 2>&1)"; rc=$?
  if [ "$rc" = "$want" ]; then
    echo "ok   - $name (exit $rc)"; pass=$((pass+1))
  else
    echo "FAIL - $name : expected exit $want got $rc"
    printf '%s\n' "$out" | sed 's/^/       /'
    fail=$((fail+1))
  fi
  LAST_OUT="$out"
}

F_UI='[{"filename":"src/App.tsx"},{"filename":"db/README.md"},{"filename":"db/scripts/apply-migrations.sh"}]'
F_MIG='[{"filename":"src/App.tsx"},{"filename":"db/migrations/0041_new.sql"}]'
R_NONE='[]'
R_OWNER_APPROVED='[{"user":{"login":"taigfs"},"state":"APPROVED"}]'
R_OTHER_APPROVED='[{"user":{"login":"SamuelStefano"},"state":"APPROVED"}]'
R_APPROVED_THEN_DISMISSED='[{"user":{"login":"taigfs"},"state":"APPROVED"},{"user":{"login":"taigfs"},"state":"DISMISSED"}]'
R_APPROVED_THEN_CHANGES='[{"user":{"login":"taigfs"},"state":"APPROVED"},{"user":{"login":"taigfs"},"state":"CHANGES_REQUESTED"}]'
R_CHANGES_THEN_APPROVED='[{"user":{"login":"taigfs"},"state":"CHANGES_REQUESTED"},{"user":{"login":"taigfs"},"state":"APPROVED"}]'
R_CASE_DIFF='[{"user":{"login":"TaiGFS"},"state":"APPROVED"}]'

echo "── BLOCKED verdicts ──"
run_case "migration + no reviews at all"          1 "$F_MIG" "$R_NONE"                    SamuelStefano
grep -q 'ITERA production database' <<<"$LAST_OUT" \
  && { echo "ok   -   refusal names the database and the reason"; pass=$((pass+1)); } \
  || { echo "FAIL -   refusal message is empty or generic"; fail=$((fail+1)); }
grep -q 'safe-admin-merge refuses this path' <<<"$LAST_OUT" \
  && { echo "ok   -   refusal names who/what actually enforces"; pass=$((pass+1)); } \
  || { echo "FAIL -   refusal does not say what enforces"; fail=$((fail+1)); }

run_case "migration + approval by a NON-owner"    1 "$F_MIG" "$R_OTHER_APPROVED"          SamuelStefano
run_case "migration + owner approval DISMISSED"   1 "$F_MIG" "$R_APPROVED_THEN_DISMISSED" SamuelStefano
run_case "migration + owner later req'd changes"  1 "$F_MIG" "$R_APPROVED_THEN_CHANGES"   SamuelStefano
run_case "API unreadable → fail CLOSED"           1 "$F_MIG" "$R_NONE"                    SamuelStefano 1

echo "── ALLOWED verdicts (the ones a block-everything bug gets wrong) ──"
run_case "UI-only PR — gate not applicable"       0 "$F_UI"  "$R_NONE"                    SamuelStefano
grep -q 'does not apply' <<<"$LAST_OUT" \
  && { echo "ok   -   says the gate is not applicable"; pass=$((pass+1)); } \
  || { echo "FAIL -   unclear pass reason"; fail=$((fail+1)); }

run_case "db/README.md is NOT db/migrations/**"   0 '[{"filename":"db/README.md"}]' "$R_NONE" SamuelStefano
run_case "db/scripts/ is NOT db/migrations/**"    0 '[{"filename":"db/scripts/apply-migrations.sh"}]' "$R_NONE" SamuelStefano
run_case "migration + owner APPROVED"             0 "$F_MIG" "$R_OWNER_APPROVED"          SamuelStefano
run_case "migration + changes-then-APPROVED"      0 "$F_MIG" "$R_CHANGES_THEN_APPROVED"   SamuelStefano
run_case "migration + owner login case differs"   0 "$F_MIG" "$R_CASE_DIFF"               SamuelStefano
run_case "migration authored BY the code owner"   0 "$F_MIG" "$R_NONE"                    taigfs
grep -q 'satisfied by authorship' <<<"$LAST_OUT" \
  && { echo "ok   -   self-approval carve-out is explicit"; pass=$((pass+1)); } \
  || { echo "FAIL -   authorship carve-out not reported"; fail=$((fail+1)); }

echo "── CODEOWNERS stays in sync ──"
CO="$HERE/../../.github/CODEOWNERS"
if grep -qE '^/db/migrations/ +@taigfs' "$CO" 2>/dev/null; then
  echo "ok   - .github/CODEOWNERS owns /db/migrations/ with the same login"; pass=$((pass+1))
else
  echo "FAIL - .github/CODEOWNERS lost its /db/migrations/ @taigfs entry"; fail=$((fail+1))
fi

echo "----"
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
