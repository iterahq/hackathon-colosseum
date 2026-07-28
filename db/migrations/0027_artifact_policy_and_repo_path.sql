-- ============================================================================
-- 0027 — "what persists" stops being inferred by the renderer and becomes
--        AUTHORED, plus artifacts gain a git-shaped logical path.
--
-- Plan: 20260728-itera-artifact-storage. Extends Phase 1 (migration 0025).
--
-- WHY
-- ---
-- 0025 made `itera.artifacts` a real store, but WHICH activities write to it
-- was hard-coded in the renderer: the reflection `document` and the AI-judge
-- `document` handed content up, everything else did not. That is an inference
-- living in a React component — invisible to the author, unqueryable, and
-- wrong by construction for the case Tainan named:
--
--   "às vezes uma resposta determinística ainda pode gerar algo útil que deve
--    ser persistido — seria como um template que, a partir de uma
--    pré-engenharia do nosso usuário, gera algo útil mesmo sem usar IA."
--
-- So persistence becomes a per-activity AUTHORED policy with a per-kind
-- DEFAULT. The default reproduces today's behaviour exactly (see below), which
-- is what makes this migration non-regressive for the 123 activities already
-- in this database.
--
-- ⚠️ APPLIED MANUALLY. Merging the PR applies NOTHING.
-- ------------------------------------------------------
-- There is no migration CI and no ledger table: db/scripts/apply-migrations.sh
-- re-runs EVERY file from 0001 in one psql session. Every statement below is
-- therefore written to be safely re-runnable.
--
-- ✅ Unlike 0014/0016/0025 this file contains NO `ALTER TYPE ... ADD VALUE`,
--    so it IS transaction-safe and can go through the txn-wrapping `migrate`
--    helper.
--
-- ✅ REVERSIBLE. Every change here is an added column or index; dropping them
--    restores the previous state. Contrast 0025, which was not.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. `artifact_policy` — the authored answer to "does this activity persist?"
--
--    A FIRST-CLASS COLUMN, deliberately NOT a key inside `spec`. Three reasons,
--    the first two lifted verbatim from the 0024 precedent:
--
--    (a) `spec` is per-kind and schema-divergent — `@iterahq/activity-spec` has
--        no shared base schema across the 11 kinds, so a cross-kind concern has
--        nowhere consistent to live in it.
--    (b) This has to be QUERYABLE uniformly ("show me every activity that
--        produces a deliverable"), which a per-kind spec key cannot support.
--    (c) `spec` is validated by a Zod registry published from the separate
--        `iterahq/activity-spec` repo and consumed here as a vendored tarball.
--        Putting the field there would require an upstream release + re-vendor
--        before a single line of app code could read it.
--
--    Shape (all keys optional; `{}` means "inherit the per-kind default"):
--      {
--        "mode":     "auto" | "always" | "never",
--        "type":     "code" | "text" | "document" | "diagram" | "site",
--        "filename": "reflection.md",
--        "template": "# {{title}}\n\n{{content}}\n",
--        "repoPath": "reflections/{{lesson}}/{{activity}}.md"
--      }
--
--    `mode` semantics — the resolver lives in src/services/artifactPolicy.ts:
--      auto   (DEFAULT) → use the per-kind default. `document` persists;
--                         every other kind does not. This is EXACTLY what the
--                         renderer did before this migration, which is why
--                         defaulting to '{}' changes no existing behaviour.
--      always           → persist even when the kind default says no. This is
--                         the deterministic-activity case: the learner's answer
--                         is rendered through `template` into something useful
--                         without any AI in the loop.
--      never            → never persist, even when the kind default says yes.
--                         An author's explicit opt-out for a private prompt.
-- ---------------------------------------------------------------------------
alter table itera.activities
  add column if not exists artifact_policy jsonb not null default '{}'::jsonb;

alter table itera.activity_defs
  add column if not exists artifact_policy jsonb not null default '{}'::jsonb;

-- Keep garbage out of the two enumerated keys. Written as NOT VALID-free plain
-- constraints because every existing row is '{}' and therefore already passes.
-- `->>` yields NULL for an absent key, so an empty policy satisfies both.
alter table itera.activities  drop constraint if exists activities_artifact_policy_chk;
alter table itera.activities  add  constraint activities_artifact_policy_chk check (
  jsonb_typeof(artifact_policy) = 'object'
  and (artifact_policy->>'mode' is null or artifact_policy->>'mode' in ('auto','always','never'))
  and (artifact_policy->>'type' is null or artifact_policy->>'type' in ('code','text','document','diagram','site'))
);

alter table itera.activity_defs drop constraint if exists activity_defs_artifact_policy_chk;
alter table itera.activity_defs add  constraint activity_defs_artifact_policy_chk check (
  jsonb_typeof(artifact_policy) = 'object'
  and (artifact_policy->>'mode' is null or artifact_policy->>'mode' in ('auto','always','never'))
  and (artifact_policy->>'type' is null or artifact_policy->>'type' in ('code','text','document','diagram','site'))
);

-- "Which activities in this tenant produce a deliverable?" — the query that a
-- spec key could never answer. Partial: only non-empty policies are interesting.
create index if not exists idx_activities_artifact_policy
  on itera.activities using gin (artifact_policy)
  where artifact_policy <> '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. `repo_path` — the git-shaped LOGICAL path of an artifact.
--
--    Tainan: "já pensa numa estrutura que facilite depois, quando a gente for
--    implementar, enviar pro Git. Tem que ter correlação: a UI e os dados que a
--    gente extrai já podem estar relacionados a isso."
--
--    So the same string does three jobs at once:
--      1. the folder tree the learner browses in /artifacts,
--      2. the grouping the tenant admin reads in /admin/artifacts,
--      3. the path the file will occupy in a real repository in Phase 4.
--
--    Shape: <program>/<NN-unit>/<NN-lesson>/<NN-activity>/<filename>, e.g.
--      data-modeling/01-fundamentos/02-modelagem/03-reflexao/reflection.md
--
--    ⚠️ This is NOT the storage key. Storage stays content-addressed at
--    `<auth-uid>/<activity-id>/<sha256>.<ext>` because the bucket's RLS
--    predicate is `(storage.foldername(name))[1] = auth.uid()::text` — a
--    human-readable first segment would break owner isolation. `repo_path` is
--    presentation + future-git only; `storage_path` remains the physical truth.
--
--    Nullable on purpose: rows written by 0025's code path (and any row whose
--    lesson context could not be resolved) simply have none, and the UI falls
--    back to grouping by activity.
-- ---------------------------------------------------------------------------
alter table itera.artifacts
  add column if not exists repo_path text;

