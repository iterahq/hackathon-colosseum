-- ============================================================================
-- P3-3b — automatic intermediate podium every N activities.
-- Plan: 20260717-itera-aula-piloto-feedback (Q P3-3b, answer A: "professor
-- define ao criar a aula"). Adds a per-session `podium_every` so the instructor
-- picks, at class creation, a cadence at which the player auto-shows the
-- intermediate standings (the manual "Pódio" button already exists).
--
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- Nullable / no default → existing sessions and the "off" choice are NULL (no
-- auto podium). RLS is unchanged: the column rides the existing class_sessions
-- policies (0013). REPLICA IDENTITY FULL already set, so realtime UPDATE
-- payloads carry the value with no extra config. Idempotent.
-- ============================================================================

alter table itera.class_sessions
  add column if not exists podium_every integer
  check (podium_every is null or podium_every >= 1);
