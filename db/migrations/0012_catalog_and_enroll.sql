-- ============================================================================
-- Itera migration 0012 — self-serve catalog + enrollment
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY. NOT DFL prod.
-- Plan: 20260625-itera-loop-engineering-quality (round-1 finding #1/#2:
--   discovery + enrollment). Related: 20260624-itera-plg-subscribe-flow,
--   20260619-itera-batches-master-plan (GTM reference-case -> PLG self-serve).
--
-- WHY: a self-serve (PLG) user is provisioned into their OWN personal tenant
-- (plg-<uid>) and the flagship course `modele-dados-com-ia` lives under tenant
-- `itera`. RLS `programs_select_tenant` scopes program reads to the caller's
-- tenant memberships, so a PLG user can NEVER see/discover/enroll the flagship.
-- The round-1 focus-group confirmed all three personas dead-ended here.
--
-- WHAT this adds (RLS-safe, least-privilege):
--   1. `itera.programs.is_catalog` boolean — marks programs offered in the
--      public self-serve catalog. Defaults false (existing private/tenant
--      programs unchanged). Flagship `itera`-tenant courses are flagged true.
--   2. `itera.catalog_programs()` SECURITY DEFINER — returns catalog programs
--      (with derived counts + tenant slug + already_enrolled) regardless of the
--      caller's tenant memberships. READ-ONLY; only ever exposes is_catalog=true
--      rows, so it cannot leak private content. This is the ONLY membership-
--      independent read path (browsing the catalog before enrolling).
--   3. `itera.enroll_in_program(p_program_id)` SECURITY DEFINER — creates a
--      `learner` membership in the catalog program's tenant for the current
--      user. Idempotent (ON CONFLICT DO NOTHING). REFUSES non-catalog programs
--      (so it cannot be abused to self-grant access to private tenants). After
--      enroll, the normal tenant RLS lets the user see + play the course.
--
-- Scope/safety:
--   - No existing RLS policy is weakened. Tenant isolation stays intact for the
--     normal read path; the catalog function is a deliberate, narrow, read-only
--     bypass restricted to is_catalog=true rows.
--   - enroll only ever inserts a `learner` membership and only for catalog
--     programs; it never grants instructor/admin/owner and never touches private
--     tenants.
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Catalog flag on programs.
-- ---------------------------------------------------------------------------
alter table itera.programs
  add column if not exists is_catalog boolean not null default false;

-- Flag the self-serve catalog courses. The `itera`-tenant programs are the
-- flagship public catalog (modele-dados-com-ia + the showcase courses).
-- Idempotent: re-running just re-sets the same flag.
update itera.programs p
set is_catalog = true
from itera.tenants t
where t.id = p.tenant_id
  and t.slug = 'itera';

-- ---------------------------------------------------------------------------
-- 2) catalog_programs() — membership-independent READ of catalog courses.
--    SECURITY DEFINER so it can read across tenants, but it ONLY returns
--    is_catalog=true rows (cannot leak private content). Marks rows the caller
--    is already enrolled in (so the UI can show "Continuar" vs "Matricular").
-- ---------------------------------------------------------------------------
create or replace function itera.catalog_programs()
returns table (
  id uuid,
  tenant_id uuid,
  tenant_slug text,
  slug text,
  title_i18n jsonb,
  created_at timestamptz,
  unit_count bigint,
  lesson_count bigint,
  activity_count bigint,
  already_enrolled boolean
)
language sql
stable
security definer
set search_path = itera, public
as $$
  select
    p.id,
    p.tenant_id,
    t.slug as tenant_slug,
    p.slug,
    p.title_i18n,
    p.created_at,
    (select count(*) from itera.units u where u.program_id = p.id) as unit_count,
    (select count(*) from itera.lessons l
       join itera.units u on u.id = l.unit_id
       where u.program_id = p.id) as lesson_count,
    (select count(*) from itera.activities a
       join itera.lessons l on l.id = a.lesson_id
       join itera.units u on u.id = l.unit_id
       where u.program_id = p.id) as activity_count,
    exists (
      select 1 from itera.memberships m
      where m.user_id = itera.current_itera_user_id()
        and m.tenant_id = p.tenant_id
    ) as already_enrolled
  from itera.programs p
  join itera.tenants t on t.id = p.tenant_id
  where p.is_catalog = true
  order by p.created_at asc;
$$;

grant execute on function itera.catalog_programs() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) enroll_in_program() — self-enroll into a CATALOG program's tenant.
--    SECURITY DEFINER so it can insert a membership the caller's RLS would
--    otherwise block. Hardened: resolves the caller's itera user id, REFUSES
--    non-catalog programs, only ever grants `learner`, idempotent.
-- ---------------------------------------------------------------------------
-- DROP first: CREATE OR REPLACE cannot change OUT-parameter names, so a re-run
-- after an OUT-name change would error. Dropping makes the migration re-runnable.
drop function if exists itera.enroll_in_program(uuid);

create or replace function itera.enroll_in_program(p_program_id uuid)
returns table (out_tenant_id uuid, out_role itera.member_role, out_enrolled boolean)
language plpgsql
volatile
security definer
set search_path = itera, public
as $$
declare
  v_user_id uuid;
  v_tenant_id uuid;
  v_is_catalog boolean;
  v_inserted_count int := 0;
begin
  v_user_id := itera.current_itera_user_id();
  if v_user_id is null then
    raise exception 'not authenticated (no itera user)';
  end if;

  -- Resolve the program's tenant and verify it is a catalog program. This is
  -- the security gate: a caller can ONLY self-enroll into catalog courses, so
  -- this can never be abused to join an arbitrary private tenant.
  select p.tenant_id, p.is_catalog
    into v_tenant_id, v_is_catalog
  from itera.programs p
  where p.id = p_program_id;

  if v_tenant_id is null then
    raise exception 'program not found';
  end if;
  if not coalesce(v_is_catalog, false) then
    raise exception 'program is not in the self-serve catalog';
  end if;

  -- Idempotent learner enrollment. ON CONFLICT (existing membership of any role)
  -- is a no-op — we never downgrade an existing admin/owner to learner.
  insert into itera.memberships (user_id, tenant_id, role)
  values (v_user_id, v_tenant_id, 'learner')
  on conflict (user_id, tenant_id) do nothing;

  get diagnostics v_inserted_count = row_count;

  -- OUT params are renamed (out_*) to avoid collision with the membership
  -- columns referenced below (a same-named OUT param vs m.tenant_id is the
  -- "column reference is ambiguous" trap).
  return query
    select m.tenant_id, m.role, (v_inserted_count > 0)
    from itera.memberships m
    where m.user_id = v_user_id and m.tenant_id = v_tenant_id;
end;
$$;

grant execute on function itera.enroll_in_program(uuid) to authenticated;
