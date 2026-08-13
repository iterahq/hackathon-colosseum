#!/usr/bin/env bash
# ============================================================================
# check-no-invented-ids.sh — a migration may not hard-code a UUID that another
# migration generates at random.
#
# THE DEFECT IT PREVENTS, WHICH IS ALREADY IN THE SERIES
# ------------------------------------------------------
# 0003_itera_seed.sql creates two tenants with `gen_random_uuid()` and no
# explicit id, so their ids differ in every database.
# 0005_tenant_admin_fixture.sql then inserts memberships against two LITERAL
# tenant UUIDs — the ids those rows happen to have in the ITERA production
# database:
#
#   ERROR: insert or update on table "memberships" violates foreign key
#          constraint "memberships_tenant_id_fkey"
#   DETAIL: Key (tenant_id)=(96786037-…) is not present in table "tenants".
#
# The two files contradict each other. Nothing noticed for a year, because the
# only database anybody ran them against was the one where the guess was right.
# It surfaced the moment somebody tried to rebuild the schema from the
# repository — that is, the moment disaster recovery was tested.
#
# So the rule is not "0005 is bad". The rule is: A MIGRATION MUST NOT DEPEND ON
# AN IDENTIFIER THIS SERIES DID NOT PUT THERE. Resolve it — by slug, by a join,
# by anything the migration itself can see — or write the id explicitly on the
# INSERT that creates the row, so every database agrees.
#
# WHAT IT ACTUALLY CHECKS
# -----------------------
# Any UUID literal in a NEW migration, outside comments. That is deliberately
# broader than "tenant ids": every hard-coded id in this series so far has been
# a row somebody looked up in production, and a legitimate one is rare enough to
# be worth a sentence in the file.
#
# ESCAPE HATCH, and why it is a comment rather than a list. A file may declare
# `-- itera:allow-uuid-literal <reason>` on any line. There is no separate
# exceptions file on purpose: the reason belongs next to the UUID, where the
# next reader is already looking, and a list in another file is a place where
# entries accumulate unread.
#
# -- Usage -------------------------------------------------------------------
#   check-no-invented-ids.sh <file>...       check exactly these files
#   check-no-invented-ids.sh --all           check every db/migrations/*.sql
#
# -- Exit codes --------------------------------------------------------------
#   0  clean
#   2  usage error
#   4  a checked file hard-codes a UUID and does not declare why
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG_DIR="${ITERA_MIGRATIONS_DIR:-${ROOT}/migrations}"
UUID_RE='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

FILES=()
case "${1:-}" in
  -h|--help) sed -n '2,50p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
  --all) for f in "$MIG_DIR"/*.sql; do [[ -e "$f" ]] && FILES+=("$f"); done ;;
  "")    echo "nothing to check (pass files, or --all)"; exit 0 ;;
  *)     for a in "$@"; do
           # Accept a repo-relative path or a bare filename.
           if   [[ -f "$a" ]];              then FILES+=("$a")
           elif [[ -f "${MIG_DIR}/${a}" ]]; then FILES+=("${MIG_DIR}/${a}")
           else echo "warning: no such file '${a}' — skipping" >&2
           fi
         done ;;
esac

[[ "${#FILES[@]}" -gt 0 ]] && printf '[uuid-guard] checking %s file(s)\n' "${#FILES[@]}"
bad=0
for f in ${FILES[@]+"${FILES[@]}"}; do
  b="$(basename "$f")"
  if command grep -qE '^[[:space:]]*--[[:space:]]*itera:allow-uuid-literal' "$f"; then
    why="$(command grep -m1 -E '^[[:space:]]*--[[:space:]]*itera:allow-uuid-literal' "$f" \
           | sed 's/.*itera:allow-uuid-literal[[:space:]]*//')"
    printf '[uuid-guard] allowed  %-46s %s\n' "$b" "${why:-(no reason given)}"
    continue
  fi
  # Strip `--` comments before matching, so a UUID quoted in a header note is
  # documentation rather than a dependency.
  hits="$(sed 's/--.*//' "$f" | command grep -nE "$UUID_RE" | head -5)"
  if [[ -n "$hits" ]]; then
    bad=1
    printf '[uuid-guard] REFUSED  %s hard-codes a UUID:\n' "$b"
    printf '%s\n' "$hits" | sed 's/^/               /'
  fi
done

if [[ "$bad" -eq 1 ]]; then
  cat >&2 <<'MSG'

[uuid-guard] A migration must not depend on an identifier this series did not
             put there. 0005_tenant_admin_fixture.sql already does, and it is
             why db/scripts/fresh-apply-exceptions.txt has to skip it: the ids
             it names exist only in production, so the file cannot run anywhere
             else. That is a schema the repository cannot rebuild.

             Resolve the id instead — by slug, by a join, by any lookup the
             migration can do for itself — or write the id explicitly on the
             INSERT that creates the row, so every database agrees.

             If the literal is genuinely right (an id this series itself
             created, in an earlier file), say so in the file:

                 -- itera:allow-uuid-literal <why this id is stable everywhere>
MSG
  exit 4
fi
printf '[uuid-guard] clean.\n'
exit 0
