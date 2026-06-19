# itera-player

Learner-facing player app for **Itera** — a re-skin of `devfellowship/dfl-iterate`
wired to the **Itera Supabase** project. Foundation batch of the Itera execution
(plan `20260619-itera-app-foundation`, child of `20260619-itera-batches-master-plan`).

> Lives in the `iterahq` GitHub org (NOT devfellowship). Itera owns its own
> Supabase + IAM schema (ADR-3 / ADR-26), independent of `dfl-schema`.

## Stack

- Vite + React 18 + TypeScript
- `@devfellowship/components` (shadcn) + Tailwind, `@monaco-editor/react`,
  `@tanstack/react-query`, `vitest`, `@devfellowship/observability` (OTel)
- `@supabase/supabase-js` → the **Itera** Supabase project `kjefmwlopzeaqgqtlbdn`

## Layout (monorepo, ADR-F1)

```
src/                    # the player SPA
  auth/                 # Supabase Auth context, route guard, tenant branding
  i18n/                 # PT + EN bilingual scaffold (ADR-35)
  lib/supabase/         # browser client (db.schema = 'itera')
  pages/auth/LoginPage  # password auth + federated IdP buttons + white-label
db/                     # Itera-owned schema + migrations + apply flow (ADR-F1)
modules/judge0/         # placeholder for code-execution (ADR-30)
```

> `iterahq/iterahq-ops` (the Octokit GitHub engine) is **referenced**, not folded
> in yet — kept deployed as-is (ADR-101). Fold-in is a later batch.

## Auth

- **Password auth** works E2E (the foundation gate). `LoginPage` → Supabase
  `signInWithPassword`. Protected routes use `RequireAuth`.
- **Federated IdP** (DFL OIDC / Google) is wired via `signInWithOAuth` — minimal
  in the foundation; DFL is ONE IdP among several (ADR-4 / ADR-103). User ids stay
  Itera-local (`itera.users`); identities link in via `itera.identities`.
- **Per-tenant white-label login**: `/login?tenant=<slug>` reads
  `itera.tenants.branding` (logo / primary color / bg).
- **Tenant isolation** is enforced by RLS (`itera.current_tenant_ids()`).

## Develop

```sh
npm i
cp .env.example .env   # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev
```

## Build / test / lint

```sh
npm run build
npm test       # vitest
npm run lint
```

## DB

See [`db/README.md`](db/README.md) for the schema, RLS, and the migration flow.

## Deploy

Dokploy app (auto-deploy on push to `main`), served via Cloudflare on
`iterahq.dev`. Env (`VITE_SUPABASE_*`) injected from Infisical `/apps/itera`.
