# db/ — Itera-owned schema + migrations

Itera owns its OWN Supabase project + IAM schema (ADR-3 / ADR-26), independent
of `dfl-schema`. Schema lives in THIS monorepo (schema-in-monorepo, ADR-F1) —
**NOT** in `devfellowship/dfl-schema`.

## THIS DIRECTORY IS THE ONLY PLACE ITERA MIGRATIONS LIVE (2026-08-04)

Until 2026-08-04 three repos wrote DDL into this one database — `itera-player`
(here), `itera-api` (`migrations/`) and `itera-mcp` (`migrations/`) — each with
its own independently incrementing `00NN` sequence. Three numbering series
against one database is a collision waiting to happen, and only this one ever
grew a ledger and an apply pipeline, so the other two were files that looked
like infrastructure and applied nothing.

Tainan, TG 2026-08-04: *"deleta /migrations nesses dois repos e não permite mais
criar via CI check"*. So:

- Their 14 files were **consolidated into this series** as `0041`–`0054`, named
  `NNNN_api00NN_*` / `NNNN_mcp00NN_*` so the source repo and original filename
  stay legible, each carrying a header saying where it came from and that it was
  already applied. They were **renumbered into the order they were actually
  applied**, which is also their dependency order — `itera-api`'s `0003` really
  did land after its `0010`/`0011`, and `itera-mcp`'s `0002` has to precede
  `itera-api`'s `0012`, which calls `itera.current_author_tenant_ids()`.
- All 14 were registered in the ledger as applied **without being executed**
  (`baseline-add`, below). Every object they create was confirmed present in the
  live database by a read-only `SELECT` first — 66 objects, zero missing, so
  there was no backlog to lose.
- `migrations/` was deleted from both repos, and a **CI guard** in each fails the
  build if one reappears, pointing here.

A migration for the Itera database — whoever needs it, whichever service — is a
PR against **this** directory. Nothing about `itera-api` or `itera-mcp` owning
its own runtime changed; what changed is that neither owns schema any more.

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
    ...
    0041_mcp0002_*.sql .. 0054_api0014_*.sql
                               # consolidated 2026-08-04 from itera-mcp/itera-api.
                               # Already applied when they arrived; registered via
                               # `baseline-add`, never executed here.
    .baseline                  # the pre-ledger past: files applied by hand before
                               # itera.schema_migrations existed. Read ONCE, when
                               # the ledger is empty. Never append to it — to adopt
                               # an already-applied file use `baseline-add`.
  scripts/
    apply-migrations.sh        # ledger-backed apply / status / drift / census
    seed-smoke-user.sh         # create + link the ITERA_SMOKE_* auth user
    fresh-apply.sh             # CI: build the schema from ZERO on a throwaway
                               # Postgres, twice, then run the PR's migrations
                               # through apply-migrations.sh. See below.
    fresh-apply-bootstrap.sql  #   the Supabase runtime objects the docker image
                               #   does not ship (realtime.messages, topic())
    fresh-apply-exceptions.txt #   the declared, closed list of deviations
                               #   between sorted order and a working build order
    test-fresh-apply.sh        #   proves fresh-apply.sh both refuses and allows
    ci-wait-for-postgres.sh    #   the service container is not up when
                               #   pg_isready first says so
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
never a high-water mark. The `repo` column was added when three repos wrote DDL
into this one database with overlapping numbering; since the 2026-08-04
consolidation there is only one series, and every row reads `itera-player`. The
column stays as the audit trail of where each file came from.

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

⚠️ **And an empty ledger was not evidence of anything (fixed 2026-08-12).** It
was read as "this is the pre-ledger production database". It is also what a
brand-new database has. Measured, on a throwaway Postgres:

```
[migrate] FIRST RUN — ledger is empty. Reconciling 36 baselined file(s)
          as already applied, WITHOUT running them.

 ledger_rows | itera_tables | itera_functions | billing_schema
          36 |            2 |               0 |              0
```

