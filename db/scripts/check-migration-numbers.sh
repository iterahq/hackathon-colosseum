#!/usr/bin/env bash
# check-migration-numbers.sh — refuse two migrations that claim the same number.
#
# WHY THIS EXISTS
# ---------------
# `itera.schema_migrations` is keyed by FILENAME, not by number, and that is
# deliberate (see db/migrations/.baseline: "two different migrations claimed the
# same number, which is one of the reasons this ledger is keyed by filename").
# So a duplicate number does not corrupt the ledger and does not break an apply.
#
# What it DOES break is the one thing the number is for: **order**. Files are
# applied in `LC_ALL=C sort` order of the filename, so when 0050_a.sql and
# 0050_b.sql both exist, which one runs first is decided by the DESCRIPTION
# text — alphabetically, by a word chosen for readability. If one depends on the
# other, that is a coin flip nobody wrote down.
#
# It is not hypothetical here. On 2026-08-07 `0050` was claimed by two OPEN PRs
# at once (#282's `0050_mcp0006_activity_comments.sql` and #286's
# `0050_learner_personalization.sql`), and `0041` by a merged file plus an
# unmerged one. Nothing in CI said a word, because nothing was looking.
#
# THE RULE, AND WHY IT IS SHAPED LIKE THIS
# ----------------------------------------
# Two files may not share a 4-digit prefix — UNLESS every file sharing that
# prefix is named in `db/scripts/migration-number-exemptions.txt`. A blanket
# "warn only" would be ignored; a blanket "never duplicate" would retroactively
# fail `main`, which already carries two legitimate historical pairs that CANNOT
# be renamed:
#
#   * a rename makes an APPLIED migration look UNAPPLIED. The ledger records the
#     old filename; the new filename has no row, so `classify()` files it under
#     PENDING and the next `db-apply` RE-RUNS it against production. For a file
#     with a DROP or a non-fixpoint backfill that is a live incident.
#
# So the exemption list is the honest encoding of "these collisions are frozen
# because unfreezing them is more dangerous than the collision". Every entry
# carries a reason. New collisions are refused; old ones are documented.
#
# Exemptions naming a file that does not exist are a WARNING, not a failure: an
# entry may legitimately land before the file it covers (an exemption for a file
# that is still sitting in an open PR), and a stale entry is untidy, not unsafe.
#
# Env:
#   MIG_DIR         migrations directory   (default: <repo>/db/migrations)
#   EXEMPTIONS_FILE exemption list         (default: <this dir>/migration-number-exemptions.txt)
#
# Exit 0 = no unexempted collision.  Exit 1 = collision.  Exit 2 = usage error.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="${MIG_DIR:-$(cd "$HERE/.." && pwd)/migrations}"
EXEMPTIONS_FILE="${EXEMPTIONS_FILE:-$HERE/migration-number-exemptions.txt}"

[ -d "$MIG_DIR" ] || { echo "ERROR: no such directory: $MIG_DIR" >&2; exit 2; }

# -- load exemptions ----------------------------------------------------------
# One filename per line; `#` starts a comment (a reason belongs on the line).
declare -A EXEMPT=()
if [ -f "$EXEMPTIONS_FILE" ]; then
  while IFS= read -r line; do
    line="${line%%#*}"
    # shellcheck disable=SC2001
    line="$(printf '%s' "$line" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [ -n "$line" ] || continue
    EXEMPT["$line"]=1
  done < "$EXEMPTIONS_FILE"
fi

# -- gather files by number ---------------------------------------------------
declare -A BYNUM=()
declare -A SEEN=()
found=0
while IFS= read -r f; do
  b="$(basename "$f")"
  case "$b" in
    [0-9][0-9][0-9][0-9]_*.sql) ;;
    *)
      echo "::error title=Bad migration filename::'$b' does not match NNNN_description.sql. The 4-digit prefix is how apply order is decided; a file without one sorts unpredictably against every file that has one."
      exit 1
      ;;
  esac
  num="${b:0:4}"
  SEEN["$b"]=1
  BYNUM["$num"]="${BYNUM[$num]:-}${BYNUM[$num]:+ }$b"
  found=$((found + 1))
done < <(find "$MIG_DIR" -maxdepth 1 -name '*.sql' | LC_ALL=C sort)

if [ "$found" -eq 0 ]; then
  echo "ERROR: no *.sql files found in $MIG_DIR — refusing to report 'all clear' on an empty read." >&2
  exit 2
fi

# -- stale exemptions are noise, not danger -----------------------------------
for e in "${!EXEMPT[@]}"; do
  [ -n "${SEEN[$e]:-}" ] || echo "::warning title=Stale migration-number exemption::'$e' is exempted but no such file exists in ${MIG_DIR#"$PWD/"}. Harmless — but if the PR that adds it was abandoned, drop the line."
done

# -- verdict ------------------------------------------------------------------
bad=0
for num in $(printf '%s\n' "${!BYNUM[@]}" | LC_ALL=C sort); do
  # shellcheck disable=SC2206
  files=(${BYNUM[$num]})
  [ "${#files[@]}" -gt 1 ] || continue

  unexempt=()
  for b in "${files[@]}"; do
    [ -n "${EXEMPT[$b]:-}" ] || unexempt+=("$b")
  done

  if [ "${#unexempt[@]}" -eq 0 ]; then
    echo "ok   $num — ${#files[@]} files, all exempted: ${files[*]}"
    continue
  fi

  bad=1
  echo "::error title=Duplicate migration number $num::Migration number $num is claimed by ${#files[@]} files: ${files[*]}. Apply order between them is decided by the DESCRIPTION text sorting alphabetically, which is not a decision anyone made. Renumber the file that is NOT yet applied to the database — take the next free number after the highest on main. Do NOT renumber a file already recorded in itera.schema_migrations: the ledger is keyed by filename, so a rename makes it look unapplied and the next db-apply re-runs it against production. If a collision genuinely cannot be undone, add every file sharing $num to db/scripts/migration-number-exemptions.txt with a reason."
  for b in "${unexempt[@]}"; do echo "     not exempted: $b"; done
done

if [ "$bad" -eq 0 ]; then
  echo "no duplicate migration numbers across $found file(s)."
  exit 0
fi
exit 1
