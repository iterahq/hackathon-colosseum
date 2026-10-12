-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Tera NFT follow-up: a tenant's own brand on its own sponsor Tera.
--
-- The brand of a sponsor Tera refuses names of the team ("DevFellowship",
-- "Itera"...) so that an outside wallet cannot pose as one. DevFellowship is
-- the real sponsor of the team's bounties, so the STAFF of its tenant may use
-- the name this row says is that tenant's: `tenants.branding.sponsor_brand`.
-- The key is written here, by a migration; no request can set it.
-- Idempotent. Undo:
--   update itera.tenants set branding = branding - 'sponsor_brand' where slug = 'dfl-batch';
-- ============================================================================

update itera.tenants
   set branding = branding || '{"sponsor_brand": "DevFellowship"}'::jsonb
 where slug = 'dfl-batch'
   and not (branding ? 'sponsor_brand');