Thirty-six migrations recorded as applied, over a schema whose only two tables
were the ledger's own. Disaster recovery produced an empty database and reported
success.

So every line of `.baseline` now names the object that proves its file ran, and
the script checks all of them **before** it writes a single ledger row:

| what it finds | what it does |
|---|---|
| every probe holds | the pre-ledger production database — baseline, as before |
| **no** probe holds | an empty database — **do not baseline**, build it instead |
| some hold, some do not | **refuse** (exit 3) — a half-built database is not a state this file can describe |

A file that creates no catalogue object declares `none <reason>` and takes no
part in the vote; a bare filename with no evidence column is a usage error, because
accepting it would re-open the hole. Proven both ways by
`db/scripts/test-baseline-precondition.sh` (7 assertions, throwaway fixtures).

`.baseline` is **one-shot**. It is never read again once the ledger has rows, and
nothing should ever be appended to it — a new migration gets applied, not
baselined.

### Adopting a file that is already applied — `baseline-add`

Because `.baseline` is spent, it cannot absorb a migration that arrives *later*
and is *already applied*. Appending to it would be inert (nothing reads it) and
a lie in the repo (it would claim to be part of a reconciliation that already
happened). That case turned up the same day, with the `itera-api` / `itera-mcp`
consolidation above: 14 files whose objects all already existed. Executing them
would have replayed production DDL; leaving them unregistered would have made
the next merge's `db-apply` try to.

```bash
bash db/scripts/apply-migrations.sh baseline-add 0042_api0001_api_keys.sql \
  --reason 'consolidated from itera-api; applied by hand 2026-06-19; objects verified present'
```

It performs **the same INSERT** `reconcile_baseline` does — same `baseline:`
provenance prefix, same never-execute semantics — with a mandatory `--reason`
recorded in the row, and it **refuses** if the file already has a ledger row (an
edited applied file is a `rebaseline` decision, not this one).

Use it **only** for a file that is provably already applied — verify the objects
with a read-only `SELECT` first. For anything else the answer is `apply`.

## Before merge: the migration actually runs (2026-08-07)

Every guard above watches **`main` versus the database**. None of them ever
executed a line of SQL, so until now the first machine to run a new migration
was the ITERA production database. The human gate protects against the wrong
*intent*; nothing protected against SQL that simply does not run.

`.github/workflows/db-migration-check.yml` fires on any PR touching
`db/migrations/**` and, against a throwaway `supabase/postgres:17.6.1.160`
service container (ITERA production is PostgreSQL 17.6 — **not** 15 like DFL):

1. applies **every** migration from an **empty** database, in the declared
   order, stopping at the first error;
2. applies the whole series **again** — the idempotency this README has always
   required and nothing enforced;
3. seeds the ledger with everything already on `main` and hands the database to
   **`apply-migrations.sh apply`**, so the PR's own migrations go through the
   exact script `db-apply` runs on merge — transaction-mode detection, ledger
   write and all. That script is 563 lines and CI had never executed it.

It needs **no secret**, and `fresh-apply.sh` refuses a `PGHOST` that looks like
a real Supabase project.

Run it locally against any throwaway Postgres:

```bash
docker run -d --name pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 \
  supabase/postgres:17.6.1.160
export PGHOST=localhost PGPORT=55432 PGUSER=supabase_admin \
       PGPASSWORD=postgres PGDATABASE=postgres
bash db/scripts/ci-wait-for-postgres.sh

MIGRATION=db/migrations/<the file your PR adds>
bash db/scripts/fresh-apply.sh --new "$MIGRATION"
```

### `fresh-apply-exceptions.txt` — and why it is closed

