-- ============================================================================
-- Itera migration 0041 — an admin can WATCH a guest's trace.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx). ADR-3 / ADR-26.
--
-- Plan: 20260728-itera-guest-link-aula-sincrona (ADR-4, ADR-6, ADR-7) crossed
-- with 20260803-itera-replay-de-sessao-de-atividade (Fase 1).
--
-- WHY
-- ---
-- Tainan, by voice 2026-08-05T16:44Z:
--   *"Sim, convidado gera trace de aprendizagem, mas fica fora da análise — só
--    analytics interna. Então dá pra dar replay, mas não vai pra analytics."*
--
-- The WRITE half of that sentence needs no migration and already shipped
-- (PR #289): `traces_rw_self` is `user_id = itera.current_itera_user_id()`, a
-- guest holds a real `itera.users` id and a real `authenticated` JWT, and the
-- predicate is a strict subset of the one under which guests demonstrably wrote
-- 41 rows in `class_answers`. The exclusion was client-side only.
--
-- The READ half does need one, and this is it. Every SELECT policy on
-- `activity_traces` (0034) scopes through `itera.memberships`:
--
--     user_id in (select m.user_id from itera.memberships m
--                 where m.tenant_id in (select itera.current_admin_tenant_ids()))
--
-- A link-invited guest holds ZERO membership rows — that empty set IS their
-- security boundary (migration 0026, ADR-4), and it is deliberately not being
-- changed. So an admin's JWT reads back NOTHING for a guest's trace, no matter
-- what the client asks for. Without this file the replay of a guest is
-- permanently empty and the rows accumulate unwatched: exactly the failure the
-- write fix was for, moved one layer down.
--
-- ⚠️ MEASURED 2026-08-05, and it is the reason a new policy is needed rather
-- than a widened one: of the 20 guests on record, EIGHT (all created
-- 2026-07-28) carry a stray `dfl-batch:learner` membership — they predate the
-- guest guard in 0026's `handle_new_federated_user`. The other twelve, created
-- after the guard went live, carry none. So today `traces_select_admin` would
-- surface eight guests and hide twelve, on the basis of when they happened to
-- visit. That inconsistency is an artefact, not a rule, and no policy should be
-- written to depend on it. This one keys on `itera.class_guests`, which is the
-- actual record of "this person was a guest of this session", and is therefore
-- correct for all twenty.
--
-- WHAT THIS GRANTS, PRECISELY
-- ---------------------------
-- SELECT on the traces of a user who joined a class session belonging to a
-- tenant the caller is `tenant_admin` of. Nothing else:
--
--   · ONLY `tenant_admin` (`itera.current_admin_tenant_ids()`), NOT instructor.
--     Deliberately NARROWER than the sibling `traces_select_instructor`, and
--     the narrowness is a decision rather than an omission: Tainan, TG
--     2026-08-04 R2, *"so admin assiste replay de aluno. so do tenant dele
--     tbm."* An instructor's access to `activity_results` predates all of this
--     and is untouched; there is no pre-existing instructor access to a GUEST's
--     trace to preserve, so none is created.
--   · ONLY through `class_guests`, so the tenant scope is the session the guest
--     was actually invited to. An admin of tenant A can never watch a guest of
--     tenant B, even if the same person guested both.
--   · SELECT only. No INSERT/UPDATE/DELETE policy is added, and the table-level
--     grants (0034: `select, insert` to `authenticated`) are untouched — a
--     trace stays append-only, and a curator watching still cannot become
--     learner data.
--
-- WHAT IT DOES NOT DO, AND MUST NOT BE READ AS DOING
-- --------------------------------------------------
-- It does NOT put guests into analytics. Tainan's sentence has two halves and
-- this file is only the first. Guests are excluded from every aggregate in the
-- product, and that exclusion lives in the application, declared per consumer
-- and locked by `src/test/traceEmissionBoundary.test.ts`. `buildClassReport`
-- (ADR-4) keeps them out of every cohort total; `admin.service` (Engagement /
-- Completion) does not read this table at all.
--
-- It also does NOT give the guest anything new. A guest reads their own trace
-- via `traces_rw_self` and nothing else, exactly as before.
--
-- ⚠️ WHY NOT `is_guest` ON THE POLICY. Because `itera.users.is_guest` answers
-- "is this person a guest TODAY", and ADR-7 keeps the guest→account promotion
-- path open, so that bit is expected to move. A policy keyed on it would
-- silently stop returning a promoted person's old guest attempts — retroactively
-- rewriting who could watch what, on an event unrelated to the class. The
-- `class_guests` row is immutable history of the invitation, which is the
-- question the policy is actually asking.
--
-- ⚠️ PERFORMANCE. The subquery is a two-table join evaluated per statement, not
-- per row, on tables that are tiny by construction (`class_guests` = 20 rows,
-- `class_sessions` = low dozens; the whole database is 17 MB). Both sides of
-- the join ride existing keys: `class_guests` PK `(session_id, user_id)` and
-- `class_sessions` PK `id`. No index is added, because an index nobody's plan
-- reaches for costs every INSERT for nothing — same rule as 0034's header.
--
-- Idempotent: `drop policy if exists` before `create policy`. Required, not
-- optional — `db/scripts/apply-migrations.sh` has no ledger for pre-0039 files
-- and replays are a normal event.
-- ============================================================================

drop policy if exists traces_select_admin_guest on itera.activity_traces;
create policy traces_select_admin_guest on itera.activity_traces
  for select to authenticated
  using (
    user_id in (
      select cg.user_id
      from itera.class_guests cg
      join itera.class_sessions s on s.id = cg.session_id
      where s.tenant_id in (select itera.current_admin_tenant_ids())
    )
  );

comment on policy traces_select_admin_guest on itera.activity_traces is
  $$Lets a tenant_admin WATCH the trace of a link-invited guest of one of their
own class sessions (migration 0041).

WHY IT IS SEPARATE FROM traces_select_admin: that policy joins through
itera.memberships, and a guest holds ZERO membership rows by construction
(migration 0026, ADR-4 — the empty set IS the guest's security boundary). So a
guest trace is invisible to it, and widening it would mean giving guests
memberships, which is the one thing that boundary forbids.

SCOPE: tenant_admin ONLY (not instructor — Tainan TG 2026-08-04 R2, "so admin
assiste replay de aluno. so do tenant dele tbm."), and only for guests of
sessions belonging to that admin's tenant. SELECT only; the trace stays
append-only.

⚠️ THIS IS ABOUT REPLAY, NOT ANALYTICS. Tainan, 2026-08-05: guests generate a
trace, "dá pra dar replay, mas não vai pra analytics". Keeping guests out of
every aggregate is an APPLICATION rule, declared per consumer and locked by
src/test/traceEmissionBoundary.test.ts. Do not read this policy as permission
to count a guest.

⚠️ KEYED ON class_guests, NOT users.is_guest. The flag answers "is a guest
today" and ADR-7 keeps the promotion path open, so it moves; the class_guests
row is immutable history of the invitation. A policy on the flag would stop
returning a promoted person's old attempts.$$;
