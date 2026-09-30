-- ============================================================================
-- Itera activity taxonomy — add the 4 system kinds.
--
-- Tainan's Week 1 proposal (2026-09-30): one micro-app (a Task List) seen
-- through four lenses — parts, composition, state, events. One cognitive
-- operation per kind, under the one-behaviour rule (plan
-- `20260924-itera-activity-type-one-behavior-rule`):
--   decompose_canvas · compose_blocks · state_lab · event_trace
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- The app dispatches these kinds through the package's own `SYSTEM_KINDS`
-- release gate until `@iterahq/activity-spec` releases them (sibling PR).
--
-- 🚨 APPLY NOTE: a value added by `ALTER TYPE … ADD VALUE` cannot be USED in
-- the transaction that added it. Nothing here uses it. `IF NOT EXISTS` keeps
-- each statement additive and idempotent. Postgres has no DROP VALUE: these
-- labels are permanent once applied.
-- ============================================================================

ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'decompose_canvas';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'compose_blocks';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'state_lab';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'event_trace';
