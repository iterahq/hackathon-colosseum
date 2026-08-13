# shellcheck shell=bash
# =============================================================================
# env.sh — every value the bring-up depends on, in one place, all fixed.
#
# ⚠️ THESE ARE NOT CREDENTIALS AND MUST NEVER BECOME CREDENTIALS.
# The JWT secret and the two keys below are the PUBLISHED Supabase
# local-development demo values. They sign tokens for a loopback Postgres that
# exists for the length of one run and is then destroyed. Hard-coding them is
# what lets any host reproduce the run with no vault access, which is the whole
# point of a deterministic bring-up.
#
# It follows that NOTHING real may ever be added here. If a future screen needs
# a genuine secret, it does not belong in this stack — the stack is defined by
# having no inputs a reader cannot see.
#
# ⚠️ THE PORTS ARE HIGH AND ODD ON PURPOSE.
# 54321/54322 are what `supabase start` uses, and this must never be mistaken
# for — or collide with — a Supabase CLI stack on the same host. 4188 and 4189
# already belong to `playwright.baseline.config.ts` and
# `playwright.stamp.config.ts`; 54331 keeps the bring-up preview clear of both.
# Every one is overridable so two runs can share a machine.
# =============================================================================

# ---- ports -----------------------------------------------------------------
: "${ITERA_BRINGUP_DB_PORT:=54329}"    # Postgres, loopback only
: "${ITERA_BRINGUP_API_PORT:=54330}"   # the gateway: /auth/v1 + /rest/v1
: "${ITERA_BRINGUP_APP_PORT:=54331}"   # `vite preview` of the built app

export ITERA_BRINGUP_DB_PORT ITERA_BRINGUP_API_PORT ITERA_BRINGUP_APP_PORT

# ---- addresses -------------------------------------------------------------
export ITERA_BRINGUP_API_URL="http://127.0.0.1:${ITERA_BRINGUP_API_PORT}"
export ITERA_BRINGUP_APP_URL="http://127.0.0.1:${ITERA_BRINGUP_APP_PORT}"
export ITERA_BRINGUP_DB_URL="postgresql://postgres:postgres@127.0.0.1:${ITERA_BRINGUP_DB_PORT}/postgres"

# ---- the demo keys (see the warning above) ---------------------------------
export ITERA_BRINGUP_JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
export ITERA_BRINGUP_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
export ITERA_BRINGUP_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

# ---- identities ------------------------------------------------------------
# `itera` is the tenant slug `db/migrations/0003_itera_seed.sql` creates.
# The roles are the `itera.member_role` enum: learner | instructor |
# tenant_admin | owner.
export ITERA_BRINGUP_TENANT_SLUG="itera"
export ITERA_BRINGUP_PASSWORD="bringup-password-2026"
export ITERA_BRINGUP_ADMIN_EMAIL="bringup-admin@itera.invalid"
export ITERA_BRINGUP_INSTRUCTOR_EMAIL="bringup-instructor@itera.invalid"
export ITERA_BRINGUP_LEARNER_EMAIL="bringup-learner@itera.invalid"

# ---- the psql identity -----------------------------------------------------
# `supabase_admin`, NOT `postgres`. In the `supabase/postgres` image the
# `realtime` schema already exists and is owned by `supabase_admin`, so
# `fresh-apply-bootstrap.sql`'s `create table realtime.messages` is refused for
# `postgres` with "permission denied for schema realtime". CI already learned
# this — `.github/workflows/db-migration-check.yml` sets `PGUSER: supabase_admin`
# for exactly this reason. Same role here, for the same reason.
export ITERA_BRINGUP_DB_SUPERUSER="supabase_admin"