Sorted order is **not** a working build order for this series, and that is a
fact about the past rather than a design choice. PR #282 renumbered 14 files out
of `itera-api`/`itera-mcp` to 0041–0054, but `0024_activity_defs_reusable_library.sql`
references four objects those files create (`itera.activity_status`,
`itera.media`, `itera.set_updated_at()`, and the `author` label on
`itera.member_role`, which 0026 also uses). Measured against an empty Postgres,
not inferred. The exceptions file declares the repair — the whole consolidated
block is *hoisted* ahead of 0024 — plus the one `skip`,
`0005_tenant_admin_fixture.sql`, which hard-codes production tenant UUIDs that
`0003_itera_seed.sql` generates randomly anywhere else.

Nothing there can simply be fixed: `itera.schema_migrations` is keyed by
**filename** and carries a **checksum**, so renumbering an applied file makes it
look unapplied and the next `db-apply` re-runs it against production, while
editing one trips checksum drift and stops `db-apply` applying anything at all.

**The file is closed to new migrations.** `fresh-apply.sh` exits 4 if a file
added by the PR appears in it. An exception list a PR can append to is not a
check.

## Drift detection

`db-apply` closes the gap going forward. It cannot tell you about the days it did
not run — and the incident above lasted days precisely because nothing was
watching. `.github/workflows/db-drift.yml` runs daily and **opens a GitHub issue**
(and fails the run) when:

1. a migration is merged to `main` but **not applied**;
2. an applied migration file was **edited** afterwards (checksum);
3. a ledger row has **no file** (deleted or renamed migration);
4. the database contains **objects no migration accounts for**.

There is a **fifth** question since 2026-08-12, and it is the one the other four
cannot ask: *does the repository still rebuild production?* Checks 1-4 all
compare production against its own earlier state. The daily job now also runs
`db/scripts/schema-parity.sh production`, which reads the live catalogue and
diffs it against `db/census/expected-schema.txt`, tolerating only what
`db/census/known-differences.txt` declares — and failing on a declared
difference that has **disappeared**, so a resolved entry cannot sit there
forever as a blindfold.

Check 4 works off `itera.schema_object_census`, whose definition now lives in
`db/scripts/census.sql` — one file, shared with `schema-parity.sh` and with the
daily job. It also got much sharper. The old census read relation names, column
types, index NAMES, function SIGNATURES and policy NAMES, and was therefore
blind to a policy that keeps its name and changes its predicate, a function that
keeps its signature and changes its body, a CHECK or FOREIGN KEY constraint, a
column default, a GRANT, whether RLS is enabled at all, and every COMMENT. All
of those are in now.

The census is **versioned** (`#cens version=N`, first line). `drift` compares the
version before the contents and re-records instead of reporting a diff when it
moved — otherwise editing `census.sql` would masquerade as a schema-drift
incident on the next daily run. So the legitimate path self-heals, and an
out-of-band change stays red until a human signs it off:

```bash
bash db/scripts/apply-migrations.sh census-accept --reason 'hand-applied itera-mcp 0008'
```

~~⚠️ Expect check 4 to fire when someone hand-applies an `itera-api` or
`itera-mcp` migration.~~ **No longer a thing as of 2026-08-04** — those series no
longer exist and CI in both repos refuses to let them come back. A census diff
with no apply behind it now means genuinely out-of-band DDL: someone with the DB
password ran it by hand. Treat it as such; do not refresh it away.

> The rest of the design — PR-time validation, ephemeral replay, and locking
> out-of-band DDL by credential custody — is in
> [`20260728-itera-migration-ci-lock`](https://plans.devfellowship.com/20260728-itera-migration-ci-lock).
> Fase 1, 2, 3 (apply half), 5 (camada 1) and **6 (one series — done by
> consolidation, not by teaching the ledger three repos)** are implemented.
> Fase 4 (the lock) is **not**.

## PostgREST schema exposure

The `itera` schema is exposed to PostgREST via
`alter role authenticator set pgrst.db_schemas = 'public, graphql_public, itera'`
+ `notify pgrst, 'reload config'/'reload schema'`. The browser client sets
`db.schema = 'itera'` so `.from('tenants')` resolves to `itera.tenants`.
