-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- `itera.can_read_answer_key` is asked by the `lesson` function with the
-- caller's own key. A visitor with no session teaches nothing, so `anon` does
-- not need to call it: the function then reads the refusal as "not staff" and
-- serves the sealed lesson, exactly as before.
-- Idempotent.
-- ============================================================================

revoke execute on function itera.can_read_answer_key(uuid) from anon;
