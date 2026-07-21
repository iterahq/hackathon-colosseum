-- ============================================================================
-- Itera migration 0019 — preserve the DFL ("Learn") avatar separately
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY. NOT DFL prod.
-- Plan: 20260721-itera-profile-ux-upgrades.
--
-- WHY
-- ---
-- The /profile editor lets a learner override their avatar (preset icon or an
-- uploaded photo) by writing itera.users.avatar_url. But avatar_url is ALSO the
-- column seeded from the fellow's DFL profile picture on federated login. Once a
-- learner overrides it there is no way back to their original Learn photo — the
-- product ask "puxar foto do learn" (pull the Learn photo) has nothing to pull
-- from. This adds a dedicated, NON-user-editable column that always mirrors the
-- latest DFL profile picture, so the editor can offer a one-click "use my Learn
-- photo" without ever losing the learner's override.
--
-- The itera-api /v1/embed/session provisioning (companion PR) refreshes
-- dfl_avatar_url from DFL on every federated login and STOPS clobbering the
-- learner's avatar_url override.
--
-- SCOPE: additive column + one-time backfill. No RLS change is needed — the
-- existing users_select_self policy already returns the whole row (dfl_avatar_url
-- included) to its owner, and dfl_avatar_url is never written by the client
-- (only by itera-api server-side). Idempotent.
-- ============================================================================

alter table itera.users
  add column if not exists dfl_avatar_url text;

comment on column itera.users.dfl_avatar_url is
  'The fellow''s DFL (Learn) profile picture, mirrored server-side by itera-api on every federated login. NON-user-editable — the /profile "use my Learn photo" action copies this into avatar_url. Distinct from avatar_url, which is the learner''s current (possibly overridden) avatar. Migration 0019.';

-- One-time backfill: for federated users (those holding a `dfl` identity) whose
-- Learn photo has not diverged yet, avatar_url STILL equals the DFL picture
-- (the editor is brand-new), so seed dfl_avatar_url from it. Any user who has
-- since overridden gets a correct value on their next login anyway (itera-api
-- refreshes dfl_avatar_url unconditionally). Guarded to only fill NULLs.
update itera.users u
   set dfl_avatar_url = u.avatar_url
 where u.dfl_avatar_url is null
   and u.avatar_url is not null
   and exists (
     select 1 from itera.identities i
      where i.user_id = u.id
        and i.provider = 'dfl'::itera.identity_provider
   );
