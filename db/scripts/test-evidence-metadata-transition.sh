#!/usr/bin/env bash
# Origin: agent. Isolated historical prefix plus populated native bridge suffix.
# First test reversible census mutations on the job's full-main local fixture.
# The historical metadata transition then uses its own isolated local database.
# Both phases reject production targets before any catalog mutation.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# This existing workflow step runs after setup-node. Keep it before PGHOST/PGPORT
# are replaced below, so the census proof covers the job's complete main schema.
node "$root/db/scripts/test-learning-census.mjs"
scratch="$(mktemp -d)"
container="itera-metadata-prefix-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$scratch"; }
trap cleanup EXIT
mkdir -p "$scratch/db/migrations"
cp -a "$root/db/scripts" "$root/db/census" "$scratch/db/"
# The historical prefix has generated metadata; final main has the native bridge.
# Both expectations use the same canonical census, without excluded facts.
cp "$root/db/census/expected-metadata-prefix-schema.txt" "$scratch/db/census/expected-schema.txt"
for file in "$root"/db/migrations/*.sql; do
  name="$(basename "$file")"
  if [[ "$name" < '0094_' ]]; then cp "$file" "$scratch/db/migrations/"; fi
done
docker run -d --name "$container" -e POSTGRES_PASSWORD=local_metadata_fixture \
  -p 127.0.0.1::5432 supabase/postgres:17.6.1.160 >/dev/null
export PGHOST=127.0.0.1 PGUSER=supabase_admin PGDATABASE=postgres PGPASSWORD=local_metadata_fixture
PGPORT="$(docker port "$container" 5432/tcp | sed 's/.*://')"; export PGPORT
for attempt in $(seq 1 60); do
  if pg_isready -q; then break; fi
  if [[ "$attempt" == 60 ]]; then echo 'Local prefix database did not start' >&2; exit 1; fi
  sleep 1
done
export ITERA_DB_URL="postgresql://supabase_admin@127.0.0.1:${PGPORT}/postgres"
bash "$scratch/db/scripts/fresh-apply.sh" --parity --new 0093_learning_evidence_metadata_expand.sql
node "$root/db/scripts/test-evidence-metadata-expand.mjs"
node "$root/db/scripts/test-evidence-metadata-bridge.mjs"
node "$root/db/scripts/test-native-evidence-consumers.mjs"
# The fixture creates real 0088 manifests on the populated 0095 prefix before
# applying 0097. The independent main job still checks the complete series.
node "$root/db/scripts/test-a2-native-projection.mjs"
