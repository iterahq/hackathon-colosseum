-- ============================================================================
-- CONSOLIDATED FROM `iterahq/itera-mcp` — original path `migrations/0007_grant_author_fn.sql`.
-- Moved here 2026-08-04. Renumbered 0007 -> 0051.
--
-- Tainan, TG 2026-08-04: *"deleta /migrations nesses dois repos e não permite
-- mais criar via CI check"*. `itera-player` is now the SINGLE owner of the Itera
-- schema; `itera-api` and `itera-mcp` no longer carry a `migrations/` directory
-- and a CI guard in each fails if one reappears. This file exists so the DDL
-- behind live production objects keeps a home in a repository — deleting it
-- outright would have destroyed the provenance of objects that are still there.
--
-- ⚠️ ALREADY APPLIED BEFORE CONSOLIDATION — merging it applies NOTHING.
-- It was applied to the Itera database (kjefmwlopzeaqgqtlbdn) by hand out of
-- `itera-mcp` around 2026-07-06, long before it arrived here. Every object it
-- creates was confirmed present by a read-only SELECT on 2026-08-04, and it is
-- recorded in `itera.schema_migrations` as applied WITHOUT being executed, via
-- `db/scripts/apply-migrations.sh baseline-add`. Do NOT "re-apply" it.
--
-- The new number is the order in which it was ACTUALLY applied, which is also
-- its dependency order — the old numbers could not be: itera-api's 0003 landed
-- after its 0010/0011, and itera-mcp's 0002 must precede itera-api's 0012, which
-- calls itera.current_author_tenant_ids(). Three independent 00NN sequences
-- against one database is exactly the collision this consolidation ends.
--
-- THE SQL BELOW IS BYTE-FOR-BYTE THE ORIGINAL. Nothing was edited — an edited
-- migration and a live database that disagree is the failure this file guards.
-- ============================================================================

-- 0007_grant_author_fn.sql
-- Adds itera.grant_author(...) — a SECURITY DEFINER RPC that lets a tenant
-- superadmin (owner / tenant_admin) promote a user to the `author` role for
-- their tenant. This is the DB half of the itera-mcp `grant_author` tool
-- (Phase 3 of plan 20260706-iterahq-activity-authoring-canvas-testing, ADR-10).
--
-- WHY A SECURITY DEFINER RPC (not a plain RLS-gated upsert):
--   * itera.memberships grants `authenticated` ONLY SELECT (see 0002 + the
--     0001 select policies) — there is NO INSERT/UPDATE grant or write policy,
--     and the MCP server has NO service_role. A direct upsert would 42501.
--   * The target professor is typically NOT YET a member of the tenant, so the
--     caller cannot even resolve them via itera.users under RLS
--     (users_select_admin only exposes EXISTING members of the admin's tenant).
--   A definer function is the clean, auditable path: it runs with elevated
--   rights but SELF-ENFORCES the owner/tenant_admin gate on the CALLER before
--   writing, so the "superadmin-only" invariant holds regardless of RLS.
--
-- IDEMPOTENT: CREATE OR REPLACE. The function itself is idempotent per call
-- (upsert; never downgrades a higher-privilege role).
--
-- Applied directly against the Itera project (kjefmwlopzeaqgqtlbdn) via the
-- `itera-supabase-helpers` skill — the project is OURS. NOT dfl-schema.

CREATE OR REPLACE FUNCTION itera.grant_author(
  p_tenant_id  uuid,
  p_user_id    uuid DEFAULT NULL,
  p_user_email text DEFAULT NULL
)
  RETURNS itera.memberships
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'itera', 'public'
AS $function$
DECLARE
  v_caller      uuid;
  v_caller_role itera.member_role;
  v_target      uuid;
  v_existing    itera.member_role;
  v_result      itera.memberships;
BEGIN
  v_caller := itera.current_itera_user_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;

  -- 1. Superadmin gate — the CALLER must be owner or tenant_admin of the tenant.
  SELECT m.role INTO v_caller_role
  FROM itera.memberships m
  WHERE m.user_id = v_caller AND m.tenant_id = p_tenant_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'tenant_admin') THEN
    RAISE EXCEPTION
      'permission denied: only an owner or tenant_admin of the tenant may grant author'
      USING errcode = '42501';
  END IF;

  -- 2. Resolve the target user (by id, else by email).
  IF p_user_id IS NOT NULL THEN
    v_target := p_user_id;
    -- Sanity: the user must exist.
    IF NOT EXISTS (SELECT 1 FROM itera.users u WHERE u.id = v_target) THEN
      RAISE EXCEPTION 'no itera user found with id %', p_user_id USING errcode = 'P0002';
    END IF;
  ELSIF p_user_email IS NOT NULL THEN
    SELECT u.id INTO v_target
    FROM itera.users u
    WHERE lower(u.email) = lower(p_user_email);
    IF v_target IS NULL THEN
      RAISE EXCEPTION 'no itera user found with email %', p_user_email USING errcode = 'P0002';
    END IF;
  ELSE
    RAISE EXCEPTION 'either p_user_id or p_user_email is required' USING errcode = '22023';
  END IF;

  -- 3. Idempotent upsert — NEVER downgrade a higher authoring role.
  --    Privilege rank for authoring: owner > tenant_admin > instructor > author > learner.
  --    author is the least-privilege authoring role; if the target already holds
  --    instructor/tenant_admin/owner (all of which can already author) leave it.
  SELECT m.role INTO v_existing
  FROM itera.memberships m
  WHERE m.user_id = v_target AND m.tenant_id = p_tenant_id;

  IF v_existing IN ('instructor', 'tenant_admin', 'owner') THEN
    SELECT * INTO v_result
    FROM itera.memberships
    WHERE user_id = v_target AND tenant_id = p_tenant_id;
    RETURN v_result;
  END IF;

  INSERT INTO itera.memberships (user_id, tenant_id, role)
  VALUES (v_target, p_tenant_id, 'author')
  ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = 'author'
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

-- Expose the RPC to logged-in users. The function self-enforces the
-- owner/tenant_admin gate, so a non-admin caller gets a 42501 from the body.
GRANT EXECUTE ON FUNCTION itera.grant_author(uuid, uuid, text) TO authenticated;
