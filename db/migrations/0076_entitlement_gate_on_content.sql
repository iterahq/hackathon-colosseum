-- ============================================================================
-- Itera migration 0076 — put the SUBSCRIPTION GATE in the database.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- DEPENDS ON 0075. That file declares itera.my_subscription "a ÚNICA autoridade
-- de entitlement da Itera" and pulls the client's two bypasses (the localStorage
-- DFL flag, the VITE_ grandfather date) into it. 0075 makes the answer
-- trustworthy; 0076 is what makes anyone have to ask.
--
-- ---------------------------------------------------------------------------
-- THE HOLE
-- ---------------------------------------------------------------------------
-- Measured 2026-08-25: `subscription` appears in ZERO row-level policies in
-- this repo. The paywall exists in exactly one place —
-- src/auth/RequireSubscription.tsx, a `<Navigate to="/subscribe">`. Every
-- content policy stops at TENANT MEMBERSHIP (+ published, since 0064).
--
-- Membership is self-serve: `itera.enroll_in_program` is SECURITY DEFINER and
-- grants a `learner` membership in the `itera` tenant to anyone authenticated,
-- for any `is_catalog` program. So the full path today is:
--
--   sign up (free)  ->  POST /rpc/enroll_in_program  ->  membership
--                   ->  GET /activities?...          ->  every activity body
--
-- No React involved, no subscription involved. `/subscribe` is a suggestion.
-- This is harmless only while Stripe is in TEST mode; the day the live key is
-- installed, the product is free to anyone who opens the network tab.
--
-- ---------------------------------------------------------------------------
-- WHAT "ENTITLED" MEANS, AND WHY IT IS USER-SCOPED
-- ---------------------------------------------------------------------------
-- The obvious predicate — "the tenant that OWNS this content has a paid
-- subscription" — is WRONG here, and the PLG model is why. A self-serve buyer
-- pays on their own personal `plg-<uuid>` tenant, then consumes content owned
-- by the `itera` tenant. A content-tenant predicate would lock out exactly the
-- people who paid.
--
-- So entitlement follows the USER — and it is not reimplemented here. The
-- billing half is ONE `exists` over `itera.my_subscription`, the view 0075
-- declares canonical. Rewriting its three branches (paid / exempt / grandfathered)
-- in a policy would recreate the exact failure 0075 exists to end: two places
-- that answer "has this person paid?" and can drift apart. A grandfathered user
-- who passed the client and was refused by RLS would be a bug nobody could
-- reproduce.
--
-- Two things are added on top, and both are deliberately NOT billing facts:
--
--   * a staff role (author|instructor|tenant_admin|owner) in a REAL tenant.
--     Authors already read DRAFTS through current_author_tenant_ids(); gating
--     them behind a purchase would make the authoring tool unusable. This does
--     not belong in my_subscription — that view answers "has this person
--     paid?", and telling an author "yes" would be a lie the UI would repeat.
--   * is_test — the qa-e2e tenant from 0066. Same reason: the e2e identities
--     carry no Stripe customer, and claiming they hold a subscription would
--     make the view lie to keep a test suite green.
--
-- The `plg-%` carve-out on the staff clause is NOT cosmetic symmetry with the
-- view — it is what makes this migration do anything at all. Measured in
-- production: every self-serve signup is provisioned as `owner` of their own
-- personal tenant (10 of the 11 plg tenants; the 11th is `author`). A staff
-- clause that said "in ANY tenant" would therefore be true for every account
-- that has ever signed up, and the gate would be a no-op that reads like a fix.
-- A role held only in the tenant that was auto-created for you is not staff.
--
-- ---------------------------------------------------------------------------
-- BLAST RADIUS, MEASURED IN PRODUCTION BEFORE THIS FILE WAS WRITTEN
-- ---------------------------------------------------------------------------
--   tenant             keeps access   LOSES access
--   -----------------  ------------   ------------
--   dfl-batch                    37              0   exempt -> Educar+ intact
--   itera                         9              0   staff roles in a real tenant
--   qa-e2e                        9              0   is_test
--   acme                          2              0   grandfathered (0075)
--   plg-* (11 users)             11              0   all also sit in itera/dfl-batch
--
-- NOBODY loses access. Not "no paying customer" — nobody. The gate is being
-- installed before there is anyone to keep out, which is the only comfortable
-- time to install one. Note the acme row: measured against 0075's predicate
-- alone those two fixtures fell off the cliff, and it is 0075's grandfather
-- branch that catches them. That is the dependency being real, not decorative.
--
-- ---------------------------------------------------------------------------
-- WHAT IS GATED, AND WHAT DELIBERATELY IS NOT
-- ---------------------------------------------------------------------------
-- GATED   itera.activities      the exercise bodies
--         itera.activity_defs   the same payload, reusable form (spec+rubric).
--                               Gating only `activities` would leave the whole
--                               library readable through the other table.
--
-- NOT GATED  programs / units / lessons. Structure IS the catalog: it is what
--         /subscribe renders to sell the thing. Gating it would break the
--         purchase flow for the exact user we want to charge. Titles are
--         marketing; specs and rubrics are the product.
--
-- Both policies below are supersets of their 0064/0065 shape — every existing
-- clause is preserved verbatim and `AND itera.current_user_is_entitled()` is
-- appended. Neither carries a `TO` clause, also as before: they apply to
-- PUBLIC on purpose, so a future role cannot appear outside them.
--
-- Defence in depth: `enroll_in_program` gets the same check. Blocking the read
-- is what protects the content, but letting a non-payer mint memberships would
-- pollute every tenant-scoped roster and metric for no reason.
-- ============================================================================

