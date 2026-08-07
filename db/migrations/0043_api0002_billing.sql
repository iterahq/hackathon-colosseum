-- ============================================================================
-- CONSOLIDATED FROM `iterahq/itera-api` — original path `migrations/0002_billing.sql`.
-- Moved here 2026-08-04. Renumbered 0002 -> 0043.
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

-- Itera billing data model — Stripe per-seat subscription.
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn), NOT DFL prod.
-- Applied via the itera-supabase-helpers `migrate` flow.
--
-- Plan: 20260619-itera-billing-stripe (ADR-1: one Product family, per-seat
-- prices — seat_monthly BRL + seat_monthly_usd USD, language-aware).
-- The per-verified-artifact overlay (usage_records / stripe_overlay_item_id) was
-- DROPPED 2026-06-29 (Tainan directive). See migration 0003 for the live drop.
-- ADR-3: this is the billing-state truth, fed by Stripe PUSH (/billing/webhook),
-- distinct from the pull-only Results-API.
--
-- All tables are RLS-enabled with NO policies => only the service-role (which
-- bypasses RLS, same pattern as itera.api_keys) can read/write. The billing
-- service connects with the DB role and scopes by tenant_id in SQL.

CREATE SCHEMA IF NOT EXISTS billing;

-- ---------------------------------------------------------------------------
-- customers — one Stripe Customer per Itera tenant.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES itera.tenants(id) ON DELETE CASCADE,
  stripe_customer_id  text NOT NULL UNIQUE,
  email               text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
-- One Stripe customer per tenant (v1: a tenant maps to a single billing account).
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_customers_tenant ON billing.customers (tenant_id);

-- ---------------------------------------------------------------------------
-- subscriptions — the per-seat base subscription. seat_count drives the Stripe
-- subscription-item `quantity` on the seat_monthly price (ADR-1, Phase 5).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.subscriptions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES itera.tenants(id) ON DELETE CASCADE,
  customer_id                 uuid NOT NULL REFERENCES billing.customers(id) ON DELETE CASCADE,
  stripe_subscription_id      text NOT NULL UNIQUE,
  -- Stripe subscription-item id carrying the seat_monthly price (seats).
  stripe_seat_item_id         text NULL,
  status                      text NOT NULL DEFAULT 'incomplete',
  seat_count                  integer NOT NULL DEFAULT 1 CHECK (seat_count >= 0),
  current_period_start        timestamptz NULL,
  current_period_end          timestamptz NULL,
  cancel_at_period_end        boolean NOT NULL DEFAULT false,
  canceled_at                 timestamptz NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_tenant ON billing.subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_customer ON billing.subscriptions (customer_id);

-- ---------------------------------------------------------------------------
-- webhook_events — Stripe event idempotency log. UNIQUE on the Stripe event id
-- so a re-delivered event is processed exactly once (ADR-3, replay safety).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.webhook_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id     text NOT NULL UNIQUE,
  type                text NOT NULL,
  payload             jsonb NULL,
  received_at         timestamptz NOT NULL DEFAULT now(),
  processed_at        timestamptz NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_type ON billing.webhook_events (type);

-- ---------------------------------------------------------------------------
-- invoices — mirror of Stripe invoices for reporting / dunning visibility.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NULL REFERENCES itera.tenants(id) ON DELETE SET NULL,
  subscription_id     uuid NULL REFERENCES billing.subscriptions(id) ON DELETE SET NULL,
  stripe_invoice_id   text NOT NULL UNIQUE,
  status              text NOT NULL DEFAULT 'draft',
  amount_due          bigint NULL,
  amount_paid         bigint NULL,
  currency            text NULL,
  hosted_invoice_url  text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant ON billing.invoices (tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_subscription ON billing.invoices (subscription_id);

-- ---------------------------------------------------------------------------
-- RLS — enable on all billing tables, NO policies (service-role only).
-- ---------------------------------------------------------------------------
ALTER TABLE billing.customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.webhook_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.invoices        ENABLE ROW LEVEL SECURITY;

COMMENT ON SCHEMA billing IS
  'Itera Stripe billing — per-seat subscription. Service-role only (RLS on, no policies).';
COMMENT ON TABLE billing.webhook_events IS
  'Stripe event idempotency log. UNIQUE(stripe_event_id) makes webhook processing exactly-once.';
