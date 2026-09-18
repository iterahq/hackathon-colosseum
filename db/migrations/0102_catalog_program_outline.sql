-- ============================================================================
-- Itera migration 0102 — itera.catalog_program_outline(p_slug): the syllabus of
-- one self-serve catalog program, readable before enrollment.
-- This applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- It is NOT dfl-schema. It is NOT DFL production. ADR-3 / ADR-26. Idempotent.
--
-- WHY
-- ---
-- A signed-in "visitor" (no membership in the program's tenant) can list the
-- catalog through itera.catalog_programs() (0012), but tenant RLS on
-- itera.units / itera.lessons hides the syllabus until they enroll. This
-- function returns the syllabus of ONE catalog program — titles only — so the
-- visitor can see what the program covers before deciding.
--
-- WHAT IT RETURNS
-- ---------------
-- One row per lesson, carrying its unit and program fields, ordered by unit
-- ordinal then lesson ordinal (ids break ties). Both joins are LEFT joins, so:
--   * a unit without lessons yields one row with NULL lesson fields;
--   * a catalog program without units yields one row with NULL unit fields.
-- Zero rows therefore means exactly "no live catalog program has this slug".
--
-- `lesson_activity_count` counts PUBLISHED activities only: a draft is not
-- part of the syllabus a learner will get, and the RLS on itera.activities
-- hides drafts from learners for the same reason.
--
-- WHAT IT NEVER RETURNS
-- ---------------------
-- No activity kind, spec, rubric or any other content. No tenant id. Nothing at
-- all for a program that is not is_catalog = true or that is archived.
--
-- SLUG IS UNIQUE PER TENANT, NOT GLOBALLY
-- ---------------------------------------
-- The constraint is programs_tenant_id_slug_key UNIQUE (tenant_id, slug). Two
-- live catalog programs in different tenants could therefore share a slug
-- (none do today — checked read-only against production, 2026-09-18). The
-- function resolves the slug to ONE program deterministically: the oldest by
-- created_at, then the lowest id.
--
-- GRANTS
-- ------
-- EXECUTE to `authenticated` only. The visitor is signed in. `anon` does not
-- get it: migration 0063 lists what `anon` keeps, and this function is not on
-- that list. `revoke ... from public, anon` removes the PUBLIC default that
-- CREATE FUNCTION grants and any schema default privilege that reached anon.
--
-- DB stays thin: a filtered SELECT, nothing else. Grouping into units happens
-- in src/services/catalogOutline.service.ts.
--
-- IDEMPOTENCY: `create or replace function`, `revoke`, `grant` and
-- `comment on` are all repeatable.
-- ============================================================================

create or replace function itera.catalog_program_outline(p_slug text)
returns table (
  program_id uuid,
  program_slug text,
  program_title_i18n jsonb,
  unit_id uuid,
  unit_ordinal integer,
  unit_title_i18n jsonb,
  lesson_id uuid,
  lesson_ordinal integer,
  lesson_title_i18n jsonb,
  lesson_activity_count bigint
)
language sql
stable
security definer
set search_path = itera, public
as $$
  with program as (
    select p.id, p.slug, p.title_i18n
    from itera.programs p
    where p.slug = p_slug
      and p.is_catalog = true
      and p.archived_at is null
    order by p.created_at asc, p.id asc
    limit 1
  )
  select
    p.id,
    p.slug,
    p.title_i18n,
    u.id,
    u.ordinal,
    u.title_i18n,
    l.id,
    l.ordinal,
    l.title_i18n,
    case when l.id is null then null else (
      select count(*) from itera.activities a
      where a.lesson_id = l.id
        and a.status = 'published'
    ) end
  from program p
  left join itera.units u on u.program_id = p.id
  left join itera.lessons l on l.unit_id = u.id
  order by u.ordinal asc nulls last, u.id asc nulls last,
           l.ordinal asc nulls last, l.id asc nulls last;
$$;

revoke all on function itera.catalog_program_outline(text) from public, anon;
grant execute on function itera.catalog_program_outline(text) to authenticated;

comment on function itera.catalog_program_outline(text) is
  'Syllabus (unit and lesson titles, published activity count) of ONE live '
  'self-serve catalog program, by slug, for a signed-in visitor without a '
  'membership. One row per lesson; zero rows for a non-catalog, archived or '
  'unknown slug. Never returns activity content or tenant ids. Migration 0102.';
