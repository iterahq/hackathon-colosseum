-- ============================================================================
-- CONSOLIDATED FROM `iterahq/itera-api` — original path `migrations/0014_byoc_attempt_notes.sql`.
-- Moved here 2026-08-04. Renumbered 0014 -> 0054.
--
-- Tainan, TG 2026-08-04: *"deleta /migrations nesses dois repos e não permite
-- mais criar via CI check"*. `itera-player` is now the SINGLE owner of the Itera
-- schema; `itera-api` and `itera-mcp` no longer carry a `migrations/` directory
-- and a CI guard in each fails if one reappears. This file exists so the DDL
-- behind live production objects keeps a home in a repository — deleting it
-- outright would have destroyed the provenance of objects that are still there.
--
-- ⚠️ ALREADY APPLIED BEFORE CONSOLIDATION — merging it applies NOTHING.
-- It was applied to the Itera database (kjefmwlopzeaqgqtlbdn) by hand out of
-- `itera-api` around 2026-08-04, long before it arrived here. Every object it
-- creates was confirmed present by a read-only SELECT on 2026-08-04, and it is
-- recorded in `itera.schema_migrations` as applied WITHOUT being executed, via
-- `db/scripts/apply-migrations.sh baseline-add`. Do NOT "re-apply" it.
--
-- The new number is the order in which it was ACTUALLY applied, which is also
-- its dependency order — the old numbers could not be: itera-api's 0003 landed
-- after its 0010/0011, and itera-mcp's 0002 must precede itera-api's 0012, which
-- calls itera.current_author_tenant_ids(). Three independent 00NN sequences
-- against one database is exactly the collision this consolidation ends.
--
-- THE SQL BELOW IS BYTE-FOR-BYTE THE ORIGINAL. Nothing was edited — an edited
-- migration and a live database that disagree is the failure this file guards.
-- ============================================================================

-- ============================================================================
-- Itera — BYOC: record WHY a generation had to retry.
-- Plan: 20260723-itera-code-live-byoc-arch (ADR-8, the audit half).
--
-- WHY THIS EXISTS
-- ---------------
-- `degraded_reason` only ever holds the TERMINAL reason: it is written by
-- serveFallback, so a generation that failed once and was repaired on the retry
-- lands in the table as `attempts_used = 2, degraded_reason = NULL`. That is
-- precisely what the single BYOC generation in production looks like today —
-- we can see that the model needed a second pass and we cannot see what it got
-- wrong on the first.
--
-- That blind spot is the same one that let `byoc_not_configured` sit unnoticed
-- for weeks (memory: BYOC state, 2026-08-03): BYOC degrades in silence by
-- design (ADR-7, "nunca 500 na cara do aluno"), so silence has to be
-- instrumented or it reads as success. The near-misses are the useful signal —
-- they name the gate that is about to start producing fallbacks, while the
-- learner is still being served a real generation.
--
-- SHAPE: jsonb array of strings, oldest rejection first, `[]` when the first
-- attempt was accepted. NOT NULL + DEFAULT so every reader can index it without
-- a null branch, and so the backfill of existing rows is the default itself.
-- ============================================================================

ALTER TABLE itera.byoc_generations
  ADD COLUMN IF NOT EXISTS attempt_notes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE itera.byoc_generations
  DROP CONSTRAINT IF EXISTS byoc_generations_attempt_notes_is_array;

ALTER TABLE itera.byoc_generations
  ADD CONSTRAINT byoc_generations_attempt_notes_is_array
  CHECK (jsonb_typeof(attempt_notes) = 'array');

COMMENT ON COLUMN itera.byoc_generations.attempt_notes IS
  'Why each REJECTED generation attempt was rejected, oldest first. Empty when the '
  'first attempt was accepted. Survives a SUCCESSFUL retry, which degraded_reason does not.';
