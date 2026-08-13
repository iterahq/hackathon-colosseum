#!/usr/bin/env bash
# ============================================================================
# test-tx-mode.sh — the two migration runners must stay ONE runner.
#
# db/scripts/apply-migrations.sh and db/scripts/fresh-apply.sh apply the same
# series of files. Until 2026-08-13 each carried its own answer to "does this
# file go inside a transaction?", and the answers differed: the applier wrapped
# 55 of the 66 files in BEGIN/COMMIT, the checker ran every file in autocommit.
# The consequence was not theoretical — 0041_mcp0002 adds an enum label and
# then creates a function whose body uses it, which Postgres refuses inside a
# transaction block and allows outside one. The green check was not checking
# the thing that would run.
#
# The repair was to put the logic in db/scripts/tx-mode.sh and have both
# scripts use it. A repair like that decays silently: the next person in a
# hurry re-inlines four lines of `grep` and nothing goes red. So this file
# asserts BOTH halves.
#
#   STRUCTURAL — neither caller may detect a transaction mode on its own.
#                This is the test that fails if they diverge again.
#   BEHAVIOURAL — the modes actually do what they claim, against a real
#                Postgres, including the case that started it.
#
# The behavioural half needs the same throwaway Postgres as fresh-apply.sh
# (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE). It confines itself to one
# schema of its own. The structural half needs nothing and always runs.
#
# Exit 0 = every case produced the expected verdict.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0; FAIL=0

ok()   { printf '  ok    %s\n' "$1"; PASS=$((PASS + 1)); }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL + 1)); }
want() { # want <name> <expected> <actual>
  if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 — got '$3', wanted '$2'"; fi
}

echo "tx-mode.sh self-test"

# ── STRUCTURAL ──────────────────────────────────────────────────────────────
# The marker and the `begin;` probe are the two halves of the decision. If
# either appears in a caller outside a comment, that caller has its own copy
# again and the two runners can drift apart without anything failing.
echo "  ── structural: one implementation, not two ──"
for caller in apply-migrations.sh fresh-apply.sh; do
  f="${HERE}/${caller}"
  [[ -f "$f" ]] || { bad "${caller} is missing"; continue; }

  # `grep -v '^[[:space:]]*#'` drops comment lines; the headers of both scripts
  # legitimately DISCUSS the marker at length.
  code="$(grep -v '^[[:space:]]*#' "$f")"

  if printf '%s' "$code" | grep -q "itera:no-transaction"; then
    bad "${caller} detects 'itera:no-transaction' itself — use tx_mode_of"
  else
    ok "${caller} does not detect 'itera:no-transaction' itself"
  fi

  if printf '%s' "$code" | grep -qE "grep -qiE .\^\[\[:space:\]\]\*begin"; then
    bad "${caller} probes for its own 'begin;' — use tx_mode_of"
  else
    ok "${caller} does not probe for 'begin;' itself"
  fi

  if grep -q 'scripts/tx-mode.sh' "$f"; then
    ok "${caller} sources db/scripts/tx-mode.sh"
  else
    bad "${caller} does not source db/scripts/tx-mode.sh"
  fi
done

# ── UNIT: the decision ──────────────────────────────────────────────────────
echo "  ── unit: tx_mode_of ──"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

printf -- '-- itera:no-transaction\ncreate table if not exists t (i int);\n' > "$TMP/none.sql"
printf -- 'begin;\ncreate table if not exists t (i int);\ncommit;\n'          > "$TMP/self.sql"
printf -- 'create table if not exists t (i int);\n'                          > "$TMP/wrap.sql"
# The marker only counts on the FIRST line — a file that merely mentions it in
# a comment further down must still be wrapped.
printf -- 'create table if not exists t (i int);\n-- itera:no-transaction\n'  > "$TMP/late.sql"

# shellcheck source=db/scripts/tx-mode.sh
. "${HERE}/tx-mode.sh"

TX_FROM_ZERO=0
want "a first-line marker means none"          none "$(tx_mode_of "$TMP/none.sql")"
want "an own 'begin;' means self"              self "$(tx_mode_of "$TMP/self.sql")"
want "everything else means wrap"              wrap "$(tx_mode_of "$TMP/wrap.sql")"
want "the marker counts only on line 1"        wrap "$(tx_mode_of "$TMP/late.sql")"

