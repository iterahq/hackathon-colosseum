-- ============================================================================
-- programs.archived_at — a real lifecycle column, so "retired" stops being
-- guessed from the program's NAME.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- WHY
-- ---
-- `itera.programs` was `id, tenant_id, slug, title_i18n, created_at, is_catalog`
-- — no `status`, no `archived_at`, nothing anywhere in the content schema that
-- can express "this program is retired". `activity_defs.tags` is `'{}'` on all
-- 123 rows, so there was no curated marker to read either.
--
-- The back office needed the distinction anyway (28% of the library hangs off
-- one program literally titled "Arquivo — demos antigas (não usar)"), so it
-- inferred it from the only signal the data carried: the name the human typed.
-- `itera-backoffice:src/lib/library/archive.ts` matched slug prefixes
-- (`arquivo-`, `deprecated-`, …) and parenthetical title warnings (`(não usar)`).
-- It was written carefully — anchored, separator-bounded, tested in both
-- directions so `arquivo-demos-antigas` matched and `arquitetura-de-software`
-- did not — but careful guessing is still guessing. A program named
-- "Arquitetura de sistemas legados (não usar mais essa versão)" would have been
-- hidden from the library by a regex, and nobody would have known why.
--
-- This column replaces the regex with a fact. The back office reads
-- `archived_at is not null` instead of parsing prose, and that heuristic file is
-- deleted (iterahq/itera-backoffice, companion PR).
--
-- WHY A NULLABLE TIMESTAMP AND NOT A `status` ENUM
-- ------------------------------------------------
-- 1. It carries WHEN, not just WHETHER. "Retired last March" and "retired
--    yesterday" are different facts to a curator; a boolean or an enum throws
--    the difference away and there is no cheap way to get it back later.
-- 2. It writes NOTHING to the 10 existing rows. This is the decisive argument
--    here, not a stylistic preference: Tainan's instruction on 2026-07-31 was
--    explicitly "não precisa arquivar nenhum por enquanto" — the column is born,
--    the heuristic dies, and no program is marked. A `status` column can only be
--    added as NOT NULL DEFAULT '<something>', which stamps a lifecycle state
--    onto every existing row, or as nullable — at which point NULL means
--    "unknown", and the enum has bought nothing over this. `archived_at` starts
--    genuinely, honestly NULL on all 10 rows.
-- 3. `where archived_at is null` is the whole query, and it is directly
--    indexable (below).
-- 4. An enum would require inventing a state vocabulary — draft? active?
--    retired? — that nobody has asked for and that would then have to be
--    honoured everywhere. The only distinction anyone needs today is
--    live vs retired. Adding a `status` later on top of this column is easy;
--    un-inventing a vocabulary that leaked into four services is not.
--
-- Un-archiving is `set archived_at = null`, which is why the column is nullable
-- rather than, say, an append-only event.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- --------------------------------------------
-- It archives nothing. Zero rows are marked. There is no UPDATE in this file by
-- design — see point 2 above. Marking the 35-definition demo archive is a
-- separate, deliberate act (and it is DML: it goes through an MCP tool with a
-- real user's JWT, not through a migration running as superuser with RLS off).
--
-- It also does not touch RLS. `programs_select_tenant` filters on `tenant_id`
-- and is unaffected by a new column; the table-level `grant select on all tables
-- in schema itera` from 0002 already covers every column of `programs`,
-- including this one. No policy is added, dropped, or weakened. Hiding archived
-- programs is a PRODUCT decision belonging to each surface — the back office
-- hides them behind a toggle, the player is unchanged by this migration — and
-- baking it into RLS would make retired content unreachable by the very people
-- who need to un-retire it.
--
-- IDEMPOTENT
-- ----------
-- `apply-migrations.sh` re-runs EVERY db/migrations/*.sql from 0001 on every
-- invocation — there is no ledger table (see db/README.md). So: ADD COLUMN IF
-- NOT EXISTS, CREATE INDEX IF NOT EXISTS, and COMMENT ON (which is a replace).
-- Re-running this file is a no-op, and it never clobbers an archived_at value
-- somebody set.
-- ============================================================================

alter table itera.programs
  add column if not exists archived_at timestamptz null;

comment on column itera.programs.archived_at is
  $$When this program was retired. NULL = live.

The lifecycle flag for a program. `archived_at is null` is the live-content
filter; `archived_at is not null` means somebody deliberately retired it, and the
value says when. Un-archiving is `set archived_at = null`.

Retired content is HIDDEN BY DEFAULT, never deleted, and stays fully readable —
its lessons, activities, results and progress rows are untouched. RLS does not
filter on this column: each surface decides. The back office hides archived
programs behind a toggle; a surface that ignores this column sees exactly what it
saw before.

Introduced 2026-07-31 to replace a name-matching heuristic
(`itera-backoffice:src/lib/library/archive.ts`, now deleted) that inferred
"archived" from slug prefixes and "(não usar)" markers in the title, because the
schema had no way to say it. Do not reintroduce that inference: if a program is
retired, set this column.$$;

-- "Live programs of the tenants I belong to" is the read every content surface
-- opens with, and it is now expressible as an index rather than a full scan plus
-- an application-side regex.
--
-- Honest sizing note: at 10 rows the planner will seq-scan this table no matter
-- what exists, so this index buys nothing measurable TODAY. It is here to
-- declare the intended access pattern next to the column that defines it, and
-- because a partial index over an all-NULL predicate column is close to free.
create index if not exists idx_programs_live
  on itera.programs (tenant_id)
  where archived_at is null;
