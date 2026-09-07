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
    setup-storage-avatars.sql      # the three Storage buckets. NOT migrations, and
    setup-storage-artifacts.sql    # apply-migrations.sh does not run them: they touch
    setup-storage-lesson-media.sql # storage.*, which the `postgres` role does not own.
                               # Apply with elevated privilege (Dashboard SQL editor
                               # or the Management API). Idempotent. Each header says
                               # what was MEASURED and when — the truth is the
                               # project's state, not the file's.
  seeds/
    fellowship-pilot.ts        # federates a DFL pilot cohort into `dfl-batch`
    fellowship-pilot.fixture.json
    qa-tenant.ts               # builds the `qa-e2e` TEST tenant's content
    qa-tenant.fixture.json     #   ← what the QA tenant contains, declaratively
```

### `seeds/` is DATA, and it is not a migration

Nothing here runs on merge. `db-apply` watches `db/migrations/**` only, so a
seed is something a person or a workflow invokes on purpose:

```bash
npm run seed:qa-tenant             # apply
npm run seed:qa-tenant -- --dry-run
```

The split is the CLAUDE.md rule, not a local preference: **schema** goes through
`db/migrations/` and a human merge, **data** goes through a caller's own user-JWT
so RLS applies and the write is attributable. `qa-tenant.ts` therefore signs in
with the Supabase password grant and writes over PostgREST — no `service_role`,
no database password, no `psql`.

`qa-tenant.ts` also prints the two pins the e2e specs consume
(`ITERA_E2E_PROGRAM_SLUG`, `ITERA_E2E_LESSON_ID`) and ends with a READINESS block.
It exits **3** when the tenant cannot yet host the flows — read that block rather
than re-running. Today one item is expected to be BLOCKED:
`itera.tenants.live_class_enabled` is false for `qa-e2e`, and no user-JWT can
change it (`authenticated` holds SELECT and nothing else on `itera.tenants`).

## Schema shape (v1 — ADR-102)

- **Content** (`programs → units → lessons → activities`) with `*_i18n jsonb`
  titles (bilingual day-1, ADR-35). `itera.units` is exactly
  `id, program_id, ordinal, title_i18n` (`0001_itera_schema_v1.sql:85-90`) —
  ordering is `ordinal`. There is **no `stage` column**, and there never was
  one. The header comment at `0001_itera_schema_v1.sql:74` still writes
  `units(stage)`; that comment stays wrong, because `db/migrations/**` is
  append-only here — a merge there APPLIES to the production database, so it is
  human-gated (see "Applying migrations" below). This README is the correction.

<!-- activity-kinds:begin — VERIFIED block, checked by scripts/verify-activity-kinds.mjs
     against the enum derived from db/migrations/*.sql. Editing a name or the
     count here without the matching migration turns CI red. Do not delete the
     markers to silence the check. -->

  The **14 kinds** of `itera.activity_kind`:
  `diagram` · `document` · `quiz` · `code` · `concept` · `single_choice` ·
  `multi_choice` · `match` · `order` · `video` · `sandbox_scenario` ·
  `concept_reveal` · `chat_sandbox` · `terminal_sandbox`

<!-- activity-kinds:end -->

  They are listed above in `enumsortorder` — the order the migrations added
  them, which is the order the live `pg_enum` returns.

  ⚠️ `sandbox_scenario` is **deprecated, not retired**. Measured on the Itera
  database on 2026-08-13: the value is live in the enum and **zero rows** carry
  it, in either `itera.activities` or `itera.activity_defs`. A DML pass on
  2026-08-10 relabelled its last 48 rows (29 + 19) onto `chat_sandbox`. The
  value cannot leave the enum: Postgres has no `ALTER TYPE … DROP VALUE`.
  Removal at the package/app level rides in `iterahq/itera-player#353`, which is
  still **OPEN** and contains **no migration**.
- **Tenancy + Itera-local IAM** (`tenants`, `users`, `identities`, `memberships`).
  User ids are **Itera-local**; federated identities link IN via `identities`
  (`provider` ∈ `dfl|google|oidc|password`) — never FK out to DFL (ADR-4/26).
- **Gamification** (`progress`, `xp_events`, `badges`, `user_badges`) — minimal
  (hearts/streaks deferred, ADR-14).
- **Results + artifacts** (`activity_results` with INTERNAL-only `score_internal`
  per ADR-15; `artifacts` typed `diagram|document|site|code|text` — ADR-28 named
  the first three, `0025_artifacts_learner_work.sql:38-39` added `code` and
  `text`).

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

## Learning schema — naming map (v0.4 diagram → physical tables)

`0067_learning_schema.sql` created the schema `learning` and its first 9 tables;
`0068_expose_learning_postgrest.sql` put it on the authenticator's schema list so
PostgREST can reach it. Plan
[`20260903-itera-learning-schema-v04-remodel`](https://plans.devfellowship.com/20260903-itera-learning-schema-v04-remodel)
remodels that schema through **A**, **A2**, **B**, **C**, and **D**.
The Q17–Q19 answers on 2026-09-07 remove the proposed C2 migration from this scope.

The v0.4 diagram speaks **PascalCase singular**. Postgres speaks **snake_case
plural**. Seven of the nine apparent "renames" are only that convention. **ADR-1
renames nothing physically**: 148 measured call sites read these tables through
PostgREST under the learner JWT, where a rename breaks the SPA on merge. So the
diagram vocabulary is a *map*, and this is the map. Every table below is in
schema `learning` unless it is written `itera.`.

| Node | Physical table | Status | Note |
|---|---|---|---|
| Learner | `learners` | exists | `role` and `constraints` are deferred by Q17 |
| LearningObjective | `learning_objectives` | exists | C adds `target_autonomy` |
| Claim | `claims` | exists | B adds `claim_template_id`; C adds `valued_work_id` |
| AbstractClaim | `claim_templates` | new in B | the name is Tainan's, not the diagram's (ADR-18); a claim reaches its capability through its template |
| Capability | `capabilities` | new in B | lifted from `concepts.kind='capability'` (15 rows); `learner_id NULL` means shared vocabulary |
| CapabilityState | `capability_states` | new in B | |
| LearnerState | `learner_state` | exists | `learner_state_history` stays a real table, not a view (ADR-9) |
| LearnerModel | `learner_state` | exists; same table as LearnerState | Q19 identifies the model with the existing state; no `learner_models` table |
| Map | **no table, no view** | derived | `map.ts` computes it from PostgREST reads (ADR-7); it reads `ontology_versions` for the version |
| Episode | `work_episodes` | exists | every row is a **turn** today; A adds `work_context_id`, `grain`, `agent_version`, `session_episode_id`, `session_refs`; A2 inserts the **session** rows and fills `session_episode_id`; `ingest_batch_id` is a dead column D drops |
| WorkContext | `work_contexts` | new in A | extracted from `project_ref` / `machine` / `machine_class`, keyed on the normalised `project_root` (ADR-26) |
| EpisodeMoment | `episode_moments` | new in A | `kind text` — `turn`, `decision`, … |
| Artifact | `learning.artifacts` | new in C | the work product of a session. **Not** `itera.artifacts` (learner uploads); the name clash is accepted, and this row is the record of it |
| Activity | `activities` | exists | |
| ActivityResponse | `activity_responses` | exists | |
| Evidence | `evidence` | exists | `misconception_id` is `text` **on purpose** — it matches `concepts.id`. A adds `status`, `moment_id`, `turn_episode_id` and 11 provenance columns; C adds `artifact_id` |
| Concept | `concepts` | exists | the capability rows stay until D |
| TaskModel | `task_models` | new in C | the **expectation** (ADR-20) |
| PresentationModel | **no table in this scope** | deferred | Q18 defers `presentation_models` |
| EvidenceModel | `evidence_models` | new in A | split out of `generation_config` (calibration knobs) |
| AssemblyModel | `assembly_models` | new in A | split out of `generation_config`; `scope` ∈ `global` · `module` · `form` |
| ValuedWork | `valued_work` | new in C | sibling of LearningObjective, never its parent or child (ADR-19) |

22 diagram nodes map to 19 distinct physical tables in this scope.
Map is derived, PresentationModel is deferred, and LearnerModel shares `learner_state` with LearnerState.
These counts cover the diagram map, not all tables in the schema.

### C2 decisions — Q17–Q19, 2026-09-07

Q17 defers `learners.role` and `learners.constraints`. Q18 defers `presentation_models`.
Q19 identifies LearnerModel with the existing `learning.learner_state` table.
There is no separate model table, compatibility view, or physical rename.
`learning.learner_state_history` remains a real history table under ADR-9.
These decisions need only this naming correction; no C2 migration is required.

Read-only catalog verification on 2026-09-07 confirmed both state tables exist.
It found neither proposed model table and zero deferred learner columns.
Repeat this query against the learning database to check that boundary:

```sql
SELECT
  to_regclass('learning.learner_state') IS NOT NULL AS learner_model_exists,
  to_regclass('learning.learner_state_history') IS NOT NULL AS history_exists,
  to_regclass('learning.learner_models') IS NULL AS separate_model_absent,
  to_regclass('learning.presentation_models') IS NULL AS presentation_deferred,
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'learning' AND table_name = 'learners'
      AND column_name IN ('role', 'constraints')
  ) AS learner_columns_deferred;
```

All five results are `true` for the accepted scope. This catalog query checks schema presence, not RLS behavior.

**The source digits 1–5 on the diagram are dropped.** No table carries a source
note, and none should gain one.

### Tables the diagram does not draw

They are real tables with no node. Five of them, and the plan needs all five.

| Physical table | Status | Note |
|---|---|---|
| `residue` | new in B | evidence's twin: the moment that matched no claim, one sentence per row. `quality` ∈ `transcript` · `digest` |
| `ontology_versions` | new in B | one row per editorial change of the vocabulary (ADR-14); row 1 is the capability lift |
| `capability_proposals` | new in B | the human gate between the top-down and the bottom-up corpus (ADR-22). A proposal writes zero capabilities; only an operator decision does |
| `evidence_model_objectives` | new in A | link table, PK `(evidence_model_id, objective_id)` (ADR-21) |
| `assembly_model_objectives` | new in A | link table, PK `(assembly_model_id, objective_id)` (ADR-21) |

### Tables that lose their place

- `checkpoints` (0 rows) is **retired in D**. What it meant now lives in three
  places: the expectation in `task_models`, the product in `learning.artifacts`,
  the judgment in an `evidence` row (ADR-20). There is no `artifact_evaluations`
  table, now or later.
- `generation_config` (1 row) is **retired in D**, after its 3 dashboard and
  backoffice readers move to `evidence_models` / `assembly_models`.
- `misconceptions`, `concept_relations` and `claim_concepts` have no node and
  **stay**. A diagram of nodes omits edge tables; they are not deleted by
  silence.

### Conventions for every new table here

1. **snake_case plural.** The node name is documentation; the table name is the
   contract PostgREST publishes.
2. **`kind text`, never an enum.** Same for `status`, `scope`, `quality`,
   `grain`, `proposed_by_kind`. Postgres has no `ALTER TYPE … DROP VALUE`, and
   this schema's vocabulary is still moving. A closed set is checked in code
   and in a verification block, not by the type system.
3. **Three things in the same migration file as the `create table`:** the RLS
   policy pair (learner ALL on own rows + operator SELECT through
   `itera.is_learning_operator()`), the explicit grant line for `authenticated`
   in the **`0068` pattern**, and the `comment on table`. `grant … on all tables`
   does not reach a table created later, and migrations `0063` / `0065` are the
   record of what a copied grant block costs — so write every grant out, and
   every `anon` revoke with it.
4. **A nullable owner column is one shape for two answers.** `learner_id NULL`
   on `capabilities` and on `task_models` means shared vocabulary; a value means
   learner-owned. Today every such row is NULL. The model tables do **not** use
   this shape — they scope through link tables (ADR-21).
5. **Expand → verify → contract.** A, A2, B and C only add: every new column is
   nullable or defaulted, and every old column stays. D only removes, and only
   what a read-back proved unused.

### The instrument that checks readers against this schema

[`iterahq/itera-learning-monorepo:scripts/learning-callsite-check.mjs`](https://github.com/iterahq/itera-learning-monorepo)
(PR #94, with `iterahq/itera-learning-monorepo:scripts/learning-schema.snapshot.json`
and the npm script `learning:callsite-check`) resolves every dashboard, backoffice and engine call
site against this schema — 148 of them over 16 tables — and is in CI with its
own selftest.

⚠️ **CI runs it in *snapshot* mode**, so a merged migration makes the snapshot
stale without turning CI red. Every engine / dashboard / backoffice PR that
follows a merge refreshes the snapshot with `--write-snapshot` as its **first
commit**, and asserts the check green in *live* mode. It does not cover insert
payload keys, column types or RLS — those need the as-user probes.

### Legacy Learning project roots (0080 correction)

The first backfill in 0078 chose any known ancestor. Home directories absorbed
unrelated repositories. Migration 0080 repairs that derivation. A descendant
can use a known ancestor only through `apps/`, `src/`, `packages/`, `tests/`, or
`docs/`. Home paths and repository containers cannot absorb descendants.
Uncertain boundaries retain their raw cwd. This rule does not certify Mac Git
roots. New clients must send their explicit Git root.

Existing contexts stay. Only legacy turn/unknown rows assigned by 0078, or rows
without a context, receive the corrected context. Session rows, protocol v2
rows and explicit assignments stay unchanged. This correction also restores
the model constraints from `generation_config`: zero contribution cap is
valid; zero distinctness floors and zero cadence ceiling are invalid.

`db/scripts/test-learning-context-model-integrity.sh` runs in DB Migration
Check. It replays the real migration against populated fixtures twice.

## Capability decision guards

Migration `0081_learning_capability_write_guards.sql` closes the decision-write
gaps in gate B (`0079`). Learners can advance `residue.ontology_version` during
a re-pass. Only an operator can change residue decision fields. A learner
proposal starts in `proposed` status with empty decision fields.

Only operators write capabilities, including learner-specific overrides. Learners
read shared capabilities and their own overrides.

The residue moment FK includes the episode and learner. Capability references
require shared vocabulary or the row's own learner. Shared templates and
proposals require shared vocabulary. Capability ownership is immutable.

`bash db/scripts/test-rls-capability-family.sh` verifies these rules with learner
and operator identities against the local database built by `fresh-apply.sh`.
The DB Migration Check workflow runs this test. All fixtures roll back.
### Evidence status transaction contract (0083)

`evidence.status` is a stored projection of the existing supersede-at-read rule.
Each `(claim_id, episode_id)` group retains every row of the newest pass.
Response evidence and evidence without an episode remain active. Equal pass
orders use the JavaScript UTF-16 pass-key tie rule. Missing pass markers use
PostgreSQL JSON timestamps, including microseconds and the `+00:00` UTC suffix.
A read-only production PostgREST probe confirmed that timestamp representation.

Authenticated inserts, deletes, and updates take the caller's advisory lock
before row locks. Statement triggers refresh the projection inside the write
transaction. A command after the lock sees the preceding writer's commit.
Direct `UPDATE(status)` also restores the derived value. Refresh updates only
mismatched rows; empty transition tables end nested trigger execution.
`learning.refresh_evidence_status(uuid[] default null)` refreshes the caller's
claims through RLS. The new grant covers only `status`; it does not grant other
column updates. READ COMMITTED is required; other isolation levels fail clearly.

A2 and any schema migration that regroups multiple learners must use one
transaction and first run `LOCK TABLE learning.evidence IN SHARE ROW EXCLUSIVE
MODE`. Refresh the affected learners before and after the regroup. The table
lock excludes concurrent writers and avoids inconsistent learner lock order.
The migration takes this lock before its initial projection refresh. This
contract does not certify arbitrary administrative writes that bypass it.

The local-only `node db/scripts/test-evidence-status.mjs` checks permissions,
same-pass collisions, deletion, direct status updates, UTF-16 ties, legacy
rows, a multi-learner regroup with the table lock, and two real concurrent
sessions. It also compares all fixture statuses with the JavaScript read rule.
CI runs this check after the fresh schema, replay, and real applier checks.

### Learning mutation RPC

`0082_learning_dml_rpc.sql` adds `learning.apply_dml(p_operation text, p_payload jsonb)`.
The Learning Engine forwards seven `/v1/learning/` operations under the unchanged caller JWT.
The function is `SECURITY INVOKER`; direct RPC callers receive the same validation and ownership checks.
Editorial writes require `itera.is_learning_operator()`. Learner operations resolve their identity from the JWT.
Each call is one transaction. Ontology changes use `pg_advisory_xact_lock(20260903,82)`; future proposal decision verbs must use the same lock.
The function never moves measurement rows. It refuses to reparent a claim that carries evidence, state, history, or an activity.
A partial unique index permits one template instance per objective. Duplicate and concurrent retries fail with `23505` (HTTP 409).

Run `python3 db/scripts/test-learning-dml-rpc.py` to verify the seven verbs, direct RPC validation, RLS, rollback, and concurrency.
The test creates a PostgreSQL 17 container with no network or published ports. It removes that container when it exits.
It applies the real learning migrations and uses a test identity-provider shim.
Before corrections 0080/0081 merge, pass each reviewed file with `--dependency /path/to/migration.sql`.
The RPC and its engine routes remain held until both corrections are deployed.
### C1 delivery and product tables

`0084_learning_valued_work_artifacts.sql` adds `valued_work`, `task_models`, and
`artifacts` to `learning`. It adds nullable claim-to-delivery and evidence-to-artifact links.
Each learner-owned reference uses a composite foreign key or an invoker ownership guard.
A shared task model has no learner-owned parent links. Only an operator can change a shared task model.
An artifact can use a shared task model or its learner's own model. Model ownership is immutable.

`claims.objective_id` becomes nullable, as C.1 requires. Existing claim parents remain unchanged.
There is no new requirement to fill either claim parent, and no link between objectives and valued work.
The `target_autonomy` representation is nullable text. No scale or enum is assumed.
This migration creates no `artifact_evaluations` table and no C2 model tables.

Run `python3 db/scripts/test-learning-c1.py` for isolated PostgreSQL 17 checks.
`--before` omits C1 and must fail, which proves that the assertions detect the missing schema.
The tests use the real learning table definitions with a fixture identity provider.
The engine artifact route remains a separate change after the schema deploy.

### Artifact cleanup RPC (0086)

`learning.delete_artifact(p_artifact_id uuid)` deletes one caller-owned artifact
only when no evidence refers to it. It returns `{artifact_id, deleted: true}`.
It uses SECURITY INVOKER and requires a regular `authenticated` user session.
An operator cannot delete another learner's artifact. Missing and foreign IDs
return `P0002`; an existing reference returns `23503`; NULL IDs return `22023`.
A repeated successful deletion returns `P0002`, which means the artifact is absent.

READ COMMITTED is required. The RPC takes the 0083 learner advisory lock first.
It then locks the artifact row `FOR UPDATE`, checks references in a separate
command, and deletes the row. This order preserves concurrent evidence references
and avoids an inverted lock order with the evidence status triggers. Every read
and write uses the caller's RLS. The C1 composite FK makes every reference to an
owned artifact belong to that same learner. The RPC refuses referenced artifacts
before the C1 `ON DELETE SET NULL` action can remove their evidence links.

`python3 db/scripts/test-learning-artifact-cleanup.py` checks both concurrent
write orders, FK-style row locks, ownership, grants, rollback, and repeated calls
in an isolated PostgreSQL 17 container. `--before` proves the missing RPC fails.
No production fixture is written until both record and cleanup MCP tools deploy.

### Atomic extraction receipts (0085)

`learning.record_extraction_pass(jsonb)` commits one caller-owned episode pass.
Each logical observation writes evidence or residue. Captured moment IDs remain unchanged.
Legacy episodes use null moment IDs and explicit per-pass observation IDs; the RPC creates no capture moments.
The additional internal table `learning.extraction_passes` stores immutable retry receipts.
Each receipt contains the exact JSONB request and result, bounded to 512 KiB and 100 observations.
Array order is part of the retry identity. JSON object key order is not.
A trigger validates direct receipt inserts against their actual persisted rows.

The function uses SECURITY INVOKER and caller RLS. It requires READ COMMITTED.
Lock order is the evidence learner lock, then exclusive editorial advisory lock `(20260903,82)`.
Catalog writer triggers use the same editorial namespace as `learning.apply_dml`.
A stale ontology version is an explicit retry error. Existing identical receipts survive later ontology growth.
The request permits transcript quality only. Digest backfill remains T22.
A2/admin regroup retains 0083's evidence table lock and before/after status refresh contract.
Atomic pass guarantees apply to this RPC; separate direct evidence/residue writes do not become transactions.

Run `node db/scripts/test-extraction-pass.mjs` against a local throwaway database after the migration series.
It tests null-moment exclusivity, row ownership, same-pass status parity, rollback, exact retries, and concurrent writers.

### Proposal decisions (0087)

`learning.apply_dml` also accepts `approve_proposal`, `merge_proposal`, `reject_proposal`, `promote_residue`, and `dismiss_residue`. Every decision requires an authenticated learning operator. The same `(20260903,82)` ontology lock protects the proposal, its full residue cluster, and its current shared capability target.

Approval creates one shared capability with `source.kind=promoted` and the proposal ID, then one new ontology version. It requires an explicit capability ID when the proposal has no suggestion. Merge creates no capability or version. Rejection stores the reason on `capability_proposals.decision_note`. Every operation updates the proposal and cluster in one transaction and writes zero evidence. Completed or overlapping decisions return conflicts.

The residue aliases require `proposal_id` and the exact `residue_ids` cluster. `promote_residue` delegates to merge into an existing capability; `dismiss_residue` delegates to rejection. They cannot bypass proposal history. Human editorial intent remains required; an operator JWT proves access, not human intent.

`python3 db/scripts/test-learning-proposal-decisions.py` runs P.1–P.7 against real learning migrations in an isolated PostgreSQL17 container. It checks rollback, operator/learner boundaries, aliases, duplicate and overlapping decisions, shared version concurrency, and a trigger that refuses every evidence write. `--before` omits0087 and must fail. `--dependency` can apply reviewed0085/0086 files before0087 for integration tests.

## Historical session regroup (0088)

ADR-24 authorizes this historical data migration. It adds no schema object.
The frozen scope is `grain='turn'` with server `created_at <= 2026-09-07T18:30:00Z`.
Later captures remain separate. Replays validate the existing manifest and do not enlarge it.

Order turns by `(started_at,id)` within each learner. Start a session on a project root,
or work context change, or when the gap from the prior effective end exceeds 30 minutes.
A missing end uses that turn's start. Exactly 30 minutes stays in the session.
A changed CLI `session_ref` does not split a session. Preserve all references in `session_refs`.
Current capture has no reliable explicit session-end marker; this migration does not infer one.

Session IDs use `md5(learner_id|project_root|per-root-session-ordinal)::uuid`.
Each original turn retains its ID and payload. It gains `session_episode_id`.
One `kind='turn'` moment links its original row through `payload.turn_episode_id` and `digest_ref`.
Each session payload records the migration tag, cutoff, gap, and ordered turn/evidence manifests.
The manifest and static session fields have separate fingerprints. Fingerprint columns are pinned
to the 0088 schema, so later nullable or defaulted columns preserve replay compatibility.
Turn entries contain `id`, `moment_id`, and a SHA-256 fingerprint excluding only the parent link
and relevance markers. Evidence entries contain `id`, `turn_id`, and a fingerprint excluding
only the new episode links and the derived status. No transcript copy is stored in the manifest.

The migration refuses existing moments, residue, receipts, or prior links on frozen turns.
It preserves all evidence IDs and content. Episode-linked evidence moves to its session and
retains `turn_episode_id`. Episode-less activity-response evidence remains byte-for-byte unchanged.
The 0083 trigger recomputes status with the existing newest-pass rule; no evidence row is deleted.

Table locks use `NOWAIT`, followed by sorted learner advisory try-locks. A busy writer aborts
before any data changes. This prevents a lock-order wait against learner-first application RPCs.
Retry the migration after that writer commits. Keep the closed-set engine release after this regroup.

Run `node db/scripts/test-session-regroup.mjs` against a local throwaway PostgreSQL instance.
The suite covers cutoff equality, project/context changes, CLI references, supersede collisions,
replay, reverse, dependent artifacts, receipt conflicts, and concurrent writer locks.
A session uses its first turn source; each original turn preserves its own source.
`db/scripts/reverse-learning-session-regroup.sql` is the reviewed reverse reference.
Production reversal requires a new reviewed migration. The reverse refuses new dependents or
changed manifest rows and removes only the generated sessions and moments.

### V2 session capture RPC (0089)

`learning.ingest_episode_v2(p_episode jsonb, p_agent_version text, p_machine_class text)`
records one session under the caller JWT. It uses SECURITY INVOKER, a pinned
search path, and READ COMMITTED. The caller must be a registered learner.
The engine keeps the existing learner registration step before capture.

The RPC creates or resolves an owned work context from the explicit canonical
project root, including Unix `/`. It inserts one `schema_version=2`, `grain=session` episode and all
1–10000 captured moments in the same transaction. A late failure rolls back all
three. It validates direct callers, including unknown owner/id/grain fields,
closed timestamps, ordered moments, and supported capture metadata.

The client owns the session boundary. The server checks nondecreasing moment
times within the session interval; it does not infer turns or apply a new gap
rule. V1 ingestion remains supported with `grain=turn` and zero new moments.
This migration does not publish a protocol/client package or update any host.

Raw episode JSON remains in `payload`. The session's legacy `session_ref` column
is NULL so its first old turn cannot collide with it. Distinct moment references
fill `session_refs`; each moment stores the reference in its column and payload.
A conflicting reference in the supplied moment payload is rejected.
Stable moment UUIDs use a learner/protocol-episode-derived prefix and ordinal
suffix. Thus `ORDER BY at,id` preserves capture order even when times tie.

A learner/protocol-ID advisory lock and a v2 protocol-ID unique index serialize
retries. Equal payload, client version, and machine class return the original
episode/moment IDs with `status=duplicate`. A changed request, altered session/context projection, or altered stored
moment set conflicts, with no overwrite. The engine maps these conflicts to its
existing per-episode rejected array. Unavailable schema or transient failures
remain retryable. Every read and write uses RLS; no service-role request path exists.

Run `python3 db/scripts/test-learning-v2-ingest.py` for isolated PostgreSQL17
proofs of ownership, exact retry receipts, concurrent retries, and late rollback.
`--before` omits0089 and must fail. Deploy0089 before the engine accepts v2;
release the client only after the engine deployment proof.

Authenticated callers have no UPDATE grant on capture episodes, contexts, or moments.
The retry checks also detect projection damage from privileged maintenance.
