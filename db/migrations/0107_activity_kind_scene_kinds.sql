-- ============================================================================
-- Itera activity taxonomy — add the scene kinds `xray`, `live_type`, `inspect`.
--
-- Three gesture-gated, animated activity kinds over one small page: the learner
-- sweeps a lens (`xray`), types inside a tag (`live_type`) or points at the
-- page↔source twins (`inspect`), and only then the concept is named. Separate
-- kinds rather than one `scene` kind with a template discriminator (Tainan,
-- 2026-09-24: "criar novos Activity Types para não misturar com os já
-- existentes"). Plan: 20260924-itera-scene-animacoes-interativas.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- Point 1 of the coordinated 3-point change. The other two:
--   2. `@iterahq/activity-spec` 1.3.0 (`ACTIVITY_KINDS` + the three schemas),
--      re-exported by iterahq/itera-player:src/types/content.ts
--   3. `ACTIVITY_KINDS` in iterahq/itera-mcp:src/tools/activities.ts (imports the package)
--
-- 🚨 APPLY NOTE: a value added by `ALTER TYPE … ADD VALUE` cannot be USED in the
-- transaction that added it. Nothing here uses it. `IF NOT EXISTS` keeps each
-- statement additive and idempotent. Postgres has no DROP VALUE: these labels
-- are permanent once applied.
-- ============================================================================

ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'xray';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'live_type';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'inspect';
