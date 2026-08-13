#!/usr/bin/env bash
# ============================================================================
# db/scripts/tx-mode.sh — ONE definition of "how a migration file is run".
# Sourced, not executed.
#
# WHY THIS FILE EXISTS
# --------------------
# Two scripts apply the same series of files, and until now each carried its
# own answer to the same question.
#
#   apply-migrations.sh   read the file and chose a mode: `self`, `none` or
#                         `wrap`, then built a psql session around it.
#   fresh-apply.sh        `psql -f <file>`. Autocommit, always, for every file.
#
# Postgres refuses inside a transaction block things it allows outside one.
# `ALTER TYPE ... ADD VALUE` followed by a use of the new value is the case
# this repository actually hit: 0041_mcp0002 adds the `author` label to
# itera.member_role and then creates a function whose body reads
# `m.role IN ('author', …)`, and `check_function_bodies` resolves that literal
# at CREATE time. Wrapped, it fails:
#
#   ERROR:  unsafe use of new value "author" of enum type member_role
#   HINT:   New enum values must be committed before they can be used.
#
# So the machine that proved a migration was safe was not running it the way
# the machine that applies it runs it. Two engines, one series, and the green
# check was not checking the thing that would run.
#
# This module is the single engine. `tx_mode_of` decides, `tx_apply` applies,
# and both callers use both. db/scripts/test-tx-mode.sh asserts that neither
# caller has grown its own copy again.
#
# THE MODES
# ---------
#   self  the file opens its own `begin;`. No wrapper is added: a nested BEGIN
#         is only a WARNING, but the file's own `commit;` would silently close
#         OUR transaction, so wrapping buys nothing and costs two confusing
#         warnings per file in the log.
#   none  autocommit — statement by statement. Declared by `-- itera:no-
#         transaction` on the first line, for DDL Postgres refuses inside a
#         transaction block.
#   wrap  everything else. BEGIN and COMMIT around the file AND the trailing
#         statement, so "applied" and "recorded as applied" cannot come apart.
#
# TX_FROM_ZERO — THE ONE DELIBERATE DIVERGENCE, NOW IN ONE PLACE
# --------------------------------------------------------------
# Building an EMPTY database, `wrap` collapses to `none`. The wrapper exists to
# keep a file and its ledger row atomic on production; there is no production
# in a from-zero build, the database is empty, and every migration is
# idempotent, so re-running after a failure is safe. It also lets
# 0041_mcp0002 — already applied everywhere real, so not editable without
# breaking its recorded checksum — build a schema from nothing.
#
# The trade is only made on the from-zero path. It used to be made in
# apply-migrations.sh for its own from-zero case and made implicitly, by
# accident, for the whole of fresh-apply.sh. Now one flag states it once, and
# a new migration that is unsafe under `wrap` is still caught, because
# fresh-apply.sh hands the pull request's new files to apply-migrations.sh
# against a SEEDED ledger, where TX_FROM_ZERO is 0.
#
# HONEST CAVEAT for `self` and `none`: a trailing statement lands in its own
# implicit transaction just after the file committed. If the connection dies in
# that gap the file is applied and unrecorded, and the next run re-applies it —
# safe only because every migration is idempotent. That is one of the two
# reasons idempotency is mandatory even with a ledger.
# ============================================================================

# 1 while building an empty database. Set by the caller before tx_apply.
TX_FROM_ZERO="${TX_FROM_ZERO:-0}"

# The psql invocation tx_apply uses. A caller that addresses the database by
# URL rather than by PG* environment sets it — apply-migrations.sh does.
TX_PSQL=(psql -v ON_ERROR_STOP=1 -qX)

# tx_mode_of FILE -> prints none | self | wrap
tx_mode_of() {
  local f="$1" mode
  if head -1 "$f" | command grep -q 'itera:no-transaction'; then
    mode=none
  elif command grep -qiE '^[[:space:]]*begin[[:space:]]*;' "$f"; then
    mode=self
  else
    mode=wrap
  fi
  if [[ "${TX_FROM_ZERO}" -eq 1 && "$mode" == "wrap" ]]; then mode=none; fi
  printf '%s\n' "$mode"
}

# tx_apply FILE [TRAILING_SQL]
# Applies FILE in its mode, in ONE psql session, and returns psql's exit
# status. TRAILING_SQL runs after the file, inside the same transaction when
# the mode is `wrap`.
tx_apply() {
  local f="$1" trailing="${2:-}"
  local mode; mode="$(tx_mode_of "$f")"
  {
    echo "\\set ON_ERROR_STOP on"
    if [[ "$mode" == "wrap" ]]; then echo "begin;"; fi
    printf '\\i %s\n' "$f"
    if [[ -n "$trailing" ]]; then printf '%s\n' "$trailing"; fi
    if [[ "$mode" == "wrap" ]]; then echo "commit;"; fi
    true
  } | "${TX_PSQL[@]}"
}
