-- 0068 — expose schema `learning` through PostgREST
--
-- Why: 0067 created schema `learning` (plan 20260828-itera-learning-engine-v1),
-- but the authenticator role's search list still names only
-- `public, graphql_public, itera` (db/README.md:466 documents how `itera` was
-- added with exactly this statement). Without `learning` here, no Supabase
-- client can reach the new tables: the learning dashboard reads them directly
-- (anon key + user session, RLS applying) and the local agent's shipper writes
-- them the same way.
--
-- Idempotent: SET is absolute — re-running assigns the same value.
-- The NOTIFY makes the running PostgREST reload without a restart.

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, itera, learning';

notify pgrst, 'reload config';
