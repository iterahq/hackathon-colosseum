#!/usr/bin/env bash
# Create + link the ITERA_SMOKE_* auth user against the Itera Supabase project.
# Idempotent. Needs: ITERA_SUPABASE_URL, ITERA_SERVICE_ROLE_KEY, ITERA_ANON_KEY,
# ITERA_DB_URL (+PGPASSWORD). Email/password default to env or are generated.
#
# Steps:
#   1. Create a Supabase auth user (email_confirm=true) via the admin API.
#   2. Insert itera.users + link itera.identities(provider='password') + add
#      itera.memberships(tenant='itera', role='learner').
#   3. Print prefix-only confirmation. Save the values to Infisical /shared/ITERA_SMOKE_*.
set -euo pipefail

: "${ITERA_SUPABASE_URL:?}"; : "${ITERA_SERVICE_ROLE_KEY:?}"; : "${ITERA_ANON_KEY:?}"; : "${ITERA_DB_URL:?}"
EMAIL="${ITERA_SMOKE_EMAIL:-itera-smoke@iterahq.dev}"
PASS="${ITERA_SMOKE_PASSWORD:-$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)}"

# 1. create (ignore "already exists")
curl -s -X POST "$ITERA_SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $ITERA_SERVICE_ROLE_KEY" -H "Authorization: Bearer $ITERA_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"email_confirm\":true}" >/dev/null || true

# fetch the uid
AUID=$(curl -s "$ITERA_SUPABASE_URL/auth/v1/admin/users?page=1&per_page=200" \
  -H "apikey: $ITERA_SERVICE_ROLE_KEY" -H "Authorization: Bearer $ITERA_SERVICE_ROLE_KEY" \
  | python3 -c "import sys,json;u=[x for x in json.load(sys.stdin).get('users',[]) if x.get('email')=='$EMAIL'];print(u[0]['id'] if u else '')")
[ -n "$AUID" ] || { echo "ERROR: could not resolve auth uid"; exit 1; }

# 2. link into itera IAM
psql "$ITERA_DB_URL" -v ON_ERROR_STOP=1 <<SQL
insert into itera.users (email, display_name, locale)
values ('$EMAIL', 'Itera Smoke', 'pt')
on conflict (email) do update set display_name = excluded.display_name;
insert into itera.identities (user_id, provider, provider_subject)
select u.id, 'password', '$AUID' from itera.users u where u.email = '$EMAIL'
on conflict (provider, provider_subject) do nothing;
insert into itera.memberships (user_id, tenant_id, role)
select u.id, t.id, 'learner' from itera.users u, itera.tenants t
where u.email = '$EMAIL' and t.slug = 'itera'
on conflict (user_id, tenant_id) do nothing;
SQL

echo "Smoke user ready: $EMAIL (auth uid ${AUID:0:8}…, password prefix ${PASS:0:4}…)"
echo "Save to Infisical: /shared/ITERA_SMOKE_USERNAME=$EMAIL  ITERA_SMOKE_PASSWORD=<pass>  ITERA_SMOKE_USER_ID=$AUID"
