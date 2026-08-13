#!/usr/bin/env bash
# =============================================================================
# down.sh — destroy the stack, including its data.
#
# `-v` is not optional here. Without it the Postgres volume survives, the next
# `up.sh` finds a database that is not empty, and `fresh-apply.sh` refuses
# it — turning "build the schema from zero" into "build it from whatever the
# last run left", which is exactly the property the bring-up exists to have.
# A disposable stack that is not disposed of is not disposable.
# =============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=bringup/env.sh
. "${HERE}/env.sh"

docker compose -f "${HERE}/docker-compose.yml" down -v --remove-orphans