TX_FROM_ZERO=1
want "from zero, wrap collapses to none"       none "$(tx_mode_of "$TMP/wrap.sql")"
want "from zero, self is still self"           self "$(tx_mode_of "$TMP/self.sql")"
want "from zero, none is still none"           none "$(tx_mode_of "$TMP/none.sql")"
TX_FROM_ZERO=0

# ── BEHAVIOURAL ─────────────────────────────────────────────────────────────
# Needs a database. Skipped rather than failed when there is none, so the
# structural half still runs in a context without Postgres.
if [[ -z "${PGHOST:-}" ]] || ! psql -qtAX -c 'select 1' >/dev/null 2>&1; then
  echo "  ── behavioural: SKIPPED, no reachable Postgres (PGHOST unset or down) ──"
else
  echo "  ── behavioural: the modes do what they say ──"
  S="tx_mode_selftest"
  psql -qX -c "drop schema if exists ${S} cascade; create schema ${S};" >/dev/null 2>&1

  # The real case. An enum label added and then used by a function body, which
  # check_function_bodies resolves at CREATE time.
  cat > "$TMP/enum.sql" <<SQL
do \$\$ begin create type ${S}.kind_t as enum ('a'); exception when duplicate_object then null; end \$\$;
alter type ${S}.kind_t add value if not exists 'b';
create or replace function ${S}.is_b(k ${S}.kind_t) returns boolean
  language sql immutable as \$fn\$ select k = 'b'::${S}.kind_t \$fn\$;
SQL

  TX_FROM_ZERO=0
  out="$(tx_apply "$TMP/enum.sql" "" 2>&1)"; rc=$?
  if [[ "$rc" -ne 0 ]] && printf '%s' "$out" | grep -qi 'unsafe use of new value'; then
    ok "wrap refuses an enum label used in the same transaction"
  else
    bad "wrap accepted an enum label used in the same transaction (exit $rc)"
  fi

  # Same file, same database, autocommit. This is the pair that proves the
  # divergence was about the transaction mode and not about the SQL.
  psql -qX -c "drop schema if exists ${S} cascade; create schema ${S};" >/dev/null 2>&1
  TX_FROM_ZERO=1
  out="$(tx_apply "$TMP/enum.sql" "" 2>&1)"; rc=$?
  want "from zero, the same file applies" 0 "$rc"
  [[ "$rc" -eq 0 ]] || printf '%s\n' "$out" | sed 's/^/          /'

  # The trailing statement is what carries the ledger row. It must run.
  psql -qX -c "drop schema if exists ${S} cascade; create schema ${S};" >/dev/null 2>&1
  TX_FROM_ZERO=0
  printf 'create table if not exists %s.thing (i int primary key);\n' "$S" > "$TMP/t.sql"
  tx_apply "$TMP/t.sql" "insert into ${S}.thing (i) values (1) on conflict do nothing;" >/dev/null 2>&1
  n="$(psql -qtAX -c "select count(*) from ${S}.thing" 2>/dev/null | tr -d ' ')"
  want "the trailing statement runs in wrap mode" 1 "$n"

  # And a failing file must take its trailing statement down with it, or
  # "applied" and "recorded as applied" come apart on production.
  psql -qX -c "drop schema if exists ${S} cascade; create schema ${S};" >/dev/null 2>&1
  printf 'create table %s.thing (i int primary key);\ncreate tabel %s.oops (i int);\n' "$S" "$S" > "$TMP/bad.sql"
  tx_apply "$TMP/bad.sql" "create table ${S}.ledger_row (i int);" >/dev/null 2>&1
  n="$(psql -qtAX -c "select count(*) from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='${S}' and c.relname in ('thing','ledger_row')" 2>/dev/null | tr -d ' ')"
  want "a failing file rolls back its trailing statement too" 0 "$n"

  psql -qX -c "drop schema if exists ${S} cascade;" >/dev/null 2>&1
fi

echo
echo "passed ${PASS}, failed ${FAIL}"
[[ "$FAIL" -eq 0 ]] || exit 1
