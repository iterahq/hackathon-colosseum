# `bringup/` — a disposable ITERA, from this repository alone

Stands up Postgres + GoTrue + PostgREST on loopback, builds `itera.*` from
`db/migrations/` with the repository's own applier, creates three identities
with three different roles, and lets Playwright photograph authenticated
screens **without touching the ITERA production database**.

```sh
bringup/up.sh          # ~90 s: stack + 64 migrations + 3 identities
npm run e2e:bringup    # build the app against it, capture, assert
bringup/down.sh        # destroy, including the volume
```

## Why it exists

Three Playwright configs already existed, and none could do this:

| config | substrate | authenticated screens? |
|---|---|---|
| `playwright.config.ts` | live production | yes — and a read-only visit **writes rows there** |
| `playwright.baseline.config.ts` | `vite preview` + `stub.supabase.invalid` | no |
| `playwright.stamp.config.ts` | the same, stamped | no |
| **`playwright.bringup.config.ts`** | **this stack** | **yes, on a throwaway database** |

Most of the product is behind `RequireAuth`. Until now the only way to
photograph it was to drive production — which, measured on 2026-08-12, creates
an attempt row every time a diagram lesson is opened.

## What it is made of

| file | what it is |
|---|---|
| `env.sh` | **the single source** for every port, key, identity and role. Everything else reads it. |
| `docker-compose.yml` | four containers, every port bound to `127.0.0.1` |
| `nginx.conf` | one origin: `/auth/v1` → GoTrue, `/rest/v1` → PostgREST, and the CORS preflight |
| `bootstrap-roles.sql` | the login credentials the `supabase/postgres` image does not ship |
| `up.sh` / `down.sh` | stand up and destroy |
| `verify-twice.sh` | destroy → rebuild → recapture → compare bytes |

## The five things that were not obvious

Each of these cost a failed run. They are written down so the next person does
not pay for them again.

1. **`PGUSER` must be `supabase_admin`, not `postgres`.** The image already owns
   a `realtime` schema as `supabase_admin`, so `fresh-apply-bootstrap.sql` is
   refused for `postgres` with *permission denied for schema realtime*. CI
   already knew (`db-migration-check.yml` sets it); the bring-up had to learn.

2. **The image ships the service roles with no passwords.** GoTrue and PostgREST
   connect over TCP and fail with *password authentication failed for user
   "supabase_auth_admin"* / *"authenticator"*. `bootstrap-roles.sql` is the
   counterpart of `fresh-apply-bootstrap.sql`: that one adds the runtime
   objects, this one adds the runtime credentials.

3. **GoTrue answers the CORS preflight without `Access-Control-Allow-Origin`.**
   Real responses carry it; the `OPTIONS` does not. The browser then blocks the
   login POST and the app renders *"Verifique suas credenciais"* — a
   **credentials** message for a **CORS** failure. `curl` never reproduces it,
   because curl sends no preflight. nginx answers the preflight here; Kong does
   it in the hosted product.

4. **PostgREST's image has no shell utilities**, so any `healthcheck` reports
   unhealthy on a service that is serving, and compose then refuses to start
   nginx. Readiness is asserted from outside instead.

5. **🚨 Every password sign-up is an `owner`.** The `auth.users` insert trigger
   (`0009` / `0015` / `0044` / `0045`) gives each native signup a personal tenant
   `plg-<uid12>` with role `owner`, and `itera.custom_access_token_hook` puts the
   **highest** role across **all** memberships into the token. The first run of
   `up.sh` therefore produced `user_role: "owner"` for the learner, the
   instructor and the admin alike. `up.sh` now strips that membership — mirroring
   what `0015_federation_plg_owner_leak_fix.sql` already does for federated
   fellows, and for the reason it states: *"a personal `plg-<uid>` owner tenant
   confers NO professor/admin affordance"*.

   The test `the three identities carry three different roles` exists to catch a
   regression here, because **every other assertion in the suite still passes**
   when all three identities are secretly the same role.

## What is proved, and what is not

`bringup/verify-twice.sh` destroys the stack, rebuilds it from zero, captures
again, and compares. Measured on `openclaw-tainan`, 2026-08-13:

```
screen/artifact          pass 1            pass 2            same
admin/png                c50cf8646fc60173  c50cf8646fc60173  yes
catalog/png              e5591c379048ab9a  e5591c379048ab9a  yes
home/png                 f0c0342f0cb76fee  f0c0342f0cb76fee  yes
profile/png              036db9f28820eb13  036db9f28820eb13  yes
```

Two rebuilds mean **new** `auth.users` ids, **new** tenant uuids from
`gen_random_uuid()` and **new** `created_at` values. None of them reaches a pixel
or a region box. That is what makes a later "the diff reached zero" answerable.

⚠️ **One host.** Glyph rasterisation belongs to the host's FreeType/fontconfig,
so byte-identity is promised on one machine and nothing more. A cross-machine
comparison must run in one container; `e2e/artifacts/bringup/bringup-manifest.json`
records the host so a consumer can tell. The full list of what is and is not
neutralised is in the header of `e2e/support/captureRegions.ts`.

⚠️ **Four screens, not twenty-five.** This is the bring-up. Growing to the
25-screen manifest from `DFL-00699` belongs to the capture harness
(`DFL-0069E`), and folding it in here would hide a bring-up failure inside a
long run.

## Security posture

- **Every published port is `127.0.0.1`-bound**, and `vite preview` is started
  with `--host 127.0.0.1`. `supabase start` binds `0.0.0.0`, and on this fleet's
  public VPS that left Postgres reachable from the internet with
  `postgres:postgres` (2026-08-12; `DOCKER-USER` rules did not stop it, only a
  `raw`-table `PREROUTING` drop did). Do not "simplify" a `ports:` entry.
- **The keys in `env.sh` are the published Supabase demo values.** They sign
  tokens for a loopback database that lives for one run. Nothing from Infisical
  belongs here, and nothing real may ever be added — the stack is defined by
  having no input a reader cannot see.
- The preview contains `data-source` stamps, i.e. the private repository's file
  layout. That is a second reason the preview is loopback-only.

## What this does NOT need

**No `NODE_AUTH_TOKEN` problem.** The plan lists the `@iterahq` private registry
as a blocker for the bring-up. It is not one inside this repository's own
workflows: every job already installs with
`NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, and the native workflow token
reads `@iterahq` packages fine. The blocker is real only for a job running
OUTSIDE `iterahq` — which is the portable container (`DFL-006A5`), not this.
