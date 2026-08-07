#!/usr/bin/env bash
# ============================================================================
# ci-wait-for-postgres.sh — wait until the service container is REALLY up.
#
# WHY THIS IS NOT JUST THE HEALTHCHECK. The supabase/postgres entrypoint runs
# initdb against a TEMPORARY server on the same socket, then shuts it down and
# starts the real one. `pg_isready` answers YES during that window — measured
# 2026-08-07: ready at t+3s, connection refused at t+4s, real server up at t+5s.
# A job that trusts the first yes fails at its first psql with "server closed
# the connection unexpectedly", which reads like a broken migration and is not.
#
# So: require N CONSECUTIVE successful real queries, not one. Cheap, and it
# removes an entire class of flake from a check whose whole value is that a red
# means something.
# ============================================================================
set -uo pipefail

NEED="${WAIT_CONSECUTIVE:-3}"
DEADLINE=$(( SECONDS + ${WAIT_TIMEOUT:-120} ))
ok=0

while [[ "$SECONDS" -lt "$DEADLINE" ]]; do
  if psql -qtAX -c 'select 1' >/dev/null 2>&1; then
    ok=$((ok + 1))
    if [[ "$ok" -ge "$NEED" ]]; then
      echo "postgres is up: $(psql -qtAX -c 'select version()')"
      exit 0
    fi
  else
    ok=0
  fi
  sleep 1
done

echo "::error::postgres did not become available within ${WAIT_TIMEOUT:-120}s"
exit 1
