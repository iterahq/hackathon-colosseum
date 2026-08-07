#!/usr/bin/env bash
# test-check-migration-numbers.sh — prove the numbering guard BLOCKS and ALLOWS.
#
# Same reasoning as test-require-code-owner-merge.sh: a guard that only ever
# refuses gets switched off within a day, and a guard nobody can test is a guard
# nobody can trust. So the ALLOW cases are asserted as hard as the REFUSE cases.
#
# Runs entirely on temp directories — it never reads the real db/migrations, and
# it never touches a database.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD="$HERE/check-migration-numbers.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0; fail=0

# run <name> <expected-exit> <migrations-dir> <exemptions-file>
run() {
  local name="$1" want="$2" dir="$3" exf="$4" out rc
  out="$(MIG_DIR="$dir" EXEMPTIONS_FILE="$exf" bash "$GUARD" 2>&1)"; rc=$?
  if [ "$rc" -eq "$want" ]; then
    printf '  PASS  %s (exit %s)\n' "$name" "$rc"; pass=$((pass + 1))
  else
    printf '  FAIL  %s — expected exit %s, got %s\n' "$name" "$want" "$rc"
    printf '%s\n' "$out" | sed 's/^/        /'
    fail=$((fail + 1))
  fi
}

# grep_out <name> <pattern> <migrations-dir> <exemptions-file>
grep_out() {
  local name="$1" pat="$2" dir="$3" exf="$4" out
  out="$(MIG_DIR="$dir" EXEMPTIONS_FILE="$exf" bash "$GUARD" 2>&1)"
  if printf '%s' "$out" | grep -q "$pat"; then
    printf '  PASS  %s\n' "$name"; pass=$((pass + 1))
  else
    printf '  FAIL  %s — output did not match /%s/\n' "$name" "$pat"
    printf '%s\n' "$out" | sed 's/^/        /'
    fail=$((fail + 1))
  fi
}

mk() { mkdir -p "$1"; shift; for f in "$@"; do : > "$1/$f" 2>/dev/null || true; done; }
mkdir_with() { local d="$TMP/$1"; shift; mkdir -p "$d"; for f in "$@"; do : > "$d/$f"; done; printf '%s' "$d"; }

EMPTY_EX="$TMP/empty-exemptions.txt"; : > "$EMPTY_EX"

echo "check-migration-numbers.sh — self-test"

# 1. ALLOW: a clean, strictly increasing set.
D1="$(mkdir_with clean 0001_a.sql 0002_b.sql 0003_c.sql)"
run "clean set passes" 0 "$D1" "$EMPTY_EX"

# 2. REFUSE: a fresh collision with no exemptions.
D2="$(mkdir_with collide 0001_a.sql 0050_mcp0006_activity_comments.sql 0050_learner_personalization.sql)"
run "unexempted duplicate number fails" 1 "$D2" "$EMPTY_EX"
grep_out "names the colliding number" "Duplicate migration number 0050" "$D2" "$EMPTY_EX"
grep_out "names both colliding files" "0050_learner_personalization.sql" "$D2" "$EMPTY_EX"
grep_out "warns against renaming an applied file" "re-runs it against production" "$D2" "$EMPTY_EX"

# 3. ALLOW: the same collision once EVERY file claiming the number is exempted.
EX3="$TMP/ex3.txt"
cat > "$EX3" <<'EOF'
# reason on the line, as the real file does
0050_mcp0006_activity_comments.sql
0050_learner_personalization.sql
EOF
run "fully exempted duplicate passes" 0 "$D2" "$EX3"

# 4. REFUSE: a PARTIAL exemption must not launder the collision — this is the
#    case that matters, because it is what a hurried "just add it to the list"
#    looks like.
EX4="$TMP/ex4.txt"; printf '0050_mcp0006_activity_comments.sql\n' > "$EX4"
run "partially exempted duplicate still fails" 1 "$D2" "$EX4"

# 5. REFUSE: a THIRD file joining an already-exempted number.
D5="$(mkdir_with three 0050_mcp0006_activity_comments.sql 0050_learner_personalization.sql 0050_something_new.sql)"
run "third file on an exempted number fails" 1 "$D5" "$EX3"

# 6. ALLOW + WARN: an exemption for a file that is not here yet (it is sitting
#    in an open PR). Untidy, not unsafe — must not fail the build.
D6="$(mkdir_with future 0001_a.sql 0002_b.sql)"
run "stale exemption does not fail" 0 "$D6" "$EX3"
grep_out "stale exemption warns" "Stale migration-number exemption" "$D6" "$EX3"

# 7. REFUSE: a filename with no 4-digit prefix — its sort position against
#    numbered files is undefined, which is the same bug wearing a hat.
D7="$(mkdir_with unnumbered 0001_a.sql fixup.sql)"
run "unnumbered migration filename fails" 1 "$D7" "$EMPTY_EX"

# 8. USAGE: an empty directory must not report "all clear". A guard that passes
#    because it read nothing is the failure mode this whole file exists to avoid.
D8="$(mkdir_with nothing)"
run "empty migrations dir is a usage error, not a pass" 2 "$D8" "$EMPTY_EX"

# 9. USAGE: a missing directory.
run "missing migrations dir is a usage error" 2 "$TMP/does-not-exist" "$EMPTY_EX"

# 10. ALLOW: the REAL repo state must pass, with the real exemption file. If this
#     one goes red, main itself is failing the guard and the guard is wrong.
run "the real db/migrations passes with the real exemption list" 0 \
  "$(cd "$HERE/.." && pwd)/migrations" "$HERE/migration-number-exemptions.txt"

echo
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ] || exit 1
