-- ============================================================================
-- Itera migration 0056 — a sanctioned, attributable way to REVOKE a membership.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- Plan: 20260804-itera-convidados-engagement-identidade (ADR-3, Verification 12)
--
-- WHY THIS FILE EXISTS AT ALL
-- ---------------------------
-- CLAUDE.md is explicit that removing rows is DATA, not schema, and therefore
-- belongs to an MCP tool invoked with the CALLER'S user-JWT — never a migration,
-- never psql (Tainan, TG 2026-07-28: *"prs nao sao para remover rows ou inserir
-- seeds. pra isso use mcp. crie se nao existir"*). The rule ends with an
-- instruction — *create the tool if it does not exist* — and that is what ran
-- into a wall here.
--
-- ⚠️ MEASURED 2026-08-07 against this project: the tool CANNOT be built today,
-- because the database offers no write path for `itera.memberships` to any
-- end-user role at all.
--
--     grantee        privileges on itera.memberships
--     -------------  --------------------------------
--     anon           SELECT
--     authenticated  SELECT          <-- no INSERT / UPDATE / DELETE
--     postgres       ALL
--
--     policies on itera.memberships: memberships_select_admin,
--     memberships_select_instructor, memberships_select_self
--                                     <-- all three are `for select`. No write
--                                         policy exists, so RLS denies writes
--                                         by default even if a grant appeared.
--
-- So an MCP tool holding a real user-JWT — exactly the attributable path the
-- rule prefers — has nothing to call. The only actor who can delete a
-- membership row today is `postgres`, i.e. the unattributed BYPASSRLS
-- superuser-ish role that the rule exists to keep out of data changes.
--
-- This migration therefore adds the missing *primitive*, not the data change.
-- It creates NO rows and DELETES no rows. It is schema: a SECURITY DEFINER
-- function that authorizes the caller from their own JWT and then performs the
-- delete under that authorization. The actual removal of any given membership
-- stays a runtime tool call by a named human, which is the point.
--
-- It is deliberately GENERIC — any tenant, any user, any role, any time. It is
-- not scoped to the eight rows that motivated it (see below), because a
-- one-shot repair function is a landmine: it reads as an API, it is called
-- again later, and by then its hardcoded assumptions are false.
--
-- PRECEDENT: `itera.grant_author(...)` (migration 0051 / itera-mcp 0007) is the
-- same shape — SECURITY DEFINER, resolves the target by id-or-email, checks the
-- caller's role from their JWT, idempotent, returns the affected row. This is
-- its counterpart, and the two are meant to read as a pair.
--
-- THE INVARIANT THIS UNBLOCKS
-- ---------------------------
-- Migration 0026 (guest link, ADR-2/ADR-4) established that a link-invited
-- guest holds ZERO `itera.memberships` rows, and that the empty set IS the
-- guest's security boundary — a guest with a `learner` membership can read the
-- tenant's whole programme.
--
-- ⚠️ MEASURED 2026-08-07: that invariant is BROKEN in production for 8 of 23
-- guests. All eight rows carry the identical `created_at`
-- `2026-07-29 20:22:20.549777+00` — one batch write, which is the fingerprint of
-- migration 0009's unfiltered backfill being replayed before the 0039 ledger
-- existed, not of the per-signup trigger. The trigger itself is innocent and
-- has been correct since 0026: of the 15 guest users created AFTER that instant,
-- ZERO hold a membership. Nothing writes these rows today, so removing them is
-- a repair, not a treadmill.
--
-- WHO MAY CALL THIS, AND THE ONE DELIBERATE WIDENING
-- --------------------------------------------------
-- Baseline: `owner` or `tenant_admin` of the target tenant — the roles that
-- already administer it.
--
-- Plus ONE documented exception: an `instructor` of the tenant may revoke a
-- membership held by a user flagged `itera.users.is_guest`. Rationale, and it
-- is narrow on purpose:
--
--   · Such a row is, by 0026/ADR-2, invalid data by definition — not a product
--     decision someone made. Repairing it is not the same act as removing a
--     real learner from a cohort, and it should not need the same authority.
--   · The effect can only ever NARROW access. There is no privilege-escalation
--     shape here: the target ends with strictly less reach than they began.
--   · Instructors already read the full roster via
--     `memberships_select_instructor`, so this grants no new visibility.
--   · Without it the invariant is unrepairable in practice. Measured
--     2026-08-07: tenant `dfl-batch` — which holds 100% of the guests, 100% of
--     the guest traces and 100% of the 8 stray rows — has exactly two
--     `tenant_admin`s and no `owner`. Tainan himself is only `instructor`
--     there, so without this clause the person who owns the product cannot fix
--     his own data and the repair waits on a third party's calendar.
--
-- A caller who is merely `learner` (or a guest, or anonymous) is refused.
--
-- GUARDS
-- ------
--   1. The membership must exist -> P0002, so a typo'd uuid fails loud instead
--      of silently reporting success on zero rows.
--   2. You cannot revoke YOUR OWN membership. Self-lockout is the classic way
--      an admin tool bricks a tenant, and there is no recovery path that does
--      not involve `postgres`.
--   3. You cannot remove the LAST `owner`/`tenant_admin` of a tenant. Same
--      reason, one step less obvious: a tenant with zero admins can never be
--      administered again through any sanctioned path.
--
-- Returns the deleted row so the caller (and the MCP tool's transcript) records
-- exactly what was removed — the attribution the CLAUDE.md rule is really about.
--
-- Idempotent as a migration: `create or replace` + an explicit drop of any
-- prior signature. NOT idempotent as a call — a second revoke of the same
-- membership raises P0002, which is correct: "already gone" and "I just removed
-- it" are different facts and a repair script should be able to tell them apart.
-- ============================================================================

-- Drop any earlier signature so a re-run cannot leave two overloads behind.
drop function if exists itera.revoke_membership(uuid, uuid, text);

create function itera.revoke_membership(
  p_tenant_id  uuid,
  p_user_id    uuid default null,
  p_user_email text default null
)
returns itera.memberships
language plpgsql
security definer
set search_path = itera, public
as $$
declare
  v_caller      uuid;
  v_caller_role itera.member_role;
  v_target      uuid;
  v_found       uuid;
  v_target_role itera.member_role;
  v_is_guest    boolean;
  v_admins_left integer;
  v_deleted     itera.memberships;
begin
  -- 1. Resolve the caller from their own JWT. No parameter can spoof this.
  v_caller := itera.current_itera_user_id();
  if v_caller is null then
    raise exception 'not authenticated as an itera user'
      using errcode = '42501';
  end if;

  if p_tenant_id is null then
    raise exception 'p_tenant_id is required' using errcode = '22023';
  end if;

  select m.role into v_caller_role
  from itera.memberships m
  where m.user_id = v_caller and m.tenant_id = p_tenant_id;

  if v_caller_role is null then
    raise exception 'caller holds no membership in tenant %', p_tenant_id
      using errcode = '42501';
  end if;

  -- 2. Resolve the target by id, else by email (mirrors itera.grant_author).
  if p_user_id is not null then
    v_target := p_user_id;
  elsif p_user_email is not null then
    select u.id into v_target
    from itera.users u
    where lower(u.email) = lower(p_user_email);
    if v_target is null then
      raise exception 'no itera user found with email %', p_user_email
        using errcode = 'P0002';
    end if;
  else
    raise exception 'either p_user_id or p_user_email is required'
      using errcode = '22023';
  end if;

  -- Existence is decided by the id, not by is_guest — a nullable flag must not
  -- be able to make a real user look absent.
  select u.id, coalesce(u.is_guest, false) into v_found, v_is_guest
  from itera.users u where u.id = v_target;

  if v_found is null then
    raise exception 'no itera user found with id %', v_target
      using errcode = 'P0002';
  end if;

  -- 3. Authorize. Admins always; instructors only to repair the guest
  --    invariant of migration 0026 (see header).
  if v_caller_role not in ('owner', 'tenant_admin')
     and not (v_caller_role = 'instructor' and v_is_guest) then
    raise exception
      'caller role % may not revoke memberships in tenant % (instructors may only revoke guest memberships)',
      v_caller_role, p_tenant_id
      using errcode = '42501';
  end if;

  -- 4. Guard: the membership must exist.
  select m.role into v_target_role
  from itera.memberships m
  where m.user_id = v_target and m.tenant_id = p_tenant_id;

  if v_target_role is null then
    raise exception 'user % holds no membership in tenant %', v_target, p_tenant_id
      using errcode = 'P0002';
  end if;

  -- 5. Guard: no self-revoke (lockout).
  if v_target = v_caller then
    raise exception 'refusing to revoke your own membership in tenant %', p_tenant_id
      using errcode = '42501';
  end if;

  -- 6. Guard: never remove the last administrator of a tenant.
  if v_target_role in ('owner', 'tenant_admin') then
    select count(*) into v_admins_left
    from itera.memberships m
    where m.tenant_id = p_tenant_id
      and m.role in ('owner', 'tenant_admin')
      and m.user_id <> v_target;

    if v_admins_left = 0 then
      raise exception
        'refusing to remove the last owner/tenant_admin of tenant %', p_tenant_id
        using errcode = '42501';
    end if;
  end if;

  delete from itera.memberships m
  where m.user_id = v_target and m.tenant_id = p_tenant_id
  returning m.* into v_deleted;

  return v_deleted;
end;
$$;

comment on function itera.revoke_membership(uuid, uuid, text) is
  $$Removes ONE itera.memberships row, authorized from the caller's own JWT.

WHY IT EXISTS: `itera.memberships` grants `authenticated` SELECT only and has no
write policy, so there is no way for an MCP tool holding a real user-JWT to
remove a membership — and CLAUDE.md requires exactly that path for data changes
(never a migration, never psql). This is the missing primitive; it performs no
data change of its own.

AUTHORIZATION: `owner`/`tenant_admin` of the tenant. Plus one documented
widening — an `instructor` may revoke a membership held by an `is_guest` user,
because such a row violates the invariant of migration 0026 (a guest holds ZERO
memberships; the empty set IS their security boundary), its removal can only
narrow access, and the tenant holding every affected row (`dfl-batch`) has no
owner and does not count the product's own decision-maker among its admins.

GUARDS: target must exist (P0002); no self-revoke; never removes the last
owner/tenant_admin of a tenant. Returns the deleted row for attribution.

GENERIC BY DESIGN: any tenant, any user, any role. It was motivated by 8 stray
guest memberships (one batch, 2026-07-29 20:22:20.549777+00, the replayed 0009
backfill) but is deliberately not scoped to them — a one-shot repair function
outlives its incident and lies about its own contract.

COUNTERPART of itera.grant_author(...).$$;

grant execute on function itera.revoke_membership(uuid, uuid, text) to authenticated;
