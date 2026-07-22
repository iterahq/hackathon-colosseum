-- ============================================================================
-- PR D — scheduled classes / "próxima aula" notice.
-- Plan: 20260717-itera-aula-piloto-feedback. Lets an instructor SCHEDULE a class
-- for a future time (status='pending', started_at NULL) so tenant learners see a
-- "Próxima aula" card on the dashboard; the instructor later "starts now"
-- (pending → live).
--
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- Nullable / no default → immediately-started sessions stay NULL. RLS is
-- unchanged: the column rides the existing class_sessions policies (0013), which
-- already (a) let tenant members SELECT pending sessions of their tenant and
-- (b) let the instructor INSERT/UPDATE their tenant's sessions. REPLICA IDENTITY
-- FULL is already set, so realtime payloads carry the value. Idempotent.
-- ============================================================================

alter table itera.class_sessions
  add column if not exists scheduled_at timestamptz;

comment on column itera.class_sessions.scheduled_at is
  'Intended start time for a pending (scheduled) class; NULL for immediately-started sessions.';
