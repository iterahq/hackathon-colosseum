-- 0251: the first lesson of "Web do Zero" is readable with no account (the public "try Day 1").
--
-- A visitor without a session reads with the `anon` role, whose only content policy is tenant-scoped and
-- answers nothing. These two permissive policies open ONE lesson (Week 1 · HTML · Day 1 of program
-- `itera-v2`) and its published activities, nothing else: no unit, no program, no other lesson, no progress.
-- The answer keys of the simple kinds already reach every learner's browser (README, "Known limits") and a
-- wallet sign-in is free, so this exposes nothing a visitor could not get in one click. Grading for a guest
-- is the `grade` function's business; this file only lets the page draw the lesson.
-- Undo: drop policy lessons_guest_day1 on itera.lessons; drop policy activities_guest_day1 on itera.activities;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'itera' and tablename = 'lessons' and policyname = 'lessons_guest_day1') then
    create policy lessons_guest_day1 on itera.lessons
      for select to anon
      using (id = '0e7d6618-f9ba-46ba-bf28-71cf86f32716');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'itera' and tablename = 'activities' and policyname = 'activities_guest_day1') then
    create policy activities_guest_day1 on itera.activities
      for select to anon
      using (lesson_id = '0e7d6618-f9ba-46ba-bf28-71cf86f32716' and status = 'published');
  end if;
end $$;
