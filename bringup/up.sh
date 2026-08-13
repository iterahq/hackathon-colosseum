#!/usr/bin/env bash
# =============================================================================
# up.sh — stand the disposable ITERA stack up, from nothing, with no AI.
#
# WHAT IT DOES, IN THE ONLY ORDER THAT WORKS
# ------------------------------------------
#   1. start Postgres and wait for it to be genuinely ready
#   2. start GoTrue, which OWNS the `auth` schema and migrates it at boot
#   3. build `itera.*` from `db/migrations/` with the repository's own
#      `fresh-apply.sh` — one pass, from an empty database
#   4. start PostgREST and the gateway, then reload PostgREST's schema cache
#   5. create the identities through the GoTrue admin API and link them into
#      `itera.users` / `identities` / `memberships`
#   6. print the environment a build needs, and nothing else
#
# Step 2 must precede step 3 and step 3 must precede step 5. GoTrue rewrites
# `auth.users` when it migrates, so an `itera` migration that references it has
# to run afterwards; and an identity cannot be linked to a tenant that
# `0003_itera_seed.sql` has not created yet.
#
# DETERMINISM IS THE POINT
# ------------------------
# Every identity, password, tenant slug and port is fixed. The stack is
# addressed only through loopback. Nothing is read from Infisical, from
# `~/.claude`, or from any host credential file — the inputs are this
# directory, `db/migrations/`, and three public Docker images. Two runs on one
# host must produce the same database and the same screenshots; that is what
# `e2e/bringup-capture.spec.ts` asserts.
#
# USAGE
#   bringup/up.sh                 # stand up, seed, print env
#   bringup/up.sh --print-env     # print env for a stack that is already up
#   eval "$(bringup/up.sh --print-env)"
#
# EXIT CODES
#   0 up and seeded   2 usage/environment error   3 a service never healthy
#   4 the schema failed to build           5 an identity could not be created
# =============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/.." && pwd)"

# shellcheck source=bringup/env.sh
. "${HERE}/env.sh"

PRINT_ENV_ONLY=0
[[ "${1:-}" == "--print-env" ]] && PRINT_ENV_ONLY=1

say()  { printf '[bringup] %s\n' "$*" >&2; }
die()  { printf '[bringup] ERROR: %s\n' "$1" >&2; exit "${2:-2}"; }

print_env() {
  # Deliberately `export` lines and nothing else, so `eval "$(up.sh
  # --print-env)"` is safe to run in any shell.
  cat <<ENV
export VITE_SUPABASE_URL=${ITERA_BRINGUP_API_URL}
export VITE_SUPABASE_ANON_KEY=${ITERA_BRINGUP_ANON_KEY}
export ITERA_BRINGUP_API_URL=${ITERA_BRINGUP_API_URL}
export ITERA_BRINGUP_APP_URL=${ITERA_BRINGUP_APP_URL}
export ITERA_BRINGUP_DB_URL=${ITERA_BRINGUP_DB_URL}
export ITERA_BRINGUP_SERVICE_KEY=${ITERA_BRINGUP_SERVICE_KEY}
ENV
}

if [[ "$PRINT_ENV_ONLY" -eq 1 ]]; then
  print_env
  exit 0
fi

command -v docker >/dev/null 2>&1 || die "docker not found on PATH"
docker compose version >/dev/null 2>&1 || die "\`docker compose\` (v2) not found"
command -v psql >/dev/null 2>&1 || die "psql not found on PATH"

COMPOSE=(docker compose -f "${HERE}/docker-compose.yml")

# ---------------------------------------------------------------------------
# 1. Postgres
# ---------------------------------------------------------------------------
say "starting postgres on 127.0.0.1:${ITERA_BRINGUP_DB_PORT}…"
"${COMPOSE[@]}" up -d db >/dev/null 2>&1 || die "compose could not start postgres" 3

# `pg_isready` inside the container is the healthcheck; wait on the OUTSIDE
# too, because a port that is published is not the same as a port that accepts
# a connection, and the very next thing we do is connect from the host.
for _ in $(seq 1 60); do
  PGPASSWORD=postgres psql -h 127.0.0.1 -p "${ITERA_BRINGUP_DB_PORT}" -U "${ITERA_BRINGUP_DB_SUPERUSER}" \
    -d postgres -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 1
done
PGPASSWORD=postgres psql -h 127.0.0.1 -p "${ITERA_BRINGUP_DB_PORT}" -U "${ITERA_BRINGUP_DB_SUPERUSER}" \
  -d postgres -tAc 'select 1' >/dev/null 2>&1 \
  || die "postgres never accepted a connection on 127.0.0.1:${ITERA_BRINGUP_DB_PORT}" 3
say "postgres ready"

