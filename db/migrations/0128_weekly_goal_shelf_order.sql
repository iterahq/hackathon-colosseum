-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- The medal shelf shows the first eight goals of the catalog and, past them,
-- only medals already earned. `weekly_goal` is a goal the dashboard promises
-- ("ao bater: medalha da semana"), so it sorts inside the shelf.
-- Idempotent.
-- ============================================================================

update itera.achievements set sort = 95 where key = 'weekly_goal';
