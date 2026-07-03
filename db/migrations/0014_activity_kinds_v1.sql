-- ============================================================================
-- Itera general learning-activity taxonomy v1 — add 6 activity_kind values.
-- Plan: 20260703-itera-activity-types-system (Q1 no-judge set, Q2 new enum
-- values, Q4 Itera-native names).
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- This is point 1 of the COORDINATED 3-point change. The other two:
--   2. `ActivityKind` union in iterahq/itera-player:src/types/content.ts
--   3. `ACTIVITY_KINDS` array in iterahq/itera-mcp:src/tools/activities.ts
--
-- 🚨 APPLY NOTE: `ALTER TYPE … ADD VALUE` CANNOT run inside a transaction block,
-- so this file must be applied STATEMENT-BY-STATEMENT (one autocommit query each)
-- — NOT via the txn-wrapping `itera-supabase-helpers migrate`. Use `query` per
-- line. `IF NOT EXISTS` makes each additive + idempotent (re-runnable no-op).
-- New enum values also can't be USED in the same txn they're added.
-- ============================================================================

ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'concept';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'single_choice';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'multi_choice';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'match';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'order';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'video';
