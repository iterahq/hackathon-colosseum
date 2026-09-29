-- ============================================================================
-- Itera activity taxonomy — add the 11 scene-mechanics kinds.
--
-- One MECHANIC ported from dfl-labs (`itera-cenas-a1f3/_src/src/mechanics/
-- *Beat.tsx`) per kind, under the one-behaviour rule (plan
-- `20260924-itera-activity-type-one-behavior-rule`): a labs "scene" was
-- several mechanics in a row, so each mechanic becomes its own Activity Type
-- rather than one `scene` kind with a template discriminator — same call
-- Tainan made for `xray` / `live_type` / `inspect` (0107).
-- Plan: `20260924-itera-scene-mechanics-kinds`. Spec: iterahq/activity-spec#54.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- Batch A (itera-player PR feat/scene-mechanics-kinds): dial, plug, selector,
-- timeline, arrange, press.
-- Batch B (same PR, appended by the sibling agent): wire, spot, bucket,
-- intercept, query.
--
-- The app dispatches these kinds from `@iterahq/activity-spec` 1.4.0, the
-- first release whose `ActivityKind` union carries them.
--
-- 🚨 APPLY NOTE: a value added by `ALTER TYPE … ADD VALUE` cannot be USED in
-- the transaction that added it. Nothing here uses it. `IF NOT EXISTS` keeps
-- each statement additive and idempotent. Postgres has no DROP VALUE: these
-- labels are permanent once applied.
--
-- (0104 is the behaviour kinds, 0106 is taken by another branch, 0107 is the
-- scene kinds — this one is 0108.)
-- ============================================================================

ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'dial';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'plug';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'selector';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'timeline';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'arrange';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'press';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'wire';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'spot';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'bucket';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'intercept';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'query';
