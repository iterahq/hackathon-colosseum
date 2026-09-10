#!/usr/bin/env bash
# Origin: agent. Explicit historical-prefix/current-suffix CI boundary.
# Never used by the production applier. All schema mutation targets are local.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
case "${PGHOST:-}" in localhost|127.0.0.1) ;; *) echo 'Local fixture required' >&2; exit 2;; esac
prefix="${CORE_PREFIX_ROOT:?Set an isolated CORE_PREFIX_ROOT}"
suffix='0099_learning_core_contraction.sql'
[[ -f "$root/db/migrations/$suffix" ]] || { echo 'Required 0099 suffix is missing' >&2; exit 2; }
mode="${1:?Expected prefix, parity, restore or suffix}"
shift
[[ "$prefix" = /* && "$prefix" != "$root" && "$prefix" != / ]] || exit 2
# This boundary is explicit. A future migration must extend the suffix contract,
# not disappear from the test because a directory glob silently skipped it.
for file in "$root"/db/migrations/*.sql; do
 name="$(basename "$file")"
 if [[ "$name" > '0098_zzzz' && "$name" != "$suffix" ]]; then
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
   [[ "$(basename "$file")" == "$suffix" ]] || cp "$file" "$prefix/db/migrations/"
  done
  added=()
  for file in "$@"; do
   for item in $file; do
    [[ "$(basename "$item")" == "$suffix" ]] || added+=(--new "$item")
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
  # The prefix ran twice above. Record exactly those files, leaving 0099 pending.
  for file in "$prefix"/db/migrations/*.sql; do
   name="$(basename "$file")"; sum="$(sha256sum "$file" | cut -d' ' -f1)"
   psql -Xq -v ON_ERROR_STOP=1 -c "insert into itera.schema_migrations(id,repo,filename,checksum,applied_by) values('itera-player:$name','itera-player','$name','$sum','core-prefix:applied-twice') on conflict(id) do nothing;"
  done
  node "$root/db/scripts/test-core-contraction.mjs"
  bash "$root/db/scripts/schema-parity.sh" check
  node "$root/db/scripts/test-learning-census.mjs"
  ;;
 *) echo 'Expected prefix, parity, restore or suffix' >&2; exit 2;;
esac
