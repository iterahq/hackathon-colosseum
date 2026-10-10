-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Bounds on the companion mirror (security review, finding 4): every mirror is
-- a transaction signed and paid by the mint authority, and a free account
-- could ask for one per request.
--
-- * `companions.mirror_day` / `mirror_writes`: how many on-chain writes this
--   companion had on that UTC day. The policy (cooldown of 30 s between
--   ordinary mirrors, at most 60 writes a day, purchases and "lives reached
--   zero" skip the cooldown but count) is a pure function in
--   `_shared/mirror.ts`. Past a limit the database stays right, the row is
--   flagged `mirror_due` and the latest state is written by the next eligible
--   call.
-- Only the service role writes this table (grants of 0116 unchanged).
-- Idempotent.
-- ============================================================================

alter table itera.companions add column if not exists mirror_day date;
alter table itera.companions add column if not exists mirror_writes integer not null default 0;
