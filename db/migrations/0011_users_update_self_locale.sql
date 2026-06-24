-- ============================================================================
-- Itera migration 0011 — users_update_self RLS policy (self-editable locale)
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY. NOT DFL prod.
-- Plan: 20260624-itera-player-i18n-profile-language (Part A — per-user language).
--
-- WHY: the player now lets a user pick their language in the profile menu and the
-- choice persists to itera.users.locale (DB-backed, not just localStorage). RLS
-- only had `users_select_self` (read own row); there was NO update policy, so a
-- client-side `update({ locale })` was silently blocked. This adds an UPDATE
-- policy scoped to the caller's OWN row (id = itera.current_itera_user_id()),
-- mirroring the existing select-self policy.
--
-- Scope/safety: the policy authorizes updating the caller's own row. The player
-- service only ever writes `locale`; we do not widen this to other tables. RLS
-- still prevents touching anyone else's row (USING + WITH CHECK both pin to the
-- caller's resolved itera user id).
--
-- itera.users.locale already exists (NOT NULL DEFAULT 'pt', from 0001). No column
-- change is needed — this migration is purely the RLS update policy.
--
-- Idempotent: DROP POLICY IF EXISTS then CREATE.
-- ============================================================================

-- A user may update only their own itera.users row. USING gates which rows are
-- visible to the UPDATE; WITH CHECK ensures the row still belongs to the caller
-- after the change (so they can't re-key the row to someone else).
drop policy if exists users_update_self on itera.users;
create policy users_update_self on itera.users
  for update
  using (id = itera.current_itera_user_id())
  with check (id = itera.current_itera_user_id());

-- Allow the authenticated role to issue UPDATE on the table (RLS still scopes to
-- the own-row policy above). Idempotent — GRANT is a no-op if already present.
grant update on itera.users to authenticated;
