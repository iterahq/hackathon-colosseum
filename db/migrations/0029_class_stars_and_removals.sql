-- ============================================================================
-- Ações do professor sobre um aluno na aula ao vivo — estrela e remoção.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- O menu "⋯" do aluno ganha 5 ações. Três delas não precisam de banco:
-- puxar pro palco e abaixar a mão já são broadcast, e a mão vive em PRESENÇA
-- (só o dono escreve a própria), então abaixar a mão de outro é sempre um
-- pedido ao cliente dele — nunca uma escrita.
--
-- As outras duas precisam, e pelo mesmo motivo: broadcast é AUTO-ATESTADO.
-- `answered` já é assim hoje (o emissor nunca é comparado ao user_id do
-- payload), e ali o custo é baixo — é monótono e decorativo, o
-- `class_answers` é a verdade. Estrela é o placar, e remoção é disciplina:
-- se qualquer aluno pudesse emitir `star{user_id: <o meu>, delta: 5}` do
-- devtools, o pódio viraria ficção. Então o banco é a autoridade e o
-- broadcast só avisa.
--
-- Idempotente.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Pré-requisito duro: 0023 (tópico de controle com escrita só de staff).
--
-- Medido em prod 2026-07-29: só existe `itera_class_members_send`, permissiva
-- para `class:%` inteiro — ou seja, hoje qualquer aluno escreve no `:ctrl`.
-- As policies abaixo protegem o BANCO mesmo assim (é o INSERT que é gateado,
-- não o broadcast), mas sem a 0023 um aluno ainda forja o AVISO: some da lista
-- da turma inteira por um instante, ganha uma estrela na tela dos colegas até
-- o próximo refetch. Falhar aqui em voz alta é melhor que aplicar isto e achar
-- que fechou.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'realtime.messages'::regclass
      and polname = 'itera_class_control_send'
  ) then
    raise exception
      'aplique 0023_realtime_class_control_topic.sql antes desta: sem ela o topico class:<id>:ctrl aceita escrita de qualquer aluno';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- class_stars — livro-razão append-only de estrelas.
--
-- `delta` em vez de um contador mutável para que tirar uma estrela seja uma
-- LINHA NOVA, não um UPDATE: assim não existe caminho de escrita que apague
-- histórico, e a tabela não tem policy de UPDATE nem de DELETE (default-deny).
-- O saldo é soma em TS (dfl-db-simplicity: sem trigger, sem plpgsql), com piso
-- em zero no cliente.
-- ---------------------------------------------------------------------------
create table if not exists itera.class_stars (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references itera.class_sessions(id) on delete cascade,
  user_id     uuid not null references itera.users(id)          on delete cascade,
  delta       smallint not null check (delta in (-1, 1)),
  -- restrict, não cascade: o ledger é append-only, e apagar a linha do professor
  -- não pode reescrever silenciosamente as estrelas que ele deu.
  awarded_by  uuid not null references itera.users(id)          on delete restrict,
  created_at  timestamptz not null default now()
);

create index if not exists class_stars_session_idx on itera.class_stars (session_id);

alter table itera.class_stars enable row level security;

-- Escrita: só quem pode dirigir a aula, e o `awarded_by` é forçado a ser o
-- próprio chamador — a autoria não é campo de confiança do cliente. Reusa
-- `can_control_class_topic` (0023) montando o nome do tópico, para não existir
-- uma SEGUNDA definição de "quem é staff desta aula" divergindo da primeira.
drop policy if exists class_stars_insert_staff on itera.class_stars;
create policy class_stars_insert_staff on itera.class_stars
  for insert to authenticated
  with check (
    awarded_by = itera.current_itera_user_id()
    and itera.can_control_class_topic('class:' || session_id::text)
  );

-- Leitura: qualquer participante da aula — o placar é público para a turma,
-- como o pódio já é. Mesmo predicado do canal realtime.
drop policy if exists class_stars_select on itera.class_stars;
create policy class_stars_select on itera.class_stars
  for select to authenticated
  using (itera.can_access_class_topic('class:' || session_id::text));

grant select, insert on itera.class_stars to authenticated;

comment on table itera.class_stars is
  'Estrelas dadas pelo professor na aula ao vivo (migration 0029). Append-only: tirar uma estrela e um delta -1, nunca um DELETE. Soma no pontos do podio junto com os acertos.';

-- ---------------------------------------------------------------------------
-- class_removals — tirar o aluno da sala, de verdade e reversível.
--
-- Remoção por broadcast seria cosmética: o aluno dá F5, o cliente reconecta e
-- ele volta. Aqui a linha NEGA o JOIN no canal realtime (seção seguinte), então
-- o refresh não traz de volta. Reversível por design: staff apaga a linha e o
-- aluno reentra — sem isso, um clique errado no tablet seria permanente.
-- ---------------------------------------------------------------------------
create table if not exists itera.class_removals (
  session_id uuid not null references itera.class_sessions(id) on delete cascade,
  user_id    uuid not null references itera.users(id)          on delete cascade,
  removed_by uuid not null references itera.users(id)          on delete restrict,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

alter table itera.class_removals enable row level security;

drop policy if exists class_removals_insert_staff on itera.class_removals;
create policy class_removals_insert_staff on itera.class_removals
  for insert to authenticated
  with check (
    removed_by = itera.current_itera_user_id()
    and itera.can_control_class_topic('class:' || session_id::text)
  );

drop policy if exists class_removals_delete_staff on itera.class_removals;
create policy class_removals_delete_staff on itera.class_removals
  for delete to authenticated
  using (itera.can_control_class_topic('class:' || session_id::text));

-- O removido precisa ler a PRÓPRIA linha: é assim que a tela dele sabe dizer
-- "sua participação foi encerrada" em vez de ficar num spinner de reconexão
-- que nunca conecta. `can_access_class_topic` já o exclui, então a leitura de
-- staff é a outra perna.
drop policy if exists class_removals_select on itera.class_removals;
create policy class_removals_select on itera.class_removals
  for select to authenticated
  using (
    user_id = itera.current_itera_user_id()
    or session_id in (
      select s.id from itera.class_sessions s
      where s.tenant_id in (select itera.current_instructor_tenant_ids())
    )
  );

grant select, insert, delete on itera.class_removals to authenticated;

comment on table itera.class_removals is
  'Aluno tirado da sala ao vivo (migration 0029). Nega o JOIN no canal realtime via can_access_class_topic, entao F5 nao traz de volta. Staff apaga a linha para readmitir.';

-- ---------------------------------------------------------------------------
-- can_access_class_topic — nova perna de negação.
--
-- Corpo idêntico ao da 0026 (as três pernas de acesso, verbatim) mais o `and
-- not exists` da remoção. A negação vem DEPOIS e vale para todas as pernas,
-- inclusive a de convidado: expulsar um convidado que reentra pelo /g/:code
-- também tem que valer.
--
-- As policies de `realtime.messages` (0022/0023) não são tocadas — só o
-- predicado que elas já chamam, como a 0026 fez.
-- ---------------------------------------------------------------------------
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
        or itera.is_current_user_guest_of(cs.id)
      )
      and not exists (
        select 1
        from itera.class_removals r
        where r.session_id = cs.id
          and r.user_id = itera.current_itera_user_id()
      )
  );
$$;

grant execute on function itera.can_access_class_topic(text) to authenticated;

comment on function itera.can_access_class_topic(text) is
  'Quem pode entrar no canal da aula: membro do tenant, aula global ao vivo ou convidado registrado (0026) — e nao removido (0029).';

commit;
