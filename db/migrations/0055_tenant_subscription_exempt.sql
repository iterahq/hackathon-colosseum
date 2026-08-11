-- ============================================================================
-- Itera migration 0055 — itera.tenants.subscription_exempt: a tenant that
-- GIVES ITS CLASSES AWAY stops being paywalled.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx). ADR-3 / ADR-26.
--
-- Plan: 20260728-itera-migration-ci-lock (Fase 6, schema ownership) +
-- itera-auditoria-5-agentes-2026-07 (DTQ-4 = C, "uma autoridade só").
--
-- SUPERSEDES iterahq/itera-api#26 (`migrations/0014_tenant_subscription_exempt.sql`),
-- WHICH CAN NEVER MERGE
-- ---------------------------------------------------------------------------
-- That PR wrote this DDL into `itera-api/migrations/`, a directory that (a) is
-- not the owner of this schema — ADR-3 / ADR-26 put the Itera schema in THIS
-- repo, under db/migrations/ — and (b) is deleted outright by the open
-- iterahq/itera-api#36. Worse, its filename `0014_...` collides with
-- `0014_byoc_attempt_notes.sql`, which is ALREADY MERGED on itera-api main. So
-- the file was dead three separate ways and the feature simply never shipped.
--
-- Verified against production on 2026-08-05: `itera.tenants` HAS NO
-- `subscription_exempt` COLUMN. The exemption has never once worked. The two
-- comments in the player that describe it as existing —
-- `src/auth/RequireSubscription.tsx` and `src/App.tsx`, both citing
-- "itera-api migration 0014" — document a migration that was never applied
-- anywhere. This file is what makes those comments true.
--
-- WHY THE TENANT AND NOT THE USER
-- -------------------------------
-- Measured in prod: every PLG signup gets a tenant of its very own
-- (`plg-<uid>`, one member) — 23 of the 26 tenants are that shape. So
-- "exempt the student's tenant" would exempt nobody real and would hand a
-- lifetime free account to any self-serve signup. What actually groups a
-- cohort is the tenant that HOSTS the class: the free-programming-class
-- students are all members of `dfl-batch` (35 memberships today). That is the
-- row that gets exempted.
--
-- WHY IT LIVES IN itera.my_subscription AND NOT IN THE CLIENT
-- ----------------------------------------------------------
-- There is exactly ONE entitlement authority and it is this view's WHERE
-- clause; `<RequireSubscription>` is the app-layer half of belt-and-suspenders,
-- never a second source of truth. An exempt tenant therefore surfaces as a
-- normal ENTITLED ROW (`status = 'exempt'`, `is_active = true`) that flows
-- through the same read every paid cohort uses. No new bypass branch to keep
-- in sync, and revoking the exemption is one UPDATE.
--
-- The player side is ALREADY written for this and needs no change:
-- `src/services/entitlement.service.ts` dropped its `.limit(1)` and picks the
-- entitled row explicitly (`rows.find((r) => r.is_active)`), precisely because
-- a member of an exempt tenant who ALSO has a lapsed subscription of their own
-- legitimately gets two rows.
--
-- WHY `create or replace` AND NOT `drop ... create`
-- -------------------------------------------------
-- itera-api#26 used `create or replace`; that is not cosmetic and is kept.
-- DROPPING this view drops its grants with it (`select` to `authenticated` and
-- `anon`), and nothing in that PR re-issued them — every learner would have
-- read entitlement through a view they no longer had rights on, i.e. the whole
-- product paywalled at once. `create or replace` preserves the grants. It is
-- legal here because the output column list is byte-identical to the live one
-- (same names, same order, same types) — that was checked against
-- `pg_get_viewdef('itera.my_subscription'::regclass, true)` in prod, not
-- assumed from the file itera-api#26 was written against.
--
-- ⚠️ THIS VIEW IS RECREATED BY ANOTHER FILE. REAPPLY THIS ONE LAST.
-- ---------------------------------------------------------------------------
-- `itera.my_subscription` is also defined by itera-api's
-- `0010_plg_subscribe_flow.sql`, which the open iterahq/itera-player#282 ports
-- into THIS series as `0044_api0010_plg_subscribe_flow.sql` — recreating the
-- view WITHOUT the exempt branch. On a clean run the ledger applies 0044 before
-- 0055 and this file wins, which is why it is numbered above everything #282
-- claims (it takes 0041-0054, and #290 also claims 0041). But the ledger is a
-- SET DIFFERENCE, not a replay: if THIS file is applied first and #282 merges
-- afterwards, 0044 lands on top and SILENTLY deletes the exemption, sending the
-- free cohort to /subscribe with nothing failing anywhere. Merge order should
-- be #282 first, or re-run this file after it.
--
-- Idempotent: `add column if not exists` + `create or replace` + an `update`
-- that is a no-op on a row already true. Safe to re-run, and required to be —
-- see db/README.md.
--
-- Deploy order: this migration FIRST, then the player. It is additive to the
-- gate (it can only turn a `/subscribe` redirect into access), so an older
-- client is never broken by it.
-- ============================================================================

begin;

-- SECURITY: this column grants free access, so its write surface is the whole
-- risk. `itera.tenants` is REST-exposed and has RLS enabled with exactly two
-- policies, BOTH `for select` (`tenants_select_public`, `tenants_select_member`)
-- and no INSERT/UPDATE/DELETE policy at all; table grants to `anon` and
-- `authenticated` are SELECT-only. Permissive RLS is default-deny, so with no
-- write policy AND no write grant, a tenant owner cannot self-exempt through
-- PostgREST. Only service-role/`postgres` writes this. Re-verified in prod
-- 2026-08-05 — do not add a write policy to this table without revisiting.
--
-- It IS world-READABLE (`tenants_select_public` is unrestricted for any
-- non-`plg-%` slug), so treat the flag as public information: it discloses that
-- a tenant is free, and nothing else.
alter table itera.tenants
  add column if not exists subscription_exempt boolean not null default false;

comment on column itera.tenants.subscription_exempt is
  $$Tenant whose classes are free, so its members are not paywalled. Surfaces in
itera.my_subscription as a row with status='exempt' and is_active=true, which is
the SAME authority every paid cohort is read through — deliberately not a second
bypass path in the client.

WRITABLE BY service-role ONLY: itera.tenants has RLS on with select-only
policies and select-only grants to anon/authenticated, so there is no
PostgREST write path. Publicly READABLE via tenants_select_public.

Never set this on a `plg-%` tenant — those are the one-member tenants minted per
self-serve signup, and exempting one is a free lifetime account.$$;

-- The cohort this exists for. Idempotent by value.
update itera.tenants set subscription_exempt = true
  where slug = 'dfl-batch' and subscription_exempt is distinct from true;

-- Column list, order and types are unchanged from the live definition; only the
-- second UNION branch is new. Options are respected on replace, so
-- security_invoker stays OFF (default) exactly as before: the view reads
-- `billing.*` with definer rights and the WHERE clause is the authorization
-- boundary.
create or replace view itera.my_subscription
with (security_invoker = false) as
  select
    s.tenant_id,
    s.status,
    s.seat_count,
    s.current_period_end,
    s.cancel_at_period_end,
    s.status = any (array['active', 'trialing']) as is_active
  from billing.subscriptions s
  where s.tenant_id in (
      select m.tenant_id from itera.memberships m
      where m.user_id = itera.current_itera_user_id()
    )
    and s.status <> all (array['canceled', 'incomplete_expired'])

  union all

  -- The `plg-%` exclusion is a second lock on top of "only service-role
  -- writes": even if a personal tenant somehow got flagged, it still would not
  -- entitle anyone. Exempting a `plg-<uid>` is the one mistake that converts
  -- this feature into free-forever for every self-serve signup, so the view
  -- refuses to honour it rather than trusting the column alone.
  --
  -- The membership predicate is what keeps this caller-scoped: an exempt tenant
  -- entitles ITS MEMBERS, not everyone who can read the flag.
  select
    t.id,
    'exempt'::text,
    null::integer,
    null::timestamptz,
    false,
    true
  from itera.tenants t
  where t.subscription_exempt
    and t.slug not like 'plg-%'
    and t.id in (
      select m.tenant_id from itera.memberships m
      where m.user_id = itera.current_itera_user_id()
    );

-- Self-enrolment must not become the way in. `itera.enroll_in_program` (this
-- repo's 0012_catalog_and_enroll.sql) is SECURITY DEFINER and open to
-- `authenticated`; it inserts a membership into ANY tenant that publishes an
-- `is_catalog` program. Without this check, the day someone lists an exempt
-- tenant's course in the catalog, its "enrol" button becomes a free
-- subscription for the entire internet — the membership predicate in the view
-- above is only as strong as who can obtain a membership.
--
-- `dfl-batch` has NO catalog programs in prod today, so this is closing the
-- hole before it opens, not after. Body is otherwise the live definition
-- verbatim (checked with pg_get_functiondef); only the exempt guard is added,
-- so grants and signature are untouched.
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
