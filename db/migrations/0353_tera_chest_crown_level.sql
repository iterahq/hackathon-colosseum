-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Tera NFT follow-up: the one-of-one comes out of ONE chest only.
--
-- A chest may now commit effort level 4: level 3 on the day that completes the
-- last trail of the program. It is the only level whose odds give the
-- primordial Tera any weight. `tera_chests.level` accepted 0 to 3; it accepts
-- 0 to 4. Nothing else changes; no row is rewritten. Idempotent.
-- Undo: put the check back to `between 0 and 3` (only while no row holds 4).
-- ============================================================================

alter table itera.tera_chests drop constraint if exists tera_chests_level_check;
alter table itera.tera_chests add constraint tera_chests_level_check check (level between 0 and 4);
