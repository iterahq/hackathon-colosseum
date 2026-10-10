-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- `class-podium` and `endorse` decide who is a teacher from
-- `itera.memberships` joined to `itera.tenants.slug`: a personal tenant
-- (`plg-<uid>`, owned by whoever signed up) confers no teacher right
-- (`_shared/staff.ts`). The service role needs to read the slug for that.
-- Idempotent.
-- ============================================================================

grant select on itera.tenants to service_role;
