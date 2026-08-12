-- ============================================================================
-- A aula não pode mais fechar sozinha com o professor na frente da turma.
--
-- INCIDENTE (aula real do Educar+, 2026-08-10): a sessão foi encerrada sozinha
-- com ~1h de aula. Quem encerrou foi o reaper da 0053, pela regra de OCIOSIDADE
-- (30 min), não pelo teto absoluto de 3h.
--
-- O reaper deriva `last_activity_at` de três sinais: `started_at`, a última
-- `class_answers.created_at` e o último `class_attendance.joined_at`. Nenhum dos
-- três cobre o trecho mais comum de uma aula boa — o professor explicando,
-- passando conceito, discutindo um exercício — porque ali ninguém entra e
-- ninguém responde. Meia hora disso é indistinguível, para o banco, de uma aba
-- fechada e esquecida, que é o caso que o reaper existe para matar.
--
-- A correção é dar ao banco o sinal que faltava em vez de afrouxar o prazo:
-- `heartbeat_at`, escrito pelo console do professor enquanto ele está com a aula
-- aberta (e no avanço de atividade, que também é presença). Afrouxar o prazo
-- traria de volta a sessão zumbi que trava o professor na próxima aula; o
-- heartbeat separa "sala em silêncio" de "sala abandonada", que era exatamente a
-- distinção que a heurística não conseguia fazer.
--
-- Aplica ao projeto Supabase da ITERA (kjefmwlopzeaqgqtlbdn) SOMENTE.
-- NÃO dfl-schema. NÃO DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- NULL é o valor honesto para sessão antiga: "nunca bateu coração". O
-- `coalesce` abaixo faz uma sessão sem heartbeat continuar sendo julgada
-- exatamente pelos três sinais de hoje. RLS inalterada: a coluna herda as
-- policies de class_sessions (0013). REPLICA IDENTITY FULL já está setado.
-- Idempotente.
-- ============================================================================

alter table itera.class_sessions
  add column if not exists heartbeat_at timestamptz;

-- ---------------------------------------------------------------------------
-- O reaper passa a considerar o heartbeat. O resto da função é o da 0053 —
-- mesmas duas regras, mesmos defaults, mesma re-checagem de status='live'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION itera.reap_stale_class_sessions(
  p_idle_minutes   integer DEFAULT 30,
  p_absolute_hours integer DEFAULT 3
)
RETURNS TABLE (
  id               uuid,
  tenant_id        uuid,
  instructor_id    uuid,
  started_at       timestamptz,
  last_activity_at timestamptz,
  reason           text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'itera', 'pg_catalog', 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT
      s.id,
      s.tenant_id,
      s.instructor_id,
      s.started_at,
      GREATEST(
        COALESCE(s.started_at, s.created_at),
        COALESCE(s.heartbeat_at, COALESCE(s.started_at, s.created_at)),
        COALESCE(
          (SELECT max(a.created_at) FROM itera.class_answers a WHERE a.session_id = s.id),
          COALESCE(s.started_at, s.created_at)
        ),
        COALESCE(
          (SELECT max(t.joined_at) FROM itera.class_attendance t WHERE t.session_id = s.id),
          COALESCE(s.started_at, s.created_at)
        )
      ) AS last_activity_at
    FROM itera.class_sessions s
    WHERE s.status = 'live'
  ),
  to_reap AS (
    SELECT
      c.id,
      c.tenant_id,
      c.instructor_id,
      c.started_at,
      c.last_activity_at,
      CASE
        WHEN c.started_at IS NOT NULL
             AND c.started_at < now() - make_interval(hours => p_absolute_hours)
          THEN format('absolute: live for >%s h', p_absolute_hours)
        ELSE format('idle: no answers/joins for >%s min', p_idle_minutes)
      END AS reason
    FROM candidates c
    WHERE
      (c.started_at IS NOT NULL AND c.started_at < now() - make_interval(hours => p_absolute_hours))
      OR (c.last_activity_at < now() - make_interval(mins => p_idle_minutes))
  )
  UPDATE itera.class_sessions s
     SET status   = 'ended',
         ended_at = now()
    FROM to_reap r
   WHERE s.id = r.id
     AND s.status = 'live'
  RETURNING s.id, r.tenant_id, r.instructor_id, r.started_at, r.last_activity_at, r.reason;
END;
$function$;

COMMENT ON FUNCTION itera.reap_stale_class_sessions(integer, integer) IS
  'Ends forgotten live class sessions. Reaps status=live rows that are idle '
  '(no heartbeat/answers/joins for p_idle_minutes, default 30) OR live beyond an '
  'absolute cap (p_absolute_hours, default 3). DB-side proxy for "0 users '
  'present" (realtime presence is not in the DB). Conservative: only touches '
  'live rows.';

REVOKE ALL ON FUNCTION itera.reap_stale_class_sessions(integer, integer) FROM PUBLIC;
