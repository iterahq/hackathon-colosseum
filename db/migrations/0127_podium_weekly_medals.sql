-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Live-class podium medals and the weekly-goal medal.
--
-- * Catalog: `podium_1` / `podium_2` / `podium_3` (one soulbound medal per
--   place of an ended live class; `ref_id` = the class session) and
--   `weekly_goal` (20 activities in seven days, once per ISO week of
--   America/Sao_Paulo; `ref_id` = a uuid derived from the week).
-- * `itera.class_podiums`: the podium of a session, fixed by the first
--   instructor call of `class-podium`. One row per session, so a session mints
--   three medals at most, ever. No client reads it: the function answers.
-- * One medal per place and session, whoever asks and however often.
--
-- Ranking and authorization live in TypeScript (`_shared/podium.ts`,
-- `_shared/staff.ts`). Only the service role writes. Idempotent.
-- ============================================================================

insert into itera.achievements (key, kind, tier, title_i18n, description_i18n, art, sort) values
  ('podium_1', 'milestone', 'gold',
   '{"pt": "1º lugar na aula ao vivo", "en": "1st place in a live class"}',
   '{"pt": "Terminou uma aula ao vivo da Itera em 1º lugar.", "en": "Finished an Itera live class in 1st place."}',
   '{"shape": "medal", "glyph": "1", "accent": "#3FD17F"}', 120),
  ('podium_2', 'milestone', 'silver',
   '{"pt": "2º lugar na aula ao vivo", "en": "2nd place in a live class"}',
   '{"pt": "Terminou uma aula ao vivo da Itera em 2º lugar.", "en": "Finished an Itera live class in 2nd place."}',
   '{"shape": "medal", "glyph": "2", "accent": "#3FD17F"}', 121),
  ('podium_3', 'milestone', 'bronze',
   '{"pt": "3º lugar na aula ao vivo", "en": "3rd place in a live class"}',
   '{"pt": "Terminou uma aula ao vivo da Itera em 3º lugar.", "en": "Finished an Itera live class in 3rd place."}',
   '{"shape": "medal", "glyph": "3", "accent": "#3FD17F"}', 122),
  ('weekly_goal', 'milestone', 'bronze',
   '{"pt": "Meta da semana", "en": "Weekly goal"}',
   '{"pt": "20 atividades concluídas em 7 dias.", "en": "20 activities completed in 7 days."}',
   '{"shape": "medal", "glyph": "20", "accent": "#3FD17F"}', 130)
on conflict (key) do update set
  kind = excluded.kind,
  tier = excluded.tier,
  title_i18n = excluded.title_i18n,
  description_i18n = excluded.description_i18n,
  art = excluded.art,
  sort = excluded.sort;

create table if not exists itera.class_podiums (
  session_id  uuid primary key references itera.class_sessions(id) on delete cascade,
  tenant_id   uuid not null references itera.tenants(id) on delete cascade,
  recorded_by uuid not null references itera.users(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  -- [{ "position": 1, "user_id": "…", "correct": 3, "answered": 3 }], at most three.
  places      jsonb not null default '[]'::jsonb check (jsonb_typeof(places) = 'array' and jsonb_array_length(places) <= 3)
);

alter table itera.class_podiums enable row level security;
revoke all on itera.class_podiums from anon, authenticated;
grant all on itera.class_podiums to service_role;

-- A place of a session belongs to one learner.
create unique index if not exists user_achievements_one_per_podium_place_idx
  on itera.user_achievements (achievement_key, ref_id)
  where achievement_key in ('podium_1', 'podium_2', 'podium_3');

-- What `class-podium` reads with the service role (grants on these tables predate the service-role functions).
grant select on itera.class_sessions, itera.class_answers, itera.class_attendance, itera.class_guests, itera.memberships, itera.lessons, itera.users to service_role;
