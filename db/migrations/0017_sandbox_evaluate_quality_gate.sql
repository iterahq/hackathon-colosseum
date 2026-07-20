-- ============================================================================
-- P0-3 — sandbox_scenario quality gate on the SUCCESS-gating evaluate step.
-- Plan: 20260717-itera-aula-piloto-feedback (Q P0-3, answer A). The evaluate
-- step that gates `success` unlocked on `evaluated:{correct:true}` alone — a
-- learner could pick a weak addition, honestly rate it "ruim", and still
-- complete. This adds `resultQualityReached:"top"` so completion also requires
-- the answer to actually be good.
--
-- APPLIED ONLY to the 10 POSITIVE with-context activities (the intended good
-- path ends in quality "top"). The negative/drill scenarios are intentionally
-- LEFT UNCHANGED: c4 / c4b (avaliar-poluido — success IS recognizing that
-- polluting makes it worse, final "ruim") and every no-context drill
-- (avaliar-vago / -sem-persona / -sem-exemplo / -generico / -vazio / -limpo)
-- whose gated run is legitimately weak.
--
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
-- Idempotent: each UPDATE is guarded by the step id at the fixed index and
-- re-sets the unlock to the SAME gated value (re-run = no-op).
-- ============================================================================

update itera.activities
   set spec = jsonb_set(spec, '{steps,3,unlock}', '{"all": [{"ranPromptCount": {"gte": 2}}, {"evaluated": {"correct": true}}, {"resultQualityReached": "top"}]}'::jsonb)
 where id = 'c5ea6ce3-643f-4dbc-833e-eeb36f8f79a1'
   and kind = 'sandbox_scenario'
   and spec #>> '{steps,3,id}' = 'avaliar-especifico';  -- c1
update itera.activities
   set spec = jsonb_set(spec, '{steps,3,unlock}', '{"all": [{"ranPromptCount": {"gte": 2}}, {"evaluated": {"correct": true}}, {"resultQualityReached": "top"}]}'::jsonb)
 where id = '0ab5cfd6-25a0-41f1-a069-e96e3be711e4'
   and kind = 'sandbox_scenario'
   and spec #>> '{steps,3,id}' = 'avaliar-com-persona';  -- c2
update itera.activities
   set spec = jsonb_set(spec, '{steps,1,unlock}', '{"all": [{"ranPromptCount": {"gte": 1}}, {"evaluated": {"correct": true}}, {"resultQualityReached": "top"}]}'::jsonb)
 where id = '2746fb22-4c9f-4337-9a01-8a8dc90e89c8'
   and kind = 'sandbox_scenario'
   and spec #>> '{steps,1,id}' = 'avaliar-especifico';  -- c1b
update itera.activities
   set spec = jsonb_set(spec, '{steps,3,unlock}', '{"all": [{"ranPromptCount": {"gte": 2}}, {"evaluated": {"correct": true}}, {"resultQualityReached": "top"}]}'::jsonb)
 where id = '569daab4-ee24-4ab4-a6d0-81279cf8dccb'
   and kind = 'sandbox_scenario'
   and spec #>> '{steps,3,id}' = 'avaliar-com-exemplo';  -- c3
update itera.activities
   set spec = jsonb_set(spec, '{steps,1,unlock}', '{"all": [{"ranPromptCount": {"gte": 1}}, {"evaluated": {"correct": true}}, {"resultQualityReached": "top"}]}'::jsonb)
 where id = '595bb09e-4b56-4b68-8589-69e48410eeb6'
   and kind = 'sandbox_scenario'
   and spec #>> '{steps,1,id}' = 'avaliar-com-persona';  -- c2b
update itera.activities
   set spec = jsonb_set(spec, '{steps,3,unlock}', '{"all": [{"ranPromptCount": {"gte": 2}}, {"evaluated": {"correct": true}}, {"resultQualityReached": "top"}]}'::jsonb)
 where id = '27ad8459-53e4-4c59-bba8-2b9c22dad77c'
   and kind = 'sandbox_scenario'
   and spec #>> '{steps,3,id}' = 'avaliar-personalizado';  -- c5
update itera.activities
   set spec = jsonb_set(spec, '{steps,3,unlock}', '{"all": [{"ranPromptCount": {"gte": 2}}, {"evaluated": {"correct": true}}, {"resultQualityReached": "top"}]}'::jsonb)
 where id = '6d5e885b-1e5f-4c69-8b7c-23ca12302479'
   and kind = 'sandbox_scenario'
   and spec #>> '{steps,3,id}' = 'avaliar-completo';  -- c6
update itera.activities
   set spec = jsonb_set(spec, '{steps,1,unlock}', '{"all": [{"ranPromptCount": {"gte": 1}}, {"evaluated": {"correct": true}}, {"resultQualityReached": "top"}]}'::jsonb)
 where id = '3e6b7423-0547-429a-9d39-0de0fb0bd8bb'
   and kind = 'sandbox_scenario'
   and spec #>> '{steps,1,id}' = 'avaliar-com-exemplo';  -- c3b
update itera.activities
   set spec = jsonb_set(spec, '{steps,1,unlock}', '{"all": [{"ranPromptCount": {"gte": 1}}, {"evaluated": {"correct": true}}, {"resultQualityReached": "top"}]}'::jsonb)
 where id = '2bd230e1-d4a5-4022-be8d-d3dc4187f5d4'
   and kind = 'sandbox_scenario'
   and spec #>> '{steps,1,id}' = 'avaliar-personalizado';  -- c5b
update itera.activities
   set spec = jsonb_set(spec, '{steps,1,unlock}', '{"all": [{"ranPromptCount": {"gte": 1}}, {"evaluated": {"correct": true}}, {"resultQualityReached": "top"}]}'::jsonb)
 where id = '93933650-da95-4632-800e-2eb385e129c6'
   and kind = 'sandbox_scenario'
   and spec #>> '{steps,1,id}' = 'avaliar-completo';  -- c6b
