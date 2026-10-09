-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Display rename: "Passaporte do Tera" becomes "Certificações do Tera" /
-- "Tera's Certifications"; one trail's page is a "Certificação" /
-- "Certification". Stamps keep their name.
--
-- Text only: keys, tables, routes and on-chain attribute keys do not change.
-- Idempotent.
-- ============================================================================

update itera.achievements set
  title_i18n = '{"pt": "Certificação", "en": "Certification"}',
  description_i18n = '{"pt": "Você abriu uma certificação nas Certificações do Tera ao concluir o primeiro dia desta trilha.", "en": "You opened a certification in Tera''s Certifications by finishing the first day of this trail."}'
where key = 'trail_pass';

update itera.achievements set
  description_i18n = '{"pt": "O Tera carimbou um dia concluído na sua certificação.", "en": "Tera stamped a completed day on your certification."}'
where key = 'day_stamp';

update itera.achievements set
  description_i18n = '{"pt": "Todos os dias carimbados: a certificação virou ouro.", "en": "Every day stamped: the certification turned gold."}'
where key = 'trail_complete';
