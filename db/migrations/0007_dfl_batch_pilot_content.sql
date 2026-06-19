-- ============================================================================
-- Itera migration 0007 — dfl-batch pilot content scope (program/unit/lesson/activity)
-- Targets ITERA Supabase (kjefmwlopzeaqgqtlbdn) ONLY. Idempotent. Plan #7.
--
-- One bilingual (PT+EN) document activity under the dfl-batch tenant, so the
-- dfl-batch tenant API key can read its OWN activity_results (tenant isolation:
-- a tenant key only sees results of users who are members of that tenant).
-- ============================================================================

do $$
declare
  v_tenant   uuid;
  v_program  uuid;
  v_unit     uuid;
  v_lesson   uuid;
  v_activity uuid;
begin
  select id into v_tenant from itera.tenants where slug = 'dfl-batch';
  if v_tenant is null then
    raise exception 'dfl-batch tenant missing — run 0006 first';
  end if;

  -- program
  insert into itera.programs (tenant_id, slug, title_i18n)
  values (v_tenant, 'dfl-pilot',
          jsonb_build_object('pt', 'Piloto DevFellowship', 'en', 'DevFellowship Pilot'))
  on conflict (tenant_id, slug) do update set title_i18n = excluded.title_i18n
  returning id into v_program;
  if v_program is null then
    select id into v_program from itera.programs where tenant_id = v_tenant and slug = 'dfl-pilot';
  end if;

  -- unit (no natural unique key → guard on (program_id, ordinal))
  select id into v_unit from itera.units where program_id = v_program and ordinal = 1;
  if v_unit is null then
    insert into itera.units (program_id, ordinal, title_i18n)
    values (v_program, 1, jsonb_build_object('pt', 'Fundamentos', 'en', 'Fundamentals'))
    returning id into v_unit;
  end if;

  -- lesson
  select id into v_lesson from itera.lessons where unit_id = v_unit and ordinal = 1;
  if v_lesson is null then
    insert into itera.lessons (unit_id, ordinal, title_i18n)
    values (v_unit, 1, jsonb_build_object('pt', 'Primeira atividade', 'en', 'First activity'))
    returning id into v_lesson;
  end if;

  -- activity (document — ADR-28 P1)
  select id into v_activity from itera.activities where lesson_id = v_lesson and ordinal = 1;
  if v_activity is null then
    insert into itera.activities (lesson_id, ordinal, kind, spec, rubric)
    values (v_lesson, 1, 'document',
            jsonb_build_object(
              'title_i18n', jsonb_build_object('pt', 'Escreva seu primeiro doc', 'en', 'Write your first doc'),
              'prompt_i18n', jsonb_build_object('pt', 'Descreva o que você aprendeu.', 'en', 'Describe what you learned.')),
            jsonb_build_object('min_words', 10))
    returning id into v_activity;
  end if;

  raise notice 'dfl-batch pilot: program=% unit=% lesson=% activity=%', v_program, v_unit, v_lesson, v_activity;
end $$;
