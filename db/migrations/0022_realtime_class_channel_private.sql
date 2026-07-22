-- ============================================================================
-- PR E / issue #57 — make the live-class Realtime channel `class:<sessionId>`
-- PRIVATE. Plan: 20260717-itera-aula-piloto-feedback.
--
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- Today the channel is public: any authenticated client that knows the
-- sessionId (it's in the join link) can join the topic and send broadcast /
-- presence. This adds RLS on `realtime.messages` so only a participant of the
-- session's audience may join (SELECT) or send (INSERT) on a `class:*` topic:
--   - a GLOBAL live session  → any authenticated user (v1 global-class scope), OR
--   - a tenant-scoped session → a member of that tenant.
--
-- Per-event authorization (only the instructor may `advance`) is NOT enforced
-- here: realtime.messages RLS sees the topic + extension, not the broadcast
-- event name, so it can't distinguish `advance` from `answered`. That control
-- stays client-side (durable pointer is instructor-only via 0013 RLS; a spoofed
-- non-null advance is reverted by the next durable read; `advance: null` is
-- ignored). This migration closes the "any authenticated stranger" hole, which
-- is the pilot-blocking concern. Idempotent.
-- ============================================================================

-- SECURITY DEFINER so the check bypasses class_sessions RLS (no recursion) and
-- reuses the same membership predicate as class_sessions_select (0013).
-- Compares cs.id as text to avoid casting a malformed topic to uuid.
create or replace function itera.can_access_class_topic(topic_name text)
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
      and (
        (cs.scope = 'global' and cs.status = 'live')
        or cs.tenant_id in (select itera.current_tenant_ids())
      )
  );
$$;

grant execute on function itera.can_access_class_topic(text) to authenticated;

-- realtime.messages already has RLS enabled (Supabase-managed). Public channels
-- bypass these policies; only channels joined with `config: { private: true }`
-- are gated — so this is inert until the player flips the class channel private.
drop policy if exists itera_class_members_read on realtime.messages;
create policy itera_class_members_read on realtime.messages
  for select to authenticated
  using (
    realtime.topic() like 'class:%'
    and itera.can_access_class_topic(realtime.topic())
  );

drop policy if exists itera_class_members_send on realtime.messages;
create policy itera_class_members_send on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'class:%'
    and itera.can_access_class_topic(realtime.topic())
  );
