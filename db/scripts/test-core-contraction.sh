#!/usr/bin/env bash
# Origin: agent. Explicit historical-prefix/current-suffix CI boundary.
# Never used by the production applier. All schema mutation targets are local.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
case "${PGHOST:-}" in localhost|127.0.0.1) ;; *) echo 'Local fixture required' >&2; exit 2;; esac
prefix="${CORE_PREFIX_ROOT:?Set an isolated CORE_PREFIX_ROOT}"
suffixes=(
 '0099_learning_core_contraction.sql'
 '0100_learning_capability_graph_endpoints.sql'
 '0101_mcp_tool_calls.sql'
 '0102_catalog_program_outline.sql'
 '0104_activity_kind_behaviour_kinds.sql'
 '0107_activity_kind_scene_kinds.sql'
 '0108_activity_kind_scene_mechanics.sql'
 '0109_activity_kind_system_kinds.sql'
)
for suffix in "${suffixes[@]}"; do
 [[ -f "$root/db/migrations/$suffix" ]] || { echo "Required suffix is missing: $suffix" >&2; exit 2; }
done
is_suffix() {
 local candidate="$1" suffix
 for suffix in "${suffixes[@]}"; do [[ "$candidate" == "$suffix" ]] && return 0; done
 return 1
}
mode="${1:?Expected prefix, parity, restore or suffix}"
shift
[[ "$prefix" = /* && "$prefix" != "$root" && "$prefix" != / ]] || exit 2
# This boundary is explicit. A future migration must extend the suffix contract,
# not disappear from the test because a directory glob silently skipped it.
for file in "$root"/db/migrations/*.sql; do
 name="$(basename "$file")"
 if [[ "$name" > '0098_zzzz' ]] && ! is_suffix "$name"; then
  echo "Unaccounted migration at the contraction boundary: $name" >&2; exit 2
 fi
done
case "$mode" in
 prefix)
  [[ ! -e "$prefix" ]] || { echo 'Prefix directory already exists' >&2; exit 2; }
  mkdir -p "$prefix/db/migrations"
  cp -a "$root/db/scripts" "$root/db/census" "$prefix/db/"
  cp "$root/db/census/expected-core-prefix-schema.txt" "$prefix/db/census/expected-schema.txt"
  for file in "$root"/db/migrations/*.sql; do
   is_suffix "$(basename "$file")" || cp "$file" "$prefix/db/migrations/"
  done
  added=()
  for file in "$@"; do
   for item in $file; do
    is_suffix "$(basename "$item")" || added+=(--new "$item")
   done
  done
  bash "$prefix/db/scripts/fresh-apply.sh" --parity "${added[@]}"
  ;;
 parity)
  bash "$prefix/db/scripts/test-schema-parity.sh"
  ;;
 restore)
  # Historical suites intentionally exercise old SQL definitions. Restore the
  # declared schema in its canonical order before the populated contraction.
  # The caller hashes every populated learning row before/after this operation.
  [[ -f "$prefix/db/census/expected-schema.txt" ]] || exit 2
  cmp "$root/db/scripts/tx-mode.sh" "$prefix/db/scripts/tx-mode.sh"
  for file in "$prefix"/db/migrations/*.sql; do
   cmp "$file" "$root/db/migrations/$(basename "$file")"
  done
  source "$root/db/scripts/tx-mode.sh"
  TX_PSQL=(psql -Xq -v ON_ERROR_STOP=1)
  TX_FROM_ZERO=1
  while IFS= read -r name; do
   tx_apply "$prefix/db/migrations/$name" ""
  done < <(bash "$prefix/db/scripts/fresh-apply.sh" --print-order)
  bash "$root/db/scripts/schema-parity.sh" check --expected "$root/db/census/expected-core-prefix-schema.txt"
  ;;
 suffix)
  [[ -f "$prefix/db/census/expected-schema.txt" ]] || exit 2
  export ITERA_DB_URL="postgresql://${PGUSER:?}@${PGHOST}:${PGPORT:?}/${PGDATABASE:?}"
  export APPLIED_BY="ci-core-contraction:${GITHUB_RUN_ID:-local}"
  bash "$root/db/scripts/apply-migrations.sh" status >/dev/null
  # The prefix ran twice above. Record exactly those files, leaving both
  # contracted suffix migrations pending.
  for file in "$prefix"/db/migrations/*.sql; do
   name="$(basename "$file")"; sum="$(sha256sum "$file" | cut -d' ' -f1)"
   psql -Xq -v ON_ERROR_STOP=1 -c "insert into itera.schema_migrations(id,repo,filename,checksum,applied_by) values('itera-player:$name','itera-player','$name','$sum','core-prefix:applied-twice') on conflict(id) do nothing;"
  done
  # Keep the populated 0099 preservation test standalone. Its real applier sees
  # the complete historical prefix plus 0099, while 0100 stays unavailable.
  core_suffix_dir="$prefix/core-suffix-migrations"
  mkdir "$core_suffix_dir"
  cp "$prefix"/db/migrations/*.sql "$core_suffix_dir/"
  cp "$root/db/migrations/0099_learning_core_contraction.sql" "$core_suffix_dir/"
  ITERA_MIGRATIONS_DIR="$core_suffix_dir" \
    node "$root/db/scripts/test-core-contraction.mjs"

  # The normal migration directory now has 0100 through 0109 pending in the
  # ledger. Apply them through the real applier before their fixtures run.
  graph_log="$(bash "$root/db/scripts/apply-migrations.sh" apply)"
  [[ "$graph_log" == *'0100_learning_capability_graph_endpoints.sql'* ]] \
    || { echo 'The real applier did not execute 0100' >&2; exit 1; }
  [[ "$graph_log" == *'0101_mcp_tool_calls.sql'* ]] \
    || { echo 'The real applier did not execute 0101' >&2; exit 1; }
  [[ "$graph_log" == *'0102_catalog_program_outline.sql'* ]] \
    || { echo 'The real applier did not execute 0102' >&2; exit 1; }
  [[ "$graph_log" == *'0104_activity_kind_behaviour_kinds.sql'* ]] \
    || { echo 'The real applier did not execute 0104' >&2; exit 1; }
  [[ "$graph_log" == *'0107_activity_kind_scene_kinds.sql'* ]] \
    || { echo 'The real applier did not execute 0107' >&2; exit 1; }
  [[ "$graph_log" == *'0108_activity_kind_scene_mechanics.sql'* ]] \
    || { echo 'The real applier did not execute 0108' >&2; exit 1; }
  [[ "$graph_log" == *'0109_activity_kind_system_kinds.sql'* ]] \
    || { echo 'The real applier did not execute 0109' >&2; exit 1; }
  python3 "$root/db/scripts/test-learning-graph-transition.py"
  bash "$root/db/scripts/test-rls-mcp-tool-calls.sh"
  bash "$root/db/scripts/schema-parity.sh" check
  node "$root/db/scripts/test-learning-census.mjs"
  ;;
 *) echo 'Expected prefix, parity, restore or suffix' >&2; exit 2;;
esac
