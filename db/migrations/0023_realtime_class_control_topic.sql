-- ============================================================================
-- Split the live-class Realtime channel into an instructor-WRITE control topic
-- and the shared participant topic.
--
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- 0022 closed "any authenticated stranger" but left every participant able to
-- SEND every event: a learner could broadcast `advance`, stop the timer (which
-- reveals the answer to the class), or issue a `stage-request` and read back a
-- classmate's code. realtime.messages RLS can't see the broadcast EVENT name —
-- but it does see the TOPIC. So the instructor-only events move to their own
-- topic and RLS gates the send.
--
--   class:<id>        shared — presence, `answered`, and the learner's reply to
--                     a pull. Participants read + send (unchanged).
--   class:<id>:ctrl   control — advance / timer / timer-stop / stage-request /
--                     stage-show / stage-clear. Participants READ; only class
--                     STAFF may send.
--
-- The session id stays in segment 2, so itera.can_access_class_topic() (0022)
-- keeps working for both. Idempotent.
--
-- Deploy order: this migration FIRST, then the player. Old clients only use the
-- shared topic, which this does not restrict.
-- ============================================================================

begin;

-- Mirrors class_sessions_update_staff (0013): whoever may advance the durable
-- pointer is exactly who may drive the class over the wire. SECURITY DEFINER to
-- bypass class_sessions RLS (no recursion); id compared as text so a malformed
-- topic can't raise on an invalid uuid cast.
create or replace function itera.can_control_class_topic(topic_name text)
returns boolean
language sql
stable
security definer
set search_path = itera, public
as $$
  select exists (
    select 1
    from itera.class_sessions cs
    where cs.id::text = split_part(topic_name, ':', 2)
      and cs.tenant_id in (select itera.current_instructor_tenant_ids())
  );
$$;

grant execute on function itera.can_control_class_topic(text) to authenticated;

-- READ is unchanged: any participant of the session may join both topics.
drop policy if exists itera_class_members_read on realtime.messages;
create policy itera_class_members_read on realtime.messages
  for select to authenticated
  using (
    realtime.topic() like 'class:%'
    and itera.can_access_class_topic(realtime.topic())
  );

-- SEND on the shared topic — participants, and ONLY on the bare two-segment
-- topic. An allowlist, not a `<> 'ctrl'` denylist: any future sibling topic
-- (`class:<id>:staff`, …) must opt in explicitly instead of being writable by
-- every participant the day it is introduced.
drop policy if exists itera_class_members_send on realtime.messages;
create policy itera_class_members_send on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'class:%'
    and split_part(realtime.topic(), ':', 3) = ''
    and itera.can_access_class_topic(realtime.topic())
  );

-- SEND on the control topic — staff only. Permissive policies are OR'd, so this
-- is the only route to a `:ctrl` insert.
drop policy if exists itera_class_control_send on realtime.messages;
create policy itera_class_control_send on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'class:%:ctrl'
    and itera.can_control_class_topic(realtime.topic())
  );

commit;
