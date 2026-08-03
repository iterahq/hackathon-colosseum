-- ============================================================================
-- Allow participants to SEND on the live-class cursor topic
-- `class:<sessionId>:cursor`.
--
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- Plan: 20260728-itera-palco-auto-professor-e-espelho-de-cursor (Fase 2).
--
-- ## Why a migration is needed at all
--
-- 0023 deliberately made the participant-send policy an ALLOWLIST rather than a
-- `<> 'ctrl'` denylist:
--
--     and split_part(realtime.topic(), ':', 3) = ''
--
-- with the comment "any future sibling topic (`class:<id>:staff`, …) must opt
-- in explicitly instead of being writable by every participant the day it is
-- introduced." The cursor topic is that future sibling. Without this file it is
-- READABLE (the read policy is a plain `class:%`) but writable by nobody, so
-- the mirror would join fine and then silently never emit — the exact
-- failure mode that policy shape was designed to make loud instead of subtle.
--
-- ## Why participants and not staff-only
--
-- The emitter is whoever is ON STAGE, which is normally a learner (or a
-- link-invited guest — plan Q2 = "convidado igual a aluno"). Staff-only would
-- mirror only the professor's own cursor, i.e. exactly the case the feature was
-- NOT asked for.
--
-- Forgery is bounded the same way `stage-show` already bounds it (plan R5):
-- realtime.messages RLS authorizes the TOPIC by session participation, never
-- the sender's role, so the CLIENT is what narrows the stream — every receiver
-- drops a `stage-cursor` whose `userId` is not the current
-- `stagedAnswer.author.userId`. A classmate can put bytes on the topic; they
-- cannot move the cursor the class is watching. This is inherited behaviour,
-- not a new hole. The worst case is wasted messages, and only from someone
-- already inside the class.
--
-- The session id stays in segment 2, so itera.can_access_class_topic() (0022)
-- keeps working unchanged.
--
-- Idempotent (drop-then-create; no ledger — see db/README.md).
--
-- Deploy order: this migration FIRST, then the player. An older client never
-- joins this topic, and a newer client whose sends are refused degrades to
-- "no cursor" with the stage itself untouched.
-- ============================================================================

begin;

-- Permissive policies are OR'd, so this is purely additive: it opens exactly
-- the `:cursor` sibling and leaves the shared-topic and `:ctrl` policies from
-- 0023 exactly as they are.
drop policy if exists itera_class_cursor_send on realtime.messages;
create policy itera_class_cursor_send on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'class:%:cursor'
    and itera.can_access_class_topic(realtime.topic())
  );

commit;
