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
    0004_tenant_admin_metrics.sql  # tenant_admin role + admin RLS (membership-join) + access-token claim hook
    0005_tenant_admin_fixture.sql  # verification fixture: learners + results across tenant A/B
    .baseline                  # the pre-ledger past: files applied by hand before
                               # itera.schema_migrations existed. Read ONCE, when
                               # the ledger is empty. Never append to it.
  scripts/
    apply-migrations.sh        # ledger-backed apply / status / drift / census
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

**Merging a migration to `main` APPLIES it.** The `db-apply` workflow
(`.github/workflows/db-apply.yml`) runs `db/scripts/apply-migrations.sh` on every
push to `main` that touches `db/migrations/**`. The human merge is the gate; CI
does the applying. Same shape as `devfellowship/dfl-schema`'s `Push Migrations`.

**Which means Tainan merges migration PRs — not an agent, and not anyone else.**
Merging is deploying, so the merge is the human gate. This is path-scoped: a PR
touching `db/migrations/**` needs his merge, and every other PR in this repo
still auto-merges on green CI. Three things carry the rule:

| Layer | What it does | Does it actually stop a merge? |
|---|---|---|
| `safe-admin-merge` path gate (`protected_paths.conf`) | the tool agents merge with refuses this path: `BLOCKED:… reason=protected_path` | **yes** — no override flag exists |
| `.github/workflows/migration-human-gate.yml` → `db/scripts/require-code-owner-merge.sh` | turns the PR red until a code owner approves; green after | no, but red CI is refusal that other tooling reads |
| `.github/CODEOWNERS` → `/db/migrations/ @taigfs` | records the ownership | **not today** — see below |