-- The learner's "my repository" read is (owner, path) ordered; the admin's is
-- (tenant, path). Two indexes because the two surfaces filter on different keys.
create index if not exists idx_artifacts_user_repo_path
  on itera.artifacts (user_id, repo_path);
create index if not exists idx_artifacts_tenant_repo_path
  on itera.artifacts (tenant_id, repo_path)
  where tenant_id is not null;

-- ---------------------------------------------------------------------------
-- 3. RLS is deliberately UNTOUCHED.
--
--    `artifacts_rw_self` (0001) and `artifacts_read_tenant_admin` (0025) already
--    express the full access model, and column-level reads inherit the table
--    policy — a new column needs no new policy. Authors can already write
--    `itera.activities` via `activities_author_update`, so `artifact_policy`
--    is editable by exactly the right people the moment it exists.
--
--    Re-verify anyway after applying (the admin psql path is BYPASSRLS and
--    cannot prove any of this):
--      run.sh rls-selftest --as aluno1
--      run.sh as-user-rest artifacts 'select=id,repo_path' --as aluno2
-- ---------------------------------------------------------------------------

comment on column itera.activities.artifact_policy is
  'Authored persistence policy. {} = inherit the per-kind default (see src/services/artifactPolicy.ts). mode: auto|always|never.';
comment on column itera.activity_defs.artifact_policy is
  'Same shape as itera.activities.artifact_policy — the reusable definition''s default, mirrored to instances.';
comment on column itera.artifacts.repo_path is
  'Git-shaped LOGICAL path (<program>/<unit>/<lesson>/<activity>/<filename>). Drives the folder UI and the Phase 4 commit path. NOT the storage key — storage_path stays content-addressed for RLS.';