# The image ships the service roles but no passwords for them, so GoTrue and
# PostgREST cannot log in until this runs. See the file's own header.
PGPASSWORD=postgres psql -h 127.0.0.1 -p "${ITERA_BRINGUP_DB_PORT}" -U "${ITERA_BRINGUP_DB_SUPERUSER}" \
  -d postgres -v ON_ERROR_STOP=1 -q -f "${HERE}/bootstrap-roles.sql" >/dev/null \
  || die "could not give the service roles a login" 3
say "service roles can log in"

# ---------------------------------------------------------------------------
# 2. GoTrue — before the itera migrations, because it owns `auth`
# ---------------------------------------------------------------------------
say "starting gotrue (it migrates the auth schema)…"
"${COMPOSE[@]}" up -d auth >/dev/null 2>&1 || die "compose could not start gotrue" 3

# GoTrue signals readiness by writing its own tables. Waiting on the HTTP
# endpoint would need the gateway, which we have not started yet — and the
# gateway must not start before PostgREST has a schema to read.
for _ in $(seq 1 60); do
  n=$(PGPASSWORD=postgres psql -h 127.0.0.1 -p "${ITERA_BRINGUP_DB_PORT}" -U "${ITERA_BRINGUP_DB_SUPERUSER}" -d postgres \
        -tAc "select count(*) from information_schema.tables where table_schema='auth' and table_name='refresh_tokens'" 2>/dev/null)
  [[ "${n:-0}" -ge 1 ]] && break
  sleep 1
done
[[ "${n:-0}" -ge 1 ]] || die "gotrue never migrated the auth schema" 3
say "auth schema migrated"

# ---------------------------------------------------------------------------
# 3. The ITERA schema, built from this repository's migrations
# ---------------------------------------------------------------------------
# ONE pass, and no applier. The second pass exists in CI to prove every file is
# re-runnable; here it would actively harm the result, because
# `0002_itera_rls.sql`'s `grant select on all tables in schema itera` is a
# SNAPSHOT and a second pass hands `anon` SELECT on sixteen relations that one
# pass does not. A bring-up must build the schema the repository DECLARES, not
# the wider one that re-running produces.
say "building itera.* from db/migrations (one pass, from zero)…"
PGHOST=127.0.0.1 PGPORT="${ITERA_BRINGUP_DB_PORT}" PGUSER="${ITERA_BRINGUP_DB_SUPERUSER}" \
PGPASSWORD=postgres PGDATABASE=postgres \
  bash "${ROOT}/db/scripts/fresh-apply.sh" --no-second-pass --no-applier >&2 \
  || die "db/migrations could not build the schema — see the output above" 4
say "schema built"

# ---------------------------------------------------------------------------
# 4. PostgREST + the gateway
# ---------------------------------------------------------------------------
say "starting postgrest and the gateway on ${ITERA_BRINGUP_API_URL}…"
"${COMPOSE[@]}" up -d rest gateway >/dev/null 2>&1 || die "compose could not start rest/gateway" 3

# PostgREST caches the schema at connect time. It started before the migrations
# on a cold stack only by accident of ordering, and on a WARM stack it is
# certain to hold a stale cache — so reload unconditionally rather than hoping.
PGPASSWORD=postgres psql -h 127.0.0.1 -p "${ITERA_BRINGUP_DB_PORT}" -U "${ITERA_BRINGUP_DB_SUPERUSER}" -d postgres \
  -c "NOTIFY pgrst, 'reload schema'" -c "NOTIFY pgrst, 'reload config'" >/dev/null 2>&1 || true

for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${ITERA_BRINGUP_API_URL}/auth/v1/health" 2>/dev/null)
  [[ "$code" == "200" ]] && break
  sleep 1
done
[[ "${code:-}" == "200" ]] || die "the gateway never answered /auth/v1/health (last: ${code:-none})" 3

# PostgREST is probed from out here rather than by a container healthcheck: its
# image ships no shell utilities, so an in-container probe reports unhealthy on
# a service that is serving. 401 is the CORRECT answer to an unauthenticated
# read of a tenant-scoped table — it proves the whole chain (nginx → PostgREST →
# JWT verification) is live. A 404 would mean the schema cache is stale.
for _ in $(seq 1 60); do
  rcode=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "apikey: ${ITERA_BRINGUP_ANON_KEY}" -H "Accept-Profile: itera" \
    "${ITERA_BRINGUP_API_URL}/rest/v1/tenants?select=slug&limit=1" 2>/dev/null)
  [[ "$rcode" =~ ^(200|401|403)$ ]] && break
  sleep 1
done
[[ "${rcode:-}" =~ ^(200|401|403)$ ]] || die "postgrest never served itera.tenants (last: ${rcode:-none})" 3
say "gateway ready (auth 200, rest ${rcode})"

