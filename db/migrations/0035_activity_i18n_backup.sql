-- 0035_activity_i18n_backup.sql
--
-- Reversibility ledger for the bulk EN-locale backfill (`scripts/i18n/activity-i18n.ts`).
--
-- The backfill rewrites authored jsonb in place: plain Portuguese strings inside
-- `itera.activities.spec|rubric` and `itera.activity_defs.spec|rubric|title_i18n`
-- become `{ "pt": <original>, "en": <translation> }` bags, and bags whose `en`
-- merely mirrored `pt` get a real translation. Those are lossy edits to authored
-- content, so every touched row's PRE-STATE is captured here FIRST, in the same
-- transaction as the write. `activity-i18n.ts revert --batch <id>` restores from
-- this table verbatim.
--
-- This is an operational ledger, not content: rows are expected to accumulate one
-- generation per backfill run and may be pruned once a run is confirmed good.

create table if not exists itera.activity_i18n_backup (
  id            bigserial primary key,
  -- Which run produced this snapshot. One uuid per `apply` invocation, so a
  -- revert can target exactly one generation and leave earlier ones intact.
  batch_id      uuid        not null,
  -- 'activities' | 'activity_defs' — the table the row_id belongs to.
  source_table  text        not null,
  row_id        uuid        not null,
  -- Verbatim pre-state. `title_i18n` is NULL for `activities` (no such column).
  spec          jsonb       not null,
  rubric        jsonb       not null,
  title_i18n    jsonb,
  created_at    timestamptz not null default now(),

  constraint activity_i18n_backup_source_table_chk
    check (source_table in ('activities', 'activity_defs'))
);

-- One snapshot per row per batch: makes `apply` idempotent (a re-run of the same
-- batch cannot stack duplicate pre-states and corrupt the revert target).
create unique index if not exists activity_i18n_backup_batch_row_uidx
  on itera.activity_i18n_backup (batch_id, source_table, row_id);

create index if not exists activity_i18n_backup_row_idx
  on itera.activity_i18n_backup (source_table, row_id);

comment on table itera.activity_i18n_backup is
  'Pre-state snapshots for bulk i18n backfills of activity content. Written by scripts/i18n/activity-i18n.ts apply; consumed by its revert. Operational ledger, safe to prune once a run is confirmed.';

-- Ops-only table: no tenant reads it, and the backfill runs as `postgres`. RLS on
-- with NO permissive policy = deny-by-default for `authenticated`/`anon`, which is
-- the correct posture for a table holding a full copy of authored content.
alter table itera.activity_i18n_backup enable row level security;
