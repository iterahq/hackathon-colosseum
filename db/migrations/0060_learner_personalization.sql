-- ============================================================================
-- Itera migration 0060 — itera.learner_personalization: o elenco do aluno.
-- Aplica ao projeto Supabase da ITERA (kjefmwlopzeaqgqtlbdn) SOMENTE.
-- NÃO é dfl-schema. ADR-3 / ADR-26. Idempotente.
--
-- POR QUE
-- -------
-- O autor escreve `{{familiar.nome}}` no enunciado e o player troca na hora.
-- Pra trocar na hora ele precisa do valor ANTES de renderizar, e o valor tem
-- que sobreviver a trocar de aparelho — senão o aluno redigita o nome da mãe a
-- cada aula. Uma LINHA por aluno, um jsonb com o elenco.
--
-- Isto é a via rápida do BYOC: o caminho gerativo (`itera.byoc_generations`)
-- continua existindo pro caso em que vale esperar o modelo escrever a atividade
-- inteira. Aqui não há modelo nenhum, então não há o que auditar por tentativa —
-- é estado do aluno, não histórico de geração.
--
-- ⚠️ ISTO É DADO PESSOAL DE TERCEIRO, E DE MENOR DE IDADE.
-- Os valores nomeiam a mãe, o pai, a avó e um amigo de um adolescente. Por isso
-- a RLS aqui é ESTRITAMENTE do próprio dono — sem a política de leitura por
-- instrutor e sem a de admin de tenant que `activity_traces` e `progress` têm.
-- Instrutor precisa saber se o aluno respondeu, não como a mãe dele se chama.
-- Se um dia alguém quiser exibir isso no back-office, é decisão de produto com
-- consentimento, não uma policy a mais adicionada de passagem.
--
-- POR QUE jsonb E NÃO UMA COLUNA POR CAMPO
-- ----------------------------------------
-- O vocabulário de campos vive em `src/utils/personalization.ts` e vai crescer
-- (avó, irmão, cidade). Campo novo tem que custar UMA linha de TypeScript, não
-- uma migration — que é exatamente o critério de `dfl-db-simplicity`: lógica no
-- TS testável, banco fino. O banco aqui guarda um saco de strings curtas e não
-- opina sobre ele.
-- ============================================================================

create table if not exists itera.learner_personalization (
  user_id    uuid primary key references itera.users(id) on delete cascade,
  values     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Saco de strings, e só. O teto de tamanho existe porque o cliente sanitiza
-- (40 chars por valor) e um cliente sanitizando é uma promessa, não uma
-- garantia — quem escreve é o PostgREST autenticado, que aceita o que mandarem.
alter table itera.learner_personalization
  drop constraint if exists learner_personalization_values_object;
alter table itera.learner_personalization
  add constraint learner_personalization_values_object
  check (jsonb_typeof(values) = 'object' and pg_column_size(values) <= 4096);

alter table itera.learner_personalization enable row level security;

drop policy if exists personalization_rw_self on itera.learner_personalization;
create policy personalization_rw_self on itera.learner_personalization
  for all using (user_id = itera.current_itera_user_id())
  with check (user_id = itera.current_itera_user_id());

-- O `grant ... on all tables` da 0002 não alcança tabela criada depois.
grant select, insert, update, delete on itera.learner_personalization to authenticated;

-- Explícito, não redundante: a 0002 concede `to anon, authenticated` em bloco, e
-- a próxima migration que copiar aquele padrão abriria esta tabela em silêncio.
revoke all on itera.learner_personalization from anon;
