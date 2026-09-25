-- itera:no-transaction
-- ============================================================================
-- Itera activity taxonomy — add the 19 behaviour kinds of the one-behaviour
-- rule. One activity type = one behaviour (input · grading · completion · step
-- pattern). Plan: 20260924-activity-type-one-behavior-rule (v3), ADR-1 + ADR-4,
-- task T15.
--
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- WHY
-- ---
-- Five kinds hold more than one behaviour today, and the spec SHAPE picks the
-- renderer: `code` (open editor vs guided blanks by bank / select / text),
-- `chat_sandbox` (slots vs context chips), `terminal_sandbox` (type vs pick vs
-- assemble), `document` (read vs reflection vs AI judge), plus the `spec.byoc`
-- layer on a host kind. Tainan, TG 2026-09-24 msg 19287: "deixar um
-- activitytype diferente SEMPRE q comportamento for diferente". Round 1,
-- Q1 = B: every behaviour gets a NEW, explicit id; the old ids go to a
-- transition list. Q4 = A: BYOC becomes three kinds.
--
-- THE LABELS ARE PERMANENT
-- ------------------------
-- Postgres has no `ALTER TYPE ... DROP VALUE`. The names below are the
-- contract. Tainan approves them before this file merges (plans-app question
-- "Approve the 19 new activity_kind names"). The three `question_*` kinds get
-- NO label: nothing stores `question` (ADR-6 of 20260828-itera-learning-engine-v1).
--
-- WHAT THIS FILE DOES **NOT** DO
-- ------------------------------
-- 1. NO DML. It moves no row. The remap (82 activities / 35 defs by id) runs
--    through the itera-mcp tool `remap_activity_kind` with an author user-JWT
--    (plan T17-T19), never in a migration.
-- 2. It retires NO old kind. `code`, `chat_sandbox`, `terminal_sandbox` and
--    `document` stay valid until db/scripts/audit-activity-behaviours.sql shows
--    0 rows on them (plan T20).
--
-- 🚨 APPLY NOTE — why line 1 is `-- itera:no-transaction`
-- ------------------------------------------------------
-- Same pattern as 0057: mode `none` (autocommit, statement by statement), see
-- db/scripts/tx-mode.sh. `IF NOT EXISTS` on every statement makes a re-run
-- after a partial apply harmless. Nothing here USES a new value, so the
-- "new enum values must be committed before they can be used" rule is not hit.
--
-- Order below = `enumsortorder` = the order in db/census/expected-schema.txt.
-- ============================================================================

ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'code_editor_checks';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'code_editor_ungraded';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'code_fill_bank';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'code_fill_select';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'code_fill_type';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'chat_compose';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'chat_fill_select';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'chat_fill_type';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'chat_pick_context';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'chat_rate_reply';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'terminal_type_command';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'terminal_pick_command';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'terminal_build_command';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'document_read';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'document_reflect';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'document_ai_judge';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'byoc_pick_best';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'byoc_judge_each';
ALTER TYPE itera.activity_kind ADD VALUE IF NOT EXISTS 'byoc_build_context';
