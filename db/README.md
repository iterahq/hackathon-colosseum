# db/ — Itera-owned schema + migrations

Itera owns its OWN Supabase project + IAM schema (ADR-3 / ADR-26), independent
of `dfl-schema`. Schema lives in THIS monorepo (schema-in-monorepo, ADR-F1) —
**NOT** in `devfellowship/dfl-schema`.

## Target

- Project: **Itera** Supabase `kjefmwlopzeaqgqtlbdn` (https://kjefmwlopzeaqgqtlbdn.supabase.co)
- NEVER DFL prod `yoojxnggaxcqtsyjdrdx` — that goes via dfl-schema PRs.

## Layout

```
db/
  migrations/
    0001_itera_schema_v1.sql   # schema itera.*: content + tenancy + IAM + gamification + results
    0002_itera_rls.sql         # RLS tenant isolation + identity helpers (SECURITY DEFINER)
    0003_itera_seed.sql        # pilot tenant + 1x program/unit/lesson/activities + tenant B
  scripts/
    apply-migrations.sh        # run every migrations/*.sql in order (idempotent)
    seed-smoke-user.sh         # create + link the ITERA_SMOKE_* auth user
```

## Schema shape (v1 — ADR-102)

- **Content** (`programs → units(stage) → lessons → activities`) with `*_i18n jsonb`
  titles (bilingual day-1, ADR-35). `activities.kind` ∈ `diagram|document|quiz|code`.
- **Tenancy + Itera-local IAM** (`tenants`, `users`, `identities`, `memberships`).
  User ids are **Itera-local**; federated identities link IN via `identities`
  (`provider` ∈ `dfl|google|oidc|password`) — never FK out to DFL (ADR-4/26).
- **Gamification** (`progress`, `xp_events`, `badges`, `user_badges`) — minimal
  (hearts/streaks deferred, ADR-14).
- **Results + artifacts** (`activity_results` with INTERNAL-only `score_internal`
  per ADR-15; `artifacts` typed `diagram|document|site`, ADR-28).

## RLS

Every tenant-scoped table has RLS. Isolation is resolved from the caller's
Supabase `auth.uid()` → `itera.identities` → `itera.users` →
`itera.memberships.tenant_id` via the SECURITY DEFINER helpers
`itera.current_itera_user_id()` / `itera.current_tenant_ids()`.
`tenants` branding is the one public-read table (for the white-label login).

## Applying migrations

```bash
export ITERA_DB_URL='postgresql://postgres.kjefmwlopzeaqgqtlbdn@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'
export PGPASSWORD='<from Infisical /apps/itera SUPABASE_DB_PASSWORD>'
bash db/scripts/apply-migrations.sh
```

Or via the `itera-supabase-helpers` skill: `run.sh migrate db/migrations/<file>.sql`.

> Connectivity note: the direct DB host is IPv6-only (unreachable from the
> claude-main VPS). Use the **session pooler** `aws-1-us-east-1.pooler.supabase.com:5432`
> (NOT `aws-0`). CI applies migrations the same way.

## PostgREST schema exposure

The `itera` schema is exposed to PostgREST via
`alter role authenticator set pgrst.db_schemas = 'public, graphql_public, itera'`
+ `notify pgrst, 'reload config'/'reload schema'`. The browser client sets
`db.schema = 'itera'` so `.from('tenants')` resolves to `itera.tenants`.
