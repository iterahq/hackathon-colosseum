-- ============================================================================
-- Itera migration 0069 — schema `learning`: operator cross-learner READ.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL production (yoojxnggaxcqtsyjdrdx). Idempotent.
--
-- Plan: 20260828-itera-learning-engine-v1, milestone M11 (Learning Backoffice).
-- Question "gate = Tainan", TG 2026-08-28 answer A.
--
-- WHAT THIS IS
-- -----------
-- The Learning Backoffice (learning-backoffice.iterahq.dev) is an OPERATOR
-- view. It reads every learner's episodes, evidence, claims, state, activities
-- and responses — cross-learner. The per-learner dashboard reads only the
-- caller's own rows (migration 0067, the `_rw_self` policies). This migration
-- adds the one thing the backoffice needs and the dashboard must never have:
-- a READ that crosses learners, granted only to an operator.
--
-- WHY A POLICY AND NOT service_role
-- ---------------------------------
-- The fleet rule (2026-06-23) keeps `service_role` out of any user-invoked
-- path. The backoffice is a browser SPA; a `service_role` key must never reach
-- it. So the elevated read is an RLS policy the operator earns with their OWN
-- JWT, exactly as "admin sees all" was done for Lesson Studio. The operator
-- signs in as themselves, RLS returns every learner's rows, and the change is
-- attributable and revocable in one place.
--
-- WHO IS AN OPERATOR
-- ------------------
-- An operator is an `owner` or `tenant_admin` of the ITERA PLATFORM TENANT
-- (itera.tenants.slug = 'itera'). Tainan is `owner` of that tenant. This is a
-- deliberate, narrow definition: membership of one specific tenant, not the
-- JWT `user_role` claim (which is the highest role across ANY tenant and would
-- let a plg-tenant admin in). The helper resolves the tenant by slug, so no
-- UUID is hardcoded.
--
-- READ ONLY — NO WRITE ELEVATION
-- ------------------------------
-- Every policy below is `for select`. The `_rw_self` policies from 0067 stay
-- exactly as they are, so WRITES remain self-only for everyone, operator
-- included. RLS policies are OR'd: after this migration a SELECT returns a row
-- when it is the caller's own row OR the caller is an operator. An operator can
-- READ every learner and WRITE none but their own. The append-only posture of
-- work_episodes / evidence / activity_responses is untouched.
--
-- WHY THE HELPER IS SECURITY DEFINER
-- ----------------------------------
-- `itera.memberships` and `itera.tenants` carry their own RLS. A policy
-- function that reads them must not itself be filtered by the caller's RLS, or
-- it could answer "not an operator" for a real operator. SECURITY DEFINER +
-- STABLE + a pinned search_path is the same shape as itera.current_*_tenant_ids
-- from migration 0002.
-- ============================================================================

-- ── The operator predicate ────────────────────────────────────────────────
create or replace function itera.is_learning_operator()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'itera', 'public'
as $$
  select exists (
    select 1
    from itera.memberships m
    join itera.tenants t on t.id = m.tenant_id
    where m.user_id = itera.current_itera_user_id()
      and t.slug = 'itera'
      and m.role in ('owner', 'tenant_admin')
  );
$$;

comment on function itera.is_learning_operator() is
  'True when the caller is owner/tenant_admin of the itera platform tenant. Gates the cross-learner READ used by the Learning Backoffice (plan 20260828-itera-learning-engine-v1, M11). Read-only elevation; writes stay self-only via the 0067 _rw_self policies.';

-- ── Additive operator SELECT policies (OR'd with the 0067 _rw_self ALL) ────
-- Idempotent: drop-if-exists then create, so a re-apply is a no-op in effect.

drop policy if exists learners_read_operator on learning.learners;
create policy learners_read_operator on learning.learners
  for select using (itera.is_learning_operator());

drop policy if exists objectives_read_operator on learning.learning_objectives;
create policy objectives_read_operator on learning.learning_objectives
  for select using (itera.is_learning_operator());

drop policy if exists claims_read_operator on learning.claims;
create policy claims_read_operator on learning.claims
  for select using (itera.is_learning_operator());

drop policy if exists episodes_read_operator on learning.work_episodes;
create policy episodes_read_operator on learning.work_episodes
  for select using (itera.is_learning_operator());

drop policy if exists activities_read_operator on learning.activities;
create policy activities_read_operator on learning.activities
  for select using (itera.is_learning_operator());

drop policy if exists activity_responses_read_operator on learning.activity_responses;
create policy activity_responses_read_operator on learning.activity_responses
  for select using (itera.is_learning_operator());

drop policy if exists evidence_read_operator on learning.evidence;
create policy evidence_read_operator on learning.evidence
  for select using (itera.is_learning_operator());

drop policy if exists learner_state_read_operator on learning.learner_state;
create policy learner_state_read_operator on learning.learner_state
  for select using (itera.is_learning_operator());

drop policy if exists checkpoints_read_operator on learning.checkpoints;
create policy checkpoints_read_operator on learning.checkpoints
  for select using (itera.is_learning_operator());
