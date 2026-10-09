-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Video courses: a library of courses, each with a teacher and a playlist of
-- videos, plus the lessons a learner marked as watched.
--
-- Courses and lessons are public marketing content (anon + authenticated read).
-- `video_progress` is per learner: select / insert / delete on own rows only.
-- Seeding lives in scripts/hackathon/seed-video-courses.mjs (psql, owner role).
-- The database only stores: no functions, no triggers. Idempotent.
-- ============================================================================

create table if not exists itera.video_courses (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  title              text not null,
  description        text not null default '',
  thumbnail_url      text,
  teacher_name       text not null,
  teacher_avatar_url text,
  position           int not null default 0,
  created_at         timestamptz not null default now()
);

create table if not exists itera.video_lessons (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references itera.video_courses(id) on delete cascade,
  title            text not null,
  description      text not null default '',
  video_url        text not null,
  duration_seconds int not null default 0,
  position         int not null default 0
);

create index if not exists video_lessons_course_idx on itera.video_lessons (course_id, position);

create table if not exists itera.video_progress (
  user_id      uuid not null references itera.users(id) on delete cascade,
  lesson_id    uuid not null references itera.video_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists video_progress_lesson_idx on itera.video_progress (lesson_id);

alter table itera.video_courses enable row level security;
alter table itera.video_lessons enable row level security;
alter table itera.video_progress enable row level security;

drop policy if exists video_courses_read_all on itera.video_courses;
create policy video_courses_read_all on itera.video_courses
  for select to anon, authenticated using (true);

drop policy if exists video_lessons_read_all on itera.video_lessons;
create policy video_lessons_read_all on itera.video_lessons
  for select to anon, authenticated using (true);

drop policy if exists video_progress_select_own on itera.video_progress;
create policy video_progress_select_own on itera.video_progress
  for select to authenticated using (user_id = itera.current_itera_user_id());

drop policy if exists video_progress_insert_own on itera.video_progress;
create policy video_progress_insert_own on itera.video_progress
  for insert to authenticated with check (user_id = itera.current_itera_user_id());

drop policy if exists video_progress_delete_own on itera.video_progress;
create policy video_progress_delete_own on itera.video_progress
  for delete to authenticated using (user_id = itera.current_itera_user_id());

revoke all on itera.video_courses, itera.video_lessons, itera.video_progress from anon, authenticated;
grant select on itera.video_courses, itera.video_lessons to anon, authenticated;
grant select, insert, delete on itera.video_progress to authenticated;
grant all on itera.video_courses, itera.video_lessons, itera.video_progress to service_role;
