-- ============================================================================
-- CONSOLIDATED FROM `iterahq/itera-api` — original path `migrations/0001_api_keys.sql`.
-- Moved here 2026-08-04. Renumbered 0001 -> 0042.
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
-- `itera-api` around 2026-06-19, long before it arrived here. Every object it
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

-- itera.api_keys — per-tenant API keys for the Itera Results-API (pull-only v1).
-- Store ONLY sha256(full key) + a non-secret prefix for display. Never the raw key.
-- This migration targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn), NOT
-- DFL prod — applied via the itera-supabase-helpers `migrate` flow (ADR-5).

CREATE TABLE IF NOT EXISTS itera.api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES itera.tenants(id) ON DELETE CASCADE,
  key_prefix  text NOT NULL,
  key_hash    text NOT NULL UNIQUE,
  name        text NOT NULL DEFAULT 'api-key',
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON itera.api_keys (tenant_id);
-- Lookup path: sha256(presented key) -> key_hash (UNIQUE already indexes it).

-- RLS: enabled + no policies => only the service-role (which bypasses RLS) can
-- read/write. The API service uses the service-role key and scopes by tenant_id
-- in SQL; no anon/auth role should ever see key material.
ALTER TABLE itera.api_keys ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE itera.api_keys IS
  'Per-tenant API keys for the Itera Results-API. Stores sha256(key)+prefix only; raw key shown once at mint.';