# ---------------------------------------------------------------------------
# 5. Identities
# ---------------------------------------------------------------------------
# One per role the capture needs. `DFL-00699` established that two identities
# cover all 25 reachable screens: a tenant admin reaches everything, and a
# plain learner supplies the two empty states an admin can never see. The
# instructor is created as well so a role picker has something to pick.
seed_identity() {
  local email="$1" role="$2" display="$3"

  local created uid
  created=$(curl -s -X POST "${ITERA_BRINGUP_API_URL}/auth/v1/admin/users" \
    -H "apikey: ${ITERA_BRINGUP_SERVICE_KEY}" \
    -H "Authorization: Bearer ${ITERA_BRINGUP_SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${ITERA_BRINGUP_PASSWORD}\",\"email_confirm\":true}")
  uid=$(printf '%s' "$created" | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin).get("id",""))
except Exception:
    print("")')

  # Already-exists is not an error: `up.sh` must be safe to run twice.
  if [[ -z "$uid" ]]; then
    uid=$(PGPASSWORD=postgres psql -h 127.0.0.1 -p "${ITERA_BRINGUP_DB_PORT}" -U "${ITERA_BRINGUP_DB_SUPERUSER}" -d postgres \
            -tAc "select id from auth.users where email = '${email}' limit 1" 2>/dev/null | tr -d '[:space:]')
  fi
  [[ -n "$uid" ]] || { printf '[bringup] admin API said: %s\n' "$created" >&2; return 1; }

  PGPASSWORD=postgres psql -h 127.0.0.1 -p "${ITERA_BRINGUP_DB_PORT}" -U "${ITERA_BRINGUP_DB_SUPERUSER}" -d postgres \
    -v ON_ERROR_STOP=1 >/dev/null <<SQL || return 1
insert into itera.users (email, display_name, locale)
values ('${email}', '${display}', 'pt')
on conflict (email) do update set display_name = excluded.display_name;

insert into itera.identities (user_id, provider, provider_subject)
select u.id, 'password', '${uid}' from itera.users u where u.email = '${email}'
on conflict (provider, provider_subject) do nothing;

insert into itera.memberships (user_id, tenant_id, role)
select u.id, t.id, '${role}' from itera.users u, itera.tenants t
where u.email = '${email}' and t.slug = '${ITERA_BRINGUP_TENANT_SLUG}'
on conflict (user_id, tenant_id) do update set role = excluded.role;

-- 🚨 STRIP THE AUTO-PROVISIONED PERSONAL TENANT. This is not tidying.
--
-- \`auth.users\` carries an INSERT trigger (0009 / 0015 / 0044 / 0045) that gives
-- every native password sign-up a PERSONAL tenant \`plg-<uid12>\` with the role
-- OWNER. \`itera.custom_access_token_hook\` then puts the HIGHEST role across
-- ALL memberships into the token, so without this delete every identity here
-- signs in with \`user_role: "owner"\` — measured, not feared: the first run of
-- this script produced \`owner\` for the learner, the instructor and the admin
-- alike, and a capture taken from it would have photographed one role three
-- times while claiming three.
--
-- \`0015_federation_plg_owner_leak_fix.sql\` already strips exactly this
-- membership for federated fellows, and states why it is safe: "a personal
-- plg-<uid> owner tenant confers NO professor/admin affordance". So this
-- mirrors a decision the repository has already taken, for the same reason.
--
-- ⚠️ It also means the bring-up identities are NOT shaped like a self-serve
-- signup. That is the point — a capture needs one declared role per identity —
-- but a PLG-specific screen must be captured from a DIFFERENT identity that
-- keeps its personal tenant.
delete from itera.memberships m
using itera.users u, itera.tenants t
where m.user_id = u.id and m.tenant_id = t.id
  and u.email = '${email}' and t.slug like 'plg-%';

delete from itera.tenants t
where t.slug like 'plg-%'
  and not exists (select 1 from itera.memberships m where m.tenant_id = t.id);
SQL

  say "identity ${email} → ${role} (auth uid ${uid:0:8}…)"
}

say "creating identities…"
seed_identity "${ITERA_BRINGUP_ADMIN_EMAIL}"      "tenant_admin" "Bring-up Admin"      || die "could not create the admin identity" 5
seed_identity "${ITERA_BRINGUP_INSTRUCTOR_EMAIL}" "instructor"   "Bring-up Instructor" || die "could not create the instructor identity" 5
seed_identity "${ITERA_BRINGUP_LEARNER_EMAIL}"    "learner"      "Bring-up Learner"    || die "could not create the learner identity" 5

say "up. environment follows on stdout:"
print_env