begin;

-- ── the predicate, in one place ─────────────────────────────────────────────
-- SECURITY DEFINER because neither `billing.subscriptions` nor `itera.users`
-- is readable by `authenticated`, and neither must become readable. STABLE, so
-- the planner evaluates it once per statement rather than once per row.
create or replace function itera.current_user_is_entitled()
returns boolean
language sql
stable
security definer
set search_path to 'itera', 'billing', 'public'
as $$
  select
    -- paid / exempt / grandfathered — asked, never re-derived. 0075 owns it.
    exists (select 1 from itera.my_subscription ms where ms.is_active)
    or exists (
      select 1
      from itera.memberships m
      join itera.tenants t on t.id = m.tenant_id
      where m.user_id = itera.current_itera_user_id()
        and (
          (m.role in ('author', 'instructor', 'tenant_admin', 'owner')
            and t.slug not like 'plg-%')
          or coalesce(t.is_test, false)
        )
    );
$$;

comment on function itera.current_user_is_entitled() is
  'True when the current user may read gated content. Billing comes from itera.my_subscription (0075, the single authority); on top of it, staff in a real tenant and members of an is_test tenant are admitted, because neither is a billing fact and neither belongs in that view.';

revoke all on function itera.current_user_is_entitled() from public;
grant execute on function itera.current_user_is_entitled() to anon, authenticated;

-- ── itera.activities ────────────────────────────────────────────────────────
drop policy if exists activities_select_tenant on itera.activities;
create policy activities_select_tenant on itera.activities
  for select
  using (
    lesson_id in (
      select l.id
      from itera.lessons l
      join itera.units u on u.id = l.unit_id
      join itera.programs p on p.id = u.program_id
      where p.tenant_id in (select itera.current_tenant_ids())
    )
    and (
      status = 'published'
      or lesson_id in (
        select l.id
        from itera.lessons l
        join itera.units u on u.id = l.unit_id
        join itera.programs p on p.id = u.program_id
        where p.tenant_id in (select itera.current_author_tenant_ids())
      )
    )
    and itera.current_user_is_entitled()
  );

-- ── itera.activity_defs ─────────────────────────────────────────────────────
drop policy if exists activity_defs_select_tenant on itera.activity_defs;
create policy activity_defs_select_tenant on itera.activity_defs
  for select
  using (
    tenant_id in (select itera.current_tenant_ids())
    and (
      status = 'published'
      or tenant_id in (select itera.current_author_tenant_ids())
    )
    and itera.current_user_is_entitled()
  );

-- ── itera.enroll_in_program ─────────────────────────────────────────────────
-- Body copied verbatim from the live definition (pg_get_functiondef, prod,
-- 2026-08-25). The ONLY change is the entitlement guard added below the
-- existing exempt guard.
create or replace function itera.enroll_in_program(p_program_id uuid)
returns table(out_tenant_id uuid, out_role itera.member_role, out_enrolled boolean)
language plpgsql
security definer
set search_path to 'itera', 'public'
as $function$
declare
  v_user_id uuid;
  v_tenant_id uuid;
  v_is_catalog boolean;
  v_exempt boolean;
  v_inserted_count int := 0;
begin
  v_user_id := itera.current_itera_user_id();
  if v_user_id is null then
    raise exception 'not authenticated (no itera user)';
  end if;

  -- Resolve the program's tenant and verify it is a catalog program. This is
  -- the security gate: a caller can ONLY self-enroll into catalog courses, so
  -- this can never be abused to join an arbitrary private tenant.
  select p.tenant_id, p.is_catalog, t.subscription_exempt
    into v_tenant_id, v_is_catalog, v_exempt
  from itera.programs p
  join itera.tenants t on t.id = p.tenant_id
  where p.id = p_program_id;

  if v_tenant_id is null then
    raise exception 'program not found';
  end if;
  if not coalesce(v_is_catalog, false) then
    raise exception 'program is not in the self-serve catalog';
  end if;
  if coalesce(v_exempt, false) then
    raise exception 'program belongs to a subscription-exempt tenant; enrollment is invite-only';
  end if;
  if not itera.current_user_is_entitled() then
    raise exception 'an active subscription is required to enroll'
      using errcode = '42501';
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
$function$;

commit;
