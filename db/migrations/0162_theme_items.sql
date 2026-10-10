-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Backgrounds and app icon colours: two new kinds of shop item, global per
-- learner, switched freely once owned.
--
-- * `shop_items` rows of kind `background` and `app_icon`. `effect` carries the
--   colour; `effect.default = true` marks the one everybody owns (never sold).
-- * `itera.learner_themes`: what the learner has chosen. No row = the defaults.
--
-- Additive and idempotent.
-- ============================================================================

insert into itera.shop_items (key, kind, price_lamports, price_usd_cents, price_label, price_crystals, title_i18n, description_i18n, effect, active, sort)
values
  ('bg_obsidian', 'background', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL', null,
   '{"pt": "Fundo Obsidiana", "en": "Obsidian background"}', '{"pt": "O fundo original da Itera.", "en": "The original Itera background."}',
   '{"background": "#0A0908", "default": true}', true, 100),
  ('bg_midnight', 'background', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL', 75,
   '{"pt": "Fundo Meia-noite", "en": "Midnight background"}', '{"pt": "Azul profundo para estudar até tarde.", "en": "A deep blue for late study sessions."}',
   '{"background": "#0B1020"}', true, 101),
  ('bg_grape', 'background', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL', 75,
   '{"pt": "Fundo Uva", "en": "Grape background"}', '{"pt": "Roxo escuro, calmo e diferente.", "en": "A dark, calm purple."}',
   '{"background": "#150B1F"}', true, 102),
  ('bg_ember', 'background', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL', 75,
   '{"pt": "Fundo Brasa", "en": "Ember background"}', '{"pt": "Vermelho escuro, a cor da fênix.", "en": "A dark red, the colour of the phoenix."}',
   '{"background": "#1A0C0C"}', true, 103),
  ('bg_deep_sea', 'background', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL', 75,
   '{"pt": "Fundo Mar Profundo", "en": "Deep sea background"}', '{"pt": "Verde-azulado do fundo do mar.", "en": "The teal of the deep sea."}',
   '{"background": "#06181C"}', true, 104),
  ('bg_graphite', 'background', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL', 75,
   '{"pt": "Fundo Grafite", "en": "Graphite background"}', '{"pt": "Cinza neutro, sem distração.", "en": "A neutral grey, no distraction."}',
   '{"background": "#16181C"}', true, 105),
  ('icon_green', 'app_icon', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL', null,
   '{"pt": "Ícone Verde", "en": "Green icon"}', '{"pt": "O verde da Itera.", "en": "The Itera green."}',
   '{"icon": "#3FD17F", "default": true}', true, 110),
  ('icon_gold', 'app_icon', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL', 75,
   '{"pt": "Ícone Dourado", "en": "Gold icon"}', '{"pt": "A marca do app em dourado.", "en": "The app mark in gold."}',
   '{"icon": "#F5B301"}', true, 111),
  ('icon_violet', 'app_icon', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL', 75,
   '{"pt": "Ícone Violeta", "en": "Violet icon"}', '{"pt": "A marca do app em violeta.", "en": "The app mark in violet."}',
   '{"icon": "#8B5CF6"}', true, 112),
  ('icon_cyan', 'app_icon', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL', 75,
   '{"pt": "Ícone Ciano", "en": "Cyan icon"}', '{"pt": "A marca do app em ciano.", "en": "The app mark in cyan."}',
   '{"icon": "#22D3EE"}', true, 113),
  ('icon_coral', 'app_icon', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL', 75,
   '{"pt": "Ícone Coral", "en": "Coral icon"}', '{"pt": "A marca do app em coral.", "en": "The app mark in coral."}',
   '{"icon": "#FF6B5E"}', true, 114),
  ('icon_white', 'app_icon', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL', 75,
   '{"pt": "Ícone Branco", "en": "White icon"}', '{"pt": "A marca do app em branco.", "en": "The app mark in white."}',
   '{"icon": "#FFFFFF"}', true, 115)
on conflict (key) do nothing;

create table if not exists itera.learner_themes (
  user_id        uuid primary key references itera.users(id) on delete cascade,
  background_key text references itera.shop_items(key),
  icon_key       text references itera.shop_items(key),
  updated_at     timestamptz not null default now()
);

alter table itera.learner_themes enable row level security;
drop policy if exists learner_themes_read_own on itera.learner_themes;
create policy learner_themes_read_own on itera.learner_themes
  for select to authenticated using (user_id = itera.current_itera_user_id());
revoke all on itera.learner_themes from public, anon, authenticated;
grant select on itera.learner_themes to authenticated;
grant all on itera.learner_themes to service_role;
