-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- "Passaporte do Tera": the achievement catalog, the on-chain config and what
-- the `passport` edge function needs to award and mint.
--
-- * Catalog seed: one soulbound passport page per (learner, trail), a stamp per
--   completed day, and one-off medals. Titles/descriptions in pt and en.
-- * `itera.onchain_config`: public key/value facts about the deployment (the
--   minting authority and the two collection addresses). No secret lives here.
-- * `user_achievements.mint_claimed_at`: when a mint claim was taken, so a claim
--   left behind by a crashed invocation can be retaken.
-- * The service role reads the content tree and progress to compute awards. It
--   bypasses RLS but still needs table privileges, which it did not have.
-- Idempotent.
-- ============================================================================

insert into itera.achievements (key, kind, tier, title_i18n, description_i18n, art, sort) values
  ('trail_pass', 'trail', 'bronze',
   '{"pt": "Passaporte da trilha", "en": "Trail passport"}',
   '{"pt": "Você abriu uma página no Passaporte do Tera ao concluir o primeiro dia desta trilha.", "en": "You opened a page in Tera''s Passport by finishing the first day of this trail."}',
   '{"shape": "passport"}', 10),
  ('day_stamp', 'day', 'bronze',
   '{"pt": "Carimbo do dia", "en": "Day stamp"}',
   '{"pt": "O Tera carimbou um dia concluído no seu passaporte.", "en": "Tera stamped a completed day on your passport."}',
   '{"shape": "stamp"}', 20),
  ('trail_complete', 'trail', 'gold',
   '{"pt": "Trilha concluída", "en": "Trail complete"}',
   '{"pt": "Todos os dias carimbados: a página do passaporte virou ouro.", "en": "Every day stamped: the passport page turned gold."}',
   '{"shape": "passport"}', 30),
  ('first_stamp', 'milestone', 'bronze',
   '{"pt": "Primeiro carimbo", "en": "First stamp"}',
   '{"pt": "Seu primeiro dia concluído na Itera.", "en": "Your first completed day at Itera."}',
   '{"shape": "medal", "glyph": "1", "accent": "#3FD17F"}', 40),
  ('streak_3', 'streak', 'bronze',
   '{"pt": "Sequência de 3 dias", "en": "3-day streak"}',
   '{"pt": "Três dias seguidos concluindo pelo menos um dia de trilha.", "en": "Three days in a row finishing at least one trail day."}',
   '{"shape": "medal", "glyph": "3", "accent": "#F29D4B"}', 50),
  ('streak_7', 'streak', 'silver',
   '{"pt": "Sequência de 7 dias", "en": "7-day streak"}',
   '{"pt": "Uma semana inteira sem quebrar a sequência.", "en": "A whole week without breaking the streak."}',
   '{"shape": "medal", "glyph": "7", "accent": "#F2674B"}', 60),
  ('program_complete', 'milestone', 'gold',
   '{"pt": "Programa concluído", "en": "Program complete"}',
   '{"pt": "Todas as trilhas do programa concluídas.", "en": "Every trail of the program completed."}',
   '{"shape": "medal", "glyph": "★", "accent": "#E8B84A"}', 70),
  ('early_bird', 'milestone', 'bronze',
   '{"pt": "Madrugador", "en": "Early bird"}',
   '{"pt": "Um dia concluído antes das 8h.", "en": "A day completed before 8 am."}',
   '{"shape": "medal", "glyph": "☀", "accent": "#F2C94B"}', 80),
  ('night_owl', 'milestone', 'bronze',
   '{"pt": "Coruja", "en": "Night owl"}',
   '{"pt": "Um dia concluído depois das 23h.", "en": "A day completed after 11 pm."}',
   '{"shape": "medal", "glyph": "☾", "accent": "#8B7CF6"}', 90)
on conflict (key) do update set
  kind = excluded.kind,
  tier = excluded.tier,
  title_i18n = excluded.title_i18n,
  description_i18n = excluded.description_i18n,
  art = excluded.art,
  sort = excluded.sort;

create table if not exists itera.onchain_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table itera.onchain_config enable row level security;

drop policy if exists onchain_config_read_all on itera.onchain_config;
create policy onchain_config_read_all on itera.onchain_config
  for select to anon, authenticated using (true);

revoke all on itera.onchain_config from anon, authenticated;
grant select on itera.onchain_config to anon, authenticated;
grant all on itera.onchain_config to service_role;

alter table itera.user_achievements add column if not exists mint_claimed_at timestamptz;

create index if not exists user_achievements_unminted_idx
  on itera.user_achievements (user_id) where mint_status <> 'minted';

grant usage on schema itera to service_role;
grant select on itera.programs, itera.units, itera.lessons, itera.activities,
  itera.progress, itera.identities to service_role;
