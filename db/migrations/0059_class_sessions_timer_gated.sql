-- ============================================================================
-- T4 — per-session "travar exercício até eu iniciar o tempo".
-- Plan: 20260806-itera-aula-ao-vivo-alunos-reais (T4; Tainan na 1ª aula com
-- alunos reais: "se aula tem timer (prof configurar ao criar), travar disabled
-- se timer tiver desativado — antes ou depois de terminar, n deve poder mexer").
--
-- Por que uma COLUNA e não uma dedução no cliente: `learnerActivityGate` sabia
-- que o cronômetro desta atividade não está correndo, mas não sabia distinguir
-- "esta aula não usa cronômetro" de "o professor ainda não deu a largada".
-- Deduzir pela duração da atividade travaria TODO exercício de TODA aula, e uma
-- turma cujo professor nunca aperta "Iniciar tempo" ficaria sem responder nada.
--
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- `default false` (e não NULL): a ausência de escolha é a aula sem travamento,
-- que é o comportamento de hoje — nenhuma sessão existente muda de conduta.
-- RLS inalterada: a coluna pega as policies de class_sessions (0013).
-- REPLICA IDENTITY FULL já está setado, então o payload de realtime carrega o
-- valor sem config extra. Idempotente.
-- ============================================================================

alter table itera.class_sessions
  add column if not exists timer_gated boolean not null default false;