⚠️ **GitHub itself enforces none of this on this repo.** `iterahq` is on the
FREE plan and `itera-player` is private, so branch protection *and* rulesets
return 403 (`gh api repos/iterahq/itera-player/branches/main/protection` →
"Upgrade to GitHub Pro"; `gh api orgs/iterahq/rulesets` → "Upgrade to GitHub
Team"). "Require review from Code Owners" cannot be switched on, and no check
here can be marked *required*. The CODEOWNERS entry is written so it starts
enforcing the moment the org upgrades; until then the binding constraint is the
`safe-admin-merge` gate, and a human with the Merge button can still click it.

The gate logic is a script, not YAML, so it is testable and runnable by hand:

```bash
bash db/scripts/test-require-code-owner-merge.sh   # 17 assertions, stubs gh, no network
```

The test asserts the **allowed** verdicts as carefully as the refusals — a
UI-only PR, `db/README.md`, `db/scripts/`, an owner-approved PR, an
owner-authored PR — because a guard that refuses everything gets disabled within
a day. It also fails if `.github/CODEOWNERS` and the workflow's `CODE_OWNERS`
drift apart.

This changed on **2026-08-04**, and the reason is worth keeping: before that
date this section said migrations were applied by hand and that if nobody ran the
script, `main` and the database would silently disagree. Nobody ran it. `0036`,
`0037` and `0038` sat merged-and-unapplied for days, so every attempt settled in
that window was written without the stage-cursor topic, without
`spec_snapshot`/`spec_locale` and without `pedagogical_context` — and those rows
cannot be back-filled, because the wording and the tagging of that moment are
gone.

### The ledger

`itera.schema_migrations` records **filename + sha256 + when + by whom**. Each
file applies **exactly once**.

The key is the **filename**, not the numeric prefix, and that is load-bearing:
two `0006_*` files exist on `main`, and `0023` was merged *after* `0024`. A
"highest number applied" cursor would have skipped `0023` forever, silently. The
decision is a **set difference** over filenames — "which files have no row" —
never a high-water mark. The `repo` column is there because three repos write DDL
into this one database (`itera-player`, `itera-api`, `itera-mcp`) with
overlapping numbering; only this one is automated so far.

**Editing a migration that was already applied makes the apply FAIL**, loudly,
rather than silently skipping it — the repo and the database would otherwise
disagree about what is in the database with nothing saying so. Resolve it
explicitly:

```bash
# the edit is cosmetic / already reflected in prod
bash db/scripts/apply-migrations.sh rebaseline 0034_activity_traces.sql --reason 'comment typo'
# the edit is a real schema change
git revert the edit and write a NEW migration
```

### Idempotency is STILL mandatory

The ledger prevents **known** re-application. Idempotency prevents **unknown**
re-application: a restore from backup, a fresh environment, a bad baseline, a
`-- itera:no-transaction` file that died between its DDL and its ledger row. Two
layers, ~zero cost to keep both. So: `IF NOT EXISTS` / `CREATE OR REPLACE` /
`DROP POLICY IF EXISTS` before `CREATE POLICY` / `ADD VALUE IF NOT EXISTS`, and
data seeds with `ON CONFLICT DO NOTHING`.

### Transactions, and what a failed run leaves behind

The script picks a mode per file, by reading it:

| mode | when | guarantee |
|---|---|---|
| `wrap` | the file does not manage its own transaction | file **and** its ledger row commit together, or neither does |
| `self` | the file opens its own `begin;` (most recent ones do) | the file is atomic on its own; the ledger row lands immediately after |
| `none` | first line is `-- itera:no-transaction` | for DDL Postgres refuses to run in a transaction block (`ALTER TYPE … ADD VALUE`) |

A failure **stops the run at that file** — later migrations are not attempted,
because order is meaningful and applying past a failure is how a half-migrated
schema becomes a mystery. Recovery is forward-fix and re-run, which is safe only
because every file is idempotent.

### Running it by hand

Still supported, and still the right thing when you are debugging:

```bash
export PGPASSWORD='<from Infisical /apps/itera SUPABASE_DB_PASSWORD>'
bash db/scripts/apply-migrations.sh status   # applied / pending / checksum drift — read-only
bash db/scripts/apply-migrations.sh plan     # what apply WOULD do — read-only
bash db/scripts/apply-migrations.sh apply    # do it
bash db/scripts/apply-migrations.sh drift    # everything the daily job checks
```

`ITERA_DB_URL` is still honoured if you want to point somewhere else; with only
`PGPASSWORD`/`SUPABASE_DB_PASSWORD` set, the pooler URL is built from defaults.
The script hard-refuses the DFL prod project ref.

> **Connectivity:** the direct DB host is IPv6-only (unreachable from the
> claude-main VPS and from the runners). Use the **session pooler**
> `aws-1-us-east-1.pooler.supabase.com:5432` — **`aws-1`, not `aws-0`**
> (`aws-0` answers `Tenant or user not found` for this project).

### The first run, and `db/migrations/.baseline`

The ledger was introduced against a database where `0001…0035` were already
applied by hand and `0036…0038` were not. There is no way to infer that from the
database — the old script left no record of what it ran — so the answer is
**declared** in `db/migrations/.baseline`, reviewed in the PR that introduced the
ledger, against a live read of the schema.

On the first run against an empty ledger the script records exactly those files
as applied **without executing them**, then applies everything else normally.
Note what the two obvious shortcuts would have done: "mark everything present as
applied" would have swallowed `0036/0037/0038` permanently, and "apply
everything" would have replayed 36 files against production.

`.baseline` is **one-shot**. It is never read again once the ledger has rows, and
nothing should ever be appended to it — a new migration gets applied, not
baselined.

## Drift detection

`db-apply` closes the gap going forward. It cannot tell you about the days it did
not run — and the incident above lasted days precisely because nothing was
watching. `.github/workflows/db-drift.yml` runs daily and **opens a GitHub issue**
(and fails the run) when:

1. a migration is merged to `main` but **not applied**;
2. an applied migration file was **edited** afterwards (checksum);
3. a ledger row has **no file** (deleted or renamed migration);
4. the database contains **objects no migration accounts for**.

Check 4 works off `itera.schema_object_census` — a fingerprint of every relation,
column, index, function, enum, policy and trigger in `itera` + `billing` (plus
this project's `itera%` policies on `realtime.messages`), refreshed by the apply
script after each successful run. So the legitimate path self-heals, and an
out-of-band change stays red until a human signs it off:

```bash
bash db/scripts/apply-migrations.sh census-accept --reason 'hand-applied itera-mcp 0008'
```

⚠️ **Expect check 4 to fire when someone hand-applies an `itera-api` or
`itera-mcp` migration.** That is correct, not noise: those series are out-of-band
with respect to this pipeline, and they stay that way until they join the same
ledger.

> The rest of the design — PR-time validation, ephemeral replay, and locking
> out-of-band DDL by credential custody — is in
> [`20260728-itera-migration-ci-lock`](https://plans.devfellowship.com/20260728-itera-migration-ci-lock).
> Fase 1, 2, 3 (apply half) and 5 (camada 1) are implemented. Fase 4 (the lock)
> and Fase 6 (unifying the three series) are **not**.

## PostgREST schema exposure

The `itera` schema is exposed to PostgREST via
`alter role authenticator set pgrst.db_schemas = 'public, graphql_public, itera'`
+ `notify pgrst, 'reload config'/'reload schema'`. The browser client sets
`db.schema = 'itera'` so `.from('tenants')` resolves to `itera.tenants`.
