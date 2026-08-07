-- ============================================================================
-- CONSOLIDATED FROM `iterahq/itera-api` — original path `migrations/0003_drop_artifact_overlay.sql`.
-- Moved here 2026-08-04. Renumbered 0003 -> 0046.
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
-- `itera-api` around 2026-06-30, long before it arrived here. Every object it
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

-- Drop the per-verified-artifact billing overlay (Tainan directive 2026-06-29:
-- "não vamos ter cobrança por verified artifact").
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn), NOT DFL prod.
-- Applied via the itera-supabase-helpers `migrate` flow.
--
-- Removes:
--   - billing.usage_records             (overlay metered usage log)
--   - billing.subscriptions.stripe_overlay_item_id (overlay sub-item id column)
--
-- Idempotent: safe to re-run. The Stripe metered overlay Price is retired
-- separately (left inactive in the DFL sandbox account, not recreated under the
-- future Itera account). Plan: 20260619-itera-billing-stripe.

DROP TABLE IF EXISTS billing.usage_records;

ALTER TABLE billing.subscriptions
  DROP COLUMN IF EXISTS stripe_overlay_item_id;

COMMENT ON SCHEMA billing IS
  'Itera Stripe billing — per-seat subscription. Service-role only (RLS on, no policies).';
