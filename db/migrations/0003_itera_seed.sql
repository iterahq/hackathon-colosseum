-- ============================================================================
-- Itera seed v1 — pilot tenant + 1 Program / 1 Unit / 1 Lesson / activities,
-- plus a second tenant for tenant-isolation testing (ADR-103 gate 6).
-- Idempotent (slug-keyed upserts).
-- The seeded auth user + itera.users + itera.identities link is created
-- separately by db/scripts/seed-smoke-user.sh (needs service-role + auth admin).
-- ============================================================================

-- Tenant A — the pilot (default Itera branding).
insert into itera.tenants (slug, name, branding)
values (
  'itera',
  'Itera',
  '{"primary_color":"#030213","logo_url":null,"login_bg":null}'::jsonb
)
on conflict (slug) do update set name = excluded.name, branding = excluded.branding;

-- Tenant B — for cross-tenant isolation tests (distinct branding).
insert into itera.tenants (slug, name, branding)
values (
  'acme',
  'Acme Academy',
  '{"primary_color":"#d4183d","logo_url":null,"login_bg":null}'::jsonb
)
on conflict (slug) do update set name = excluded.name, branding = excluded.branding;

-- Pilot Program -> Unit -> Lesson -> Activities (1x5x5 shell, ADR-13) for tenant A.
insert into itera.programs (tenant_id, slug, title_i18n)
select t.id, 'fundamentos-web', '{"pt":"Fundamentos da Web","en":"Web Fundamentals"}'::jsonb
from itera.tenants t where t.slug = 'itera'
on conflict (tenant_id, slug) do nothing;

-- One unit.
insert into itera.units (program_id, ordinal, title_i18n)
select p.id, 1, '{"pt":"HTML & Estrutura","en":"HTML & Structure"}'::jsonb
from itera.programs p
join itera.tenants t on t.id = p.tenant_id
where t.slug = 'itera' and p.slug = 'fundamentos-web'
  and not exists (
    select 1 from itera.units u where u.program_id = p.id and u.ordinal = 1
  );

-- One lesson.
insert into itera.lessons (unit_id, ordinal, title_i18n)
select u.id, 1, '{"pt":"Primeira página HTML","en":"Your first HTML page"}'::jsonb
from itera.units u
join itera.programs p on p.id = u.program_id
join itera.tenants t on t.id = p.tenant_id
where t.slug = 'itera' and p.slug = 'fundamentos-web' and u.ordinal = 1
  and not exists (
    select 1 from itera.lessons l where l.unit_id = u.id and l.ordinal = 1
  );

-- A few activities (diagram + document + code) for the pilot lesson.
insert into itera.activities (lesson_id, ordinal, kind, spec, rubric)
select l.id, v.ordinal, v.kind::itera.activity_kind, v.spec::jsonb, '{}'::jsonb
from itera.lessons l
join itera.units u on u.id = l.unit_id
join itera.programs p on p.id = u.program_id
join itera.tenants t on t.id = p.tenant_id
cross join (values
  (1, 'document', '{"prompt":"Descreva a estrutura de um documento HTML."}'),
  (2, 'diagram',  '{"prompt":"Diagrama da árvore DOM."}'),
  (3, 'code',     '{"language":"html","starter":"<!doctype html>"}')
) as v(ordinal, kind, spec)
where t.slug = 'itera' and p.slug = 'fundamentos-web' and u.ordinal = 1 and l.ordinal = 1
  and not exists (
    select 1 from itera.activities a where a.lesson_id = l.id and a.ordinal = v.ordinal
  );

-- Tenant B gets its own (different) program so isolation tests have distinct data.
insert into itera.programs (tenant_id, slug, title_i18n)
select t.id, 'acme-onboarding', '{"pt":"Onboarding Acme","en":"Acme Onboarding"}'::jsonb
from itera.tenants t where t.slug = 'acme'
on conflict (tenant_id, slug) do nothing;
