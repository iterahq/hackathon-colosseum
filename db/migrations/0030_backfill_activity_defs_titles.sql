-- ════════════════════════════════════════════════════════════════════════════
-- 0030 · Phase 2 — title_i18n backfill for itera.activity_defs
-- Plan: 20260728-itera-back-office · Verification item V12
-- 123 definitions · derived report signed off by Tainan (TG 2026-07-29 "aplica")
-- Report: https://media.devfellowship.com/ec3b702b-aeec-4c51-911a-32c1142ff972
--
-- 0024 created itera.activity_defs with `title_i18n jsonb not null default
-- '{}'::jsonb` and deliberately left every row blank (ADR-6: derivation is
-- report-first, with human sign-off). This migration is that sign-off landing.
--
-- IDEMPOTENCE — `db/scripts/apply-migrations.sh` replays EVERY file from 0001
-- on each run, with no ledger table, so this file must be a no-op on re-run:
--   * The UPDATE is guarded on `d.title_i18n = '{}'::jsonb`, so a second run
--     matches nothing (UPDATE 0) and a title a human has since curated is
--     never clobbered.
--   * The V12 assertion is scoped to THESE 123 ids, via a temp table that both
--     the UPDATE and the assertion read. A table-wide `WHERE title_i18n =
--     '{}'` assertion would have been a time bomb: the column defaults to
--     '{}', so the first activity_def authored without a title would make this
--     file raise forever and poison every subsequent apply-migrations.sh run
--     for every migration after it.
--
-- BLAST RADIUS — one column on one table. Does not touch `activities`,
-- `progress`, `activity_results`, or any RLS policy. No rows inserted or
-- deleted.
--
-- REVERSAL: UPDATE itera.activity_defs SET title_i18n = '{}'::jsonb
--           WHERE id IN (<the 123 ids below>);
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- Staged so the V12 assertion below can be scoped to exactly this migration's
-- id set. ON COMMIT DROP keeps it from leaking into any later migration file.
create temp table _backfill_0030_titles (
  id         uuid  primary key,
  title_i18n jsonb not null
) on commit drop;

insert into _backfill_0030_titles (id, title_i18n) values
  /* code · R2 · high */ ('ad4f7482-c7d3-4759-ad06-adf75424a496'::uuid, '{"en": "A lista abaixo é montada a partir do array tarefas, que tem 2 itens", "pt": "A lista abaixo é montada a partir do array tarefas, que tem 2 itens"}'::jsonb),
  /* code · R2 · medium */ ('0b31ebc4-e792-490d-bac4-f0d1a12bdcd8'::uuid, '{"en": "Clique no quadradinho do preview: não acontece nada", "pt": "Clique no quadradinho do preview: não acontece nada"}'::jsonb),
  /* code · R2 · high */ ('9123cb87-080f-49de-b1c9-3dedeac047a2'::uuid, '{"en": "Este botão já funciona, só está sem graça", "pt": "Este botão já funciona, só está sem graça"}'::jsonb),
  /* code · R2 · medium */ ('8bfbcb1c-e4da-4c8d-824d-acbb0a3f2171'::uuid, '{"en": "Os dois campos ainda não guardam o que você digita, e o botão não faz…", "pt": "Os dois campos ainda não guardam o que você digita, e o botão não faz…"}'::jsonb),
  /* concept · R2 · medium */ ('04378d96-c477-41fc-8675-e3334bfaa347'::uuid, '{"en": "The list on screen was not written item by item", "pt": "A lista que aparece na tela não foi escrita item por item"}'::jsonb),
  /* concept · R2 · high */ ('01c891da-21f1-4888-9891-991fef4d9c30'::uuid, '{"en": "Aula de hoje: listas na tela com .map() 🗺️", "pt": "Aula de hoje: listas na tela com .map() 🗺️"}'::jsonb),
  /* concept · R2 · high */ ('46029244-cb26-4d8f-95de-e969ec424bc0'::uuid, '{"en": "Bora aquecer com uns conceitos!", "pt": "Bora aquecer com uns conceitos!"}'::jsonb),
  /* concept · R2 · high */ ('d7ce9c04-238b-4864-819c-37d80616abf7'::uuid, '{"en": "Como o .map() funciona 🔁", "pt": "Como o .map() funciona 🔁"}'::jsonb),
  /* concept · R2 · medium */ ('b0d5300d-faf2-474e-b411-0a48a98077ce'::uuid, '{"en": "Wrong context hurts", "pt": "Contexto errado atrapalha"}'::jsonb),
  /* concept · R2 · high */ ('cc8187ab-eb35-486a-a52e-548e2b261679'::uuid, '{"en": "Examples are gold", "pt": "Exemplos valem ouro"}'::jsonb),
  /* concept · R2 · medium */ ('4d7b7a02-82f4-40b1-9911-7b5b0e2e11a0'::uuid, '{"en": "No new content today", "pt": "Hoje não tem conteúdo novo"}'::jsonb),
  /* concept · R2 · high */ ('6425ae97-6b99-4a52-96ef-4a06315f150f'::uuid, '{"en": "Mandou bem! Recapitulando 🚀", "pt": "Mandou bem! Recapitulando 🚀"}'::jsonb),
  /* concept · R2 · high */ ('1f4f9808-65ea-44cc-883a-52a359badc2e'::uuid, '{"en": "Mandou bem! 🎉", "pt": "Mandou bem! 🎉"}'::jsonb),
  /* concept · R2 · high */ ('0bcde6b9-e7d1-4ef8-b511-5c2152ad49ab'::uuid, '{"en": "O crachá de cada item: a prop key 🏷️", "pt": "O crachá de cada item: a prop key 🏷️"}'::jsonb),
  /* concept · R2 · high */ ('ca21f979-be85-43e7-b0d7-e7538a44b06d'::uuid, '{"en": "What is context?", "pt": "O que é contexto?"}'::jsonb),
  /* concept · R2 · high */ ('13cb3733-6648-4d5c-a685-9c604b06d878'::uuid, '{"en": "O que é o Claude Code?", "pt": "O que é o Claude Code?"}'::jsonb),
  /* concept · R2 · medium */ ('aacc5391-01be-469e-b393-f49501c532a3'::uuid, '{"en": "Your code only lives on your computer until you send it to the cloud", "pt": "Seu código só vive no seu computador até você mandar ele para a nuvem"}'::jsonb),
  /* concept · R2 · medium */ ('8060e73f-29d0-4253-a02f-acb1d1ba5173'::uuid, '{"en": "A good request answers three questions: who you are, what you want, and…", "pt": "Um bom pedido responde três perguntas: quem é você, o que você quer e…"}'::jsonb),
  /* concept · R2 · medium */ ('1c73d503-3fc1-4a28-a918-0325966c7c83'::uuid, '{"en": "A form is the same idea with more than one memory: one per field", "pt": "Um formulário é a mesma ideia, só que com mais de uma memória: uma para…"}'::jsonb),
  /* concept · R2 · medium */ ('80d719be-051f-4528-853a-452896abe889'::uuid, '{"en": "A screen with no state is a photo: nice, but frozen", "pt": "Uma tela sem estado é uma foto: bonita, mas parada"}'::jsonb),
  /* diagram · R2 · medium */ ('d2649461-f80f-44ec-8441-20d323e88eeb'::uuid, '{"en": "COMMIT — Desenhe o fluxograma do SEU processo…", "pt": "COMMIT — Desenhe o fluxograma do SEU processo…"}'::jsonb),
  /* diagram · R2 · medium */ ('05e58fa8-e09b-42cb-9e0a-ce2884828985'::uuid, '{"en": "COMMIT — Diagrama: como a tabela de decisão se conecta ao agente e às…", "pt": "COMMIT — Diagrama: como a tabela de decisão se conecta ao agente e às…"}'::jsonb),
  /* diagram · R2 · medium */ ('34f65f33-e921-42b0-8e37-20756ad2a1eb'::uuid, '{"en": "COMMIT — Diagrama: o modelo de dados unificado do produtor…", "pt": "COMMIT — Diagrama: o modelo de dados unificado do produtor…"}'::jsonb),
  /* diagram · R2 · medium */ ('251c7568-fecd-4942-8c00-d22c62af27c3'::uuid, '{"en": "COMMIT — Modele os dados da frota…", "pt": "COMMIT — Modele os dados da frota…"}'::jsonb),
  /* diagram · R2 · high */ ('b131c808-63ec-426c-bcfd-2e5978a51b4c'::uuid, '{"en": "COMMIT — Monte o diagrama ER do SEU processo", "pt": "COMMIT — Monte o diagrama ER do SEU processo"}'::jsonb),
  /* diagram · R2 · high */ ('f20fcc45-e4b9-4026-ac20-9d4cc5dc3ab5'::uuid, '{"en": "Diagrama da árvore DOM", "pt": "Diagrama da árvore DOM"}'::jsonb),
  /* diagram · R2 · high */ ('c14cbe4e-9f9d-4106-812f-31c0377438d5'::uuid, '{"en": "Pulse 5 — Exemplo de dashboard de telemática de frota", "pt": "Pulse 5 — Exemplo de dashboard de telemática de frota"}'::jsonb),
  /* diagram · R2 · high */ ('34346670-9c13-44a4-98e8-680aaf9e6d77'::uuid, '{"en": "Pulse 5 — Exemplo de dashboard unificado de cooperativa", "pt": "Pulse 5 — Exemplo de dashboard unificado de cooperativa"}'::jsonb),
  /* diagram · R2 · high */ ('cdf902fa-ee67-4e71-a49d-344a05eefe31'::uuid, '{"en": "Pulse 5 — Leia este diagrama de processo", "pt": "Pulse 5 — Leia este diagrama de processo"}'::jsonb),
  /* diagram · R2 · high */ ('5091521b-2e33-4baf-a59d-43e52648bdef'::uuid, '{"en": "Pulse 5 — O loop completo: observar → decidir → agir → verificar", "pt": "Pulse 5 — O loop completo: observar → decidir → agir → verificar"}'::jsonb),
  /* diagram · R2 · medium */ ('4ee812ce-3b9d-47e9-9d2c-0c03be13c0a2'::uuid, '{"en": "Pulse 5 — O loop do agente de frota: observar telemetria → decidir →…", "pt": "Pulse 5 — O loop do agente de frota: observar telemetria → decidir →…"}'::jsonb),
  /* diagram · R2 · high */ ('83911ea6-05e8-4e1d-974a-2c48b03e9814'::uuid, '{"en": "Pulse 5 — Onde a IA entra no fluxo de dados da cooperativa", "pt": "Pulse 5 — Onde a IA entra no fluxo de dados da cooperativa"}'::jsonb),
  /* diagram · R2 · medium */ ('166d0dc8-4f5f-4f67-9293-00fbeada50a0'::uuid, '{"en": "Pulse 5 — Veja a arquitetura de um sistema agêntico: o modelo de…", "pt": "Pulse 5 — Veja a arquitetura de um sistema agêntico: o modelo de…"}'::jsonb),
  /* document · R2 · high */ ('3c8246c6-e3cd-4f0e-8be0-4758ad7aebe6'::uuid, '{"en": "BADGE — Reflexão final", "pt": "BADGE — Reflexão final"}'::jsonb),
  /* document · R2 · high */ ('4ed5c58c-7a63-4355-be84-5d7814e69d6c'::uuid, '{"en": "COMMIT — Brief do agente de frota (artefato final)", "pt": "COMMIT — Brief do agente de frota (artefato final)"}'::jsonb),
  /* document · R2 · high */ ('4de254b3-582f-40b2-8d1e-800290a571ed'::uuid, '{"en": "COMMIT — Brief do agente de recebível/crédito agro", "pt": "COMMIT — Brief do agente de recebível/crédito agro"}'::jsonb),
  /* document · R2 · high */ ('d4b66be8-6dab-44a5-881c-7ff0b1fae48d'::uuid, '{"en": "COMMIT — Critique o modelo que a IA propôs (data-spec.md)", "pt": "COMMIT — Critique o modelo que a IA propôs (data-spec.md)"}'::jsonb),
  /* document · R2 · high */ ('2c269361-b830-4a97-b962-3b0369f489a9'::uuid, '{"en": "COMMIT — Escreva o BRIEF do seu agente (o artefato final do curso)", "pt": "COMMIT — Escreva o BRIEF do seu agente (o artefato final do curso)"}'::jsonb),
  /* document · R2 · high */ ('4c961cc8-3160-4a38-ab0d-abd088b3f4b0'::uuid, '{"en": "COMMIT — Gere o schema.sql executável a partir do seu ER", "pt": "COMMIT — Gere o schema.sql executável a partir do seu ER"}'::jsonb),
  /* document · R2 · high */ ('72e4afa9-a5d1-4332-b7fe-5befb2fe30b7'::uuid, '{"en": "COMMIT — Liste as decisões que um AGENTE poderia tomar", "pt": "COMMIT — Liste as decisões que um AGENTE poderia tomar"}'::jsonb),
  /* document · R2 · high */ ('f615c88a-1b45-4484-a672-d5adec47ff6c'::uuid, '{"en": "COMMIT — Spec da camada de dados de frota", "pt": "COMMIT — Spec da camada de dados de frota"}'::jsonb),
  /* document · R2 · high */ ('2ca5f72f-da6b-4331-b5e1-00d40a3a9196'::uuid, '{"en": "COMMIT — Spec do Portal-Produtor (1 página)", "pt": "COMMIT — Spec do Portal-Produtor (1 página)"}'::jsonb),
  /* document · R2 · high */ ('9e80de2e-a2b4-45cd-aa5a-179851e85479'::uuid, '{"en": "COMMIT — Tabela de decisão completa do seu processo", "pt": "COMMIT — Tabela de decisão completa do seu processo"}'::jsonb),
  /* document · R2 · high */ ('cc560cac-c7c0-4745-b430-9caecb0cedc9'::uuid, '{"en": "Descreva a estrutura de um documento HTML", "pt": "Descreva a estrutura de um documento HTML"}'::jsonb),
  /* document · R2 · high */ ('fda175ac-9905-4d0e-99a1-0b17e27564c9'::uuid, '{"en": "Escreva a sua primeira página HTML", "pt": "Escreva a sua primeira página HTML"}'::jsonb),
  /* document · R1 · high */ ('797579b9-cf0d-4867-833f-83f72a06ddf1'::uuid, '{"en": "Escreva seu primeiro doc", "pt": "Escreva seu primeiro doc"}'::jsonb),
  /* document · R2 · high */ ('9a47e3fe-61f3-434f-8678-ea8abe267727'::uuid, '{"en": "Pulse 2 — As 4 partes de um brief de agente", "pt": "Pulse 2 — As 4 partes de um brief de agente"}'::jsonb),
  /* document · R2 · high */ ('7e0f8e0d-225d-41b8-8435-31d323036f5b'::uuid, '{"en": "Pulse 2 — Decisão de manutenção como tabela", "pt": "Pulse 2 — Decisão de manutenção como tabela"}'::jsonb),
  /* document · R2 · high */ ('c71eac35-809b-4723-b22e-d006c4ae4354'::uuid, '{"en": "Pulse 2 — Escreva UMA regra como tabela de decisão", "pt": "Pulse 2 — Escreva UMA regra como tabela de decisão"}'::jsonb),
  /* document · R2 · high */ ('f03d7204-c0a9-49af-83da-c35f34f04048'::uuid, '{"en": "Pulse 2 — Que decisão de crédito você automatizaria?", "pt": "Pulse 2 — Que decisão de crédito você automatizaria?"}'::jsonb),
  /* document · R2 · high */ ('7f3ac8fa-f4e0-4e83-b54d-518d814219c2'::uuid, '{"en": "Pulse 3 — Escreva seu processo em 5 passos", "pt": "Pulse 3 — Escreva seu processo em 5 passos"}'::jsonb),
  /* document · R2 · high */ ('4d455283-6d30-414b-83ec-1bccf680808b'::uuid, '{"en": "Pulse 3 — Liste suas entidades cross-unidade", "pt": "Pulse 3 — Liste suas entidades cross-unidade"}'::jsonb),
  /* document · R2 · high */ ('8b675058-49c2-43e6-97e1-68a23d6a1fde'::uuid, '{"en": "Pulse 3 — Modele 4 entidades da sua frota", "pt": "Pulse 3 — Modele 4 entidades da sua frota"}'::jsonb),
  /* document · R2 · high */ ('2ae4f614-9a82-4d98-91c8-f2f9796f3d79'::uuid, '{"en": "Pulse 4 — As 4 partes do agente de frota", "pt": "Pulse 4 — As 4 partes do agente de frota"}'::jsonb),
  /* document · R2 · high */ ('b6623b02-e56c-452d-b14c-3d0a0d3ba3c8'::uuid, '{"en": "Pulse 4 — Modele COM a IA (não no seu lugar)", "pt": "Pulse 4 — Modele COM a IA (não no seu lugar)"}'::jsonb),
  /* document · R2 · high */ ('4abd595e-bc66-49f7-beca-e7388cb8d775'::uuid, '{"en": "Pulse 4 — Modele COM a IA (não para você)", "pt": "Pulse 4 — Modele COM a IA (não para você)"}'::jsonb),
  /* document · R2 · high */ ('83569359-aef7-4f71-b143-5e6393047b64'::uuid, '{"en": "Pulse 4 — Pergunta de negócio para a IA", "pt": "Pulse 4 — Pergunta de negócio para a IA"}'::jsonb),
  /* match · R2 · high */ ('231e8c99-1f2f-4476-a78c-0d16fa188fe2'::uuid, '{"en": "CRUD: ligue cada ação ao que ela faz", "pt": "CRUD: ligue cada ação ao que ela faz"}'::jsonb),
  /* match · R2 · high */ ('befb41b9-0b20-49d6-bf7b-ebe111736864'::uuid, '{"en": "Ligue a ferramenta com pra que ela serve", "pt": "Ligue a ferramenta com pra que ela serve"}'::jsonb),
  /* match · R2 · high */ ('5d3ba640-853e-43e7-9ed7-b27040c8b305'::uuid, '{"en": "Ligue cada comando com o que ele faz", "pt": "Ligue cada comando com o que ele faz"}'::jsonb),
  /* match · R2 · high */ ('40d2d3f1-8dba-4716-862f-f29a20233cdd'::uuid, '{"en": "Ligue cada parte com o que ela faz", "pt": "Ligue cada parte com o que ela faz"}'::jsonb),
  /* match · R2 · high */ ('e9819208-ee6e-43a1-993a-10b11f758de2'::uuid, '{"en": "Connect each weak request to the information it is missing", "pt": "Ligue cada pedido fraco à informação que falta nele"}'::jsonb),
  /* match · R2 · high */ ('21fdfe75-a40d-4aa9-b5d2-6ee30b2df6d9'::uuid, '{"en": "Ligue cada peça com o que ela faz numa lista", "pt": "Ligue cada peça com o que ela faz numa lista"}'::jsonb),
  /* match · R2 · high */ ('cb35e2ca-ee7b-46b4-8341-db4fc0a887a2'::uuid, '{"en": "Connect each type of context to its purpose", "pt": "Ligue cada tipo de contexto à sua função"}'::jsonb),
  /* multi_choice · R2 · high */ ('cd7298f3-a6a6-418b-9c86-05bf66855ca0'::uuid, '{"en": "Select ALL the information that helps the AI answer you better", "pt": "Marque TODAS as informações que ajudam a IA a te responder melhor"}'::jsonb),
  /* multi_choice · R2 · high */ ('ec6c8b4e-9484-423e-b3d3-17ce2ad8f7be'::uuid, '{"en": "What makes GOOD context?", "pt": "O que faz parte de um BOM contexto?"}'::jsonb),
  /* multi_choice · R2 · high */ ('b044e5af-a79c-4205-b624-6e40dee6116d'::uuid, '{"en": "Quais coisas fazem parte de criar um site?", "pt": "Quais coisas fazem parte de criar um site?"}'::jsonb),
  /* multi_choice · R2 · high */ ('5b75904e-1a62-497a-a029-fd29e50ae621'::uuid, '{"en": "Quais destas coisas o Claude Code consegue fazer?", "pt": "Quais destas coisas o Claude Code consegue fazer?"}'::jsonb),
  /* multi_choice · R2 · high */ ('e767090c-5caf-4def-a806-0062723a8300'::uuid, '{"en": "Quais valores são BONS pra usar como key?", "pt": "Quais valores são BONS pra usar como key?"}'::jsonb),
  /* order · R2 · high */ ('30f6f0dc-69ed-4abc-88ad-05bc7320c59e'::uuid, '{"en": "Arraste na ordem que faz sentido pra ver um site funcionando", "pt": "Arraste na ordem que faz sentido pra ver um site funcionando"}'::jsonb),
  /* order · R2 · high */ ('42b85de0-124c-424f-b130-d92cff1b73e0'::uuid, '{"en": "Arraste na ordem que o React monta uma lista na tela", "pt": "Arraste na ordem que o React monta uma lista na tela"}'::jsonb),
  /* order · R2 · high */ ('610f6606-d37a-4b7a-b46e-c86903a2f346'::uuid, '{"en": "Coloque na ordem um fluxo de trabalho típico com o Claude Code", "pt": "Coloque na ordem um fluxo de trabalho típico com o Claude Code"}'::jsonb),
  /* quiz · R2 · medium */ ('e920b27f-cd32-4d71-91f0-95e800cf6414'::uuid, '{"en": "Para ligar pedidos de volta aos clientes, a tabela orders…", "pt": "Para ligar pedidos de volta aos clientes, a tabela orders…"}'::jsonb),
  /* quiz · R2 · high */ ('e50d5f4b-0a53-4415-82bc-89090547ca3b'::uuid, '{"en": "Pulse 1 — Com dados de recebível unificados, a IA pode estimar", "pt": "Pulse 1 — Com dados de recebível unificados, a IA pode estimar"}'::jsonb),
  /* quiz · R2 · high */ ('1d1b668c-793a-473a-ba8f-a2ca0f617905'::uuid, '{"en": "Pulse 1 — Manutenção preditiva, em uma frase, é", "pt": "Pulse 1 — Manutenção preditiva, em uma frase, é"}'::jsonb),
  /* quiz · R2 · high */ ('4f2e8290-5a3e-4668-a323-a11a405f022b'::uuid, '{"en": "Pulse 1 — Numa cooperativa multi-unidade, qual é a dor #1 de dados?", "pt": "Pulse 1 — Numa cooperativa multi-unidade, qual é a dor #1 de dados?"}'::jsonb),
  /* quiz · R2 · high */ ('16bab718-0ef3-40ae-a384-4ef4bc529636'::uuid, '{"en": "Pulse 1 — O que é um ''processo'' que vale a pena automatizar?", "pt": "Pulse 1 — O que é um ''processo'' que vale a pena automatizar?"}'::jsonb),
  /* quiz · R2 · high */ ('f51307c6-6039-4a53-b9bc-9ce9ae8b749e'::uuid, '{"en": "Pulse 1 — O que é uma entidade?", "pt": "Pulse 1 — O que é uma entidade?"}'::jsonb),
  /* quiz · R2 · high */ ('89a9683e-a48d-43f9-9215-1f2812ef68e7'::uuid, '{"en": "Pulse 1 — Por que separar a DECISÃO do CÓDIGO?", "pt": "Pulse 1 — Por que separar a DECISÃO do CÓDIGO?"}'::jsonb),
  /* quiz · R2 · medium */ ('cb4e7c52-47c9-42ab-a225-0e2145d23174'::uuid, '{"en": "Pulse 1 — Telemetria crua (GPS, RPM, combustível por segundo) por si só…", "pt": "Pulse 1 — Telemetria crua (GPS, RPM, combustível por segundo) por si só…"}'::jsonb),
  /* quiz · R2 · high */ ('c88febc0-52c6-4865-b5b3-0943513720a7'::uuid, '{"en": "Pulse 1 — Um ''agente'' (vs. um chatbot) é definido por", "pt": "Pulse 1 — Um ''agente'' (vs. um chatbot) é definido por"}'::jsonb),
  /* quiz · R2 · high */ ('1ac010e7-0f57-42fc-b30c-4dbf3bda154a'::uuid, '{"en": "Pulse 2 — No seu processo, o que é uma DECISÃO (vs. uma TAREFA)?", "pt": "Pulse 2 — No seu processo, o que é uma DECISÃO (vs. uma TAREFA)?"}'::jsonb),
  /* quiz · R2 · high */ ('708b66e8-21ad-43f2-8490-7e93c9b8d4bb'::uuid, '{"en": "Pulse 2 — Qual coluna permite ligar o mesmo produtor entre unidades?", "pt": "Pulse 2 — Qual coluna permite ligar o mesmo produtor entre unidades?"}'::jsonb),
  /* quiz · R2 · high */ ('894bd04c-d234-44b9-b028-25b9c35a6a7f'::uuid, '{"en": "Pulse 2 — Qual é a entidade que conecta os sinais a uma análise útil?", "pt": "Pulse 2 — Qual é a entidade que conecta os sinais a uma análise útil?"}'::jsonb),
  /* quiz · R2 · high */ ('87f7f19f-1489-4405-9453-34be179b0484'::uuid, '{"en": "Pulse 2 — Um Cliente faz quantos Pedidos?", "pt": "Pulse 2 — Um Cliente faz quantos Pedidos?"}'::jsonb),
  /* quiz · R2 · high */ ('81ef480e-8d73-41f6-af29-4aba7383b8fc'::uuid, '{"en": "Pulse 3 — Bom guardrail para um agente de frota", "pt": "Pulse 3 — Bom guardrail para um agente de frota"}'::jsonb),
  /* quiz · R2 · high */ ('2b57741e-534b-40fd-947c-853bd27dd9b9'::uuid, '{"en": "Pulse 3 — Qual destes é um bom guardrail para um agente de crédito agro?", "pt": "Pulse 3 — Qual destes é um bom guardrail para um agente de crédito agro?"}'::jsonb),
  /* quiz · R2 · medium */ ('f4813d61-b5bb-4711-8041-e53a6cdf9ae3'::uuid, '{"en": "Pulse 3 — Qual destes é um bom limite de segurança (guardrail) para um…", "pt": "Pulse 3 — Qual destes é um bom limite de segurança (guardrail) para um…"}'::jsonb),
  /* quiz · R2 · high */ ('4f04f651-e94b-4818-9f3d-971ae44a8db2'::uuid, '{"en": "Pulse 3 — Sua tabela de decisão tem 3 condições binárias", "pt": "Pulse 3 — Sua tabela de decisão tem 3 condições binárias"}'::jsonb),
  /* quiz · R2 · high */ ('beca0016-6d4e-4e01-90e1-c68408967492'::uuid, '{"en": "Pulse 4 — ''Otimização de rota'' depende de qual qualidade de dado?", "pt": "Pulse 4 — ''Otimização de rota'' depende de qual qualidade de dado?"}'::jsonb),
  /* quiz · R2 · high */ ('8d3dd664-f915-479f-805c-957ec68b11d3'::uuid, '{"en": "Pulse 4 — ''Recebível do produtor'' relaciona-se com Produtor como", "pt": "Pulse 4 — ''Recebível do produtor'' relaciona-se com Produtor como"}'::jsonb),
  /* quiz · R2 · high */ ('d6b68a07-398f-4997-81b5-fd5e6531e4cd'::uuid, '{"en": "Pulse 4 — ''Verificação'' no brief do agente serve para", "pt": "Pulse 4 — ''Verificação'' no brief do agente serve para"}'::jsonb),
  /* quiz · R2 · high */ ('17a8aec0-cac6-49ed-bec4-b51a23d31ef7'::uuid, '{"en": "Pulse 4 — Notação", "pt": "Pulse 4 — Notação"}'::jsonb),
  /* quiz · R2 · medium */ ('7c4b71d3-1f0a-41fc-8161-2400a181273d'::uuid, '{"en": "Seu trabalho vive num repo…", "pt": "Seu trabalho vive num repo…"}'::jsonb),
  /* sandbox_scenario · R1 · medium */ ('8015303d-24d3-462c-935c-7af10d76918a'::uuid, '{"en": "Wrong context hurts", "pt": "Contexto errado atrapalha"}'::jsonb),
  /* sandbox_scenario · R1 · medium */ ('d81f2cf5-8c54-480d-b5e4-fe0209652605'::uuid, '{"en": "Wrong context hurts", "pt": "Contexto errado atrapalha"}'::jsonb),
  /* sandbox_scenario · R1 · high */ ('9f24cd25-ca6b-428f-813d-3c242c9ec6ba'::uuid, '{"en": "Wrong context hurts — the polluted ask", "pt": "Contexto errado atrapalha — o pedido poluído"}'::jsonb),
  /* sandbox_scenario · R1 · high */ ('0f0a9a9c-65f4-4ed5-8a93-9357a90d6c40'::uuid, '{"en": "Context changes everything", "pt": "Contexto muda tudo"}'::jsonb),
  /* sandbox_scenario · R1 · high */ ('f56136d7-1bd3-46d1-95a6-384e8ab5d945'::uuid, '{"en": "Final mission — the complete brief", "pt": "Missão final — o pedido completo"}'::jsonb),
  /* sandbox_scenario · R1 · medium */ ('ad05079a-b35b-49ed-8e06-b6f3f74763c5'::uuid, '{"en": "Final mission: your problem, your context", "pt": "Missão final: teu problema, teu contexto"}'::jsonb),
  /* sandbox_scenario · R1 · medium */ ('d9f648f0-580c-4610-a2f4-ca21f9472f5c'::uuid, '{"en": "Final mission: your problem, your context", "pt": "Missão final: teu problema, teu contexto"}'::jsonb),
  /* sandbox_scenario · R1 · medium */ ('1356466f-af77-4873-b013-f90785b0116c'::uuid, '{"en": "Show an example", "pt": "Mostra um exemplo"}'::jsonb),
  /* sandbox_scenario · R1 · medium */ ('55340a8e-4992-4c9f-8114-4a02d6661067'::uuid, '{"en": "Show an example", "pt": "Mostra um exemplo"}'::jsonb),
  /* sandbox_scenario · R1 · high */ ('94b21c5b-0cf1-48cd-9443-e181b33aa238'::uuid, '{"en": "Show an example — with the format", "pt": "Mostra um exemplo — com o formato"}'::jsonb),
  /* sandbox_scenario · R1 · high */ ('668002db-4c04-47b7-8e82-95491cfcdac8'::uuid, '{"en": "The specific ask", "pt": "O pedido específico"}'::jsonb),
  /* sandbox_scenario · R1 · medium */ ('05629d96-573c-465b-8104-117f551141d2'::uuid, '{"en": "The vague ask", "pt": "O pedido vago"}'::jsonb),
  /* sandbox_scenario · R1 · medium */ ('c676f8fa-dc7b-48b8-b2b3-8f49e5688d28'::uuid, '{"en": "The vague ask", "pt": "O pedido vago"}'::jsonb),
  /* sandbox_scenario · R1 · medium */ ('3be192b3-ae53-4a47-96d8-73d9266c34e6'::uuid, '{"en": "Who am I", "pt": "Quem sou eu"}'::jsonb),
  /* sandbox_scenario · R1 · medium */ ('737a7bab-2224-46e6-baa2-7314d81bac66'::uuid, '{"en": "Who am I", "pt": "Quem sou eu"}'::jsonb),
  /* sandbox_scenario · R1 · high */ ('d4a9febd-6f9b-4e7f-9c2b-13b939a37d81'::uuid, '{"en": "Who am I — with a persona", "pt": "Quem sou eu — com persona"}'::jsonb),
  /* sandbox_scenario · R1 · high */ ('a2f6f3c6-f98d-491b-86d8-a83922b7609b'::uuid, '{"en": "Your case — now personalized", "pt": "Teu caso — agora personalizado"}'::jsonb),
  /* sandbox_scenario · R1 · medium */ ('0b4c6ce1-3712-4dcb-a099-2bab9e487d11'::uuid, '{"en": "Your case, your question", "pt": "Teu caso, tua pergunta"}'::jsonb),
  /* sandbox_scenario · R1 · medium */ ('d5def1aa-5180-4d79-8319-51781369861e'::uuid, '{"en": "Your case, your question", "pt": "Teu caso, tua pergunta"}'::jsonb),
  /* single_choice · R2 · high */ ('9775b9b9-cd94-4be6-ba18-b9115246b118'::uuid, '{"en": "E o useEffect, quando a gente usa?", "pt": "E o useEffect, quando a gente usa?"}'::jsonb),
  /* single_choice · R2 · high */ ('e1d3fac1-4272-4873-bb25-06c893364649'::uuid, '{"en": "No React, pra que serve o useState?", "pt": "No React, pra que serve o useState?"}'::jsonb),
  /* single_choice · R2 · high */ ('0f034518-6c8f-48d4-aa23-6e05aab66979'::uuid, '{"en": "O que é uma variável?", "pt": "O que é uma variável?"}'::jsonb),
  /* single_choice · R2 · high */ ('0df6de81-400a-43bd-8eff-c1a31eb27135'::uuid, '{"en": "Olha esse código: frutas.map(f => <li>{f}</li>) — o que está FALTANDO?", "pt": "Olha esse código: frutas.map(f => <li>{f}</li>) — o que está FALTANDO?"}'::jsonb),
  /* single_choice · R2 · high */ ('51e1984f-5ed8-484c-89c7-e5b6f8e08667'::uuid, '{"en": "Onde o Claude Code roda?", "pt": "Onde o Claude Code roda?"}'::jsonb),
  /* single_choice · R2 · high */ ('6c7ae2f7-c2f4-4fec-9174-881ffddbc286'::uuid, '{"en": "Pra que serve a prop key numa lista?", "pt": "Pra que serve a prop key numa lista?"}'::jsonb),
  /* single_choice · R2 · high */ ('7822bcae-61d7-496b-bee1-efcdc44d3d1b'::uuid, '{"en": "Pra que serve o HTML?", "pt": "Pra que serve o HTML?"}'::jsonb),
  /* single_choice · R2 · high */ ('3404fa5a-6788-458b-8a0c-ad8b42d13923'::uuid, '{"en": "Which message gives the AI MORE context?", "pt": "Qual mensagem dá MAIS contexto para a IA?"}'::jsonb),
  /* single_choice · R2 · high */ ('e5af9362-f8ef-402e-b11a-51efb7a5808a'::uuid, '{"en": "Temos um array com 30 nomes", "pt": "Temos um array com 30 nomes"}'::jsonb),
  /* single_choice · R2 · high */ ('9ac08de8-8c31-4be5-8f81-07e1f22759dd'::uuid, '{"en": "You want the AI to write an apology email to a customer", "pt": "Você quer que a IA escreva um e-mail de desculpas para um cliente"}'::jsonb);

update itera.activity_defs d
   set title_i18n = p.title_i18n,
       updated_at = now()
  from _backfill_0030_titles p
 where d.id = p.id
   and d.title_i18n = '{}'::jsonb;   -- ← idempotence guard: never overwrites a curated title

-- V12 assertion: none of the 123 definitions this migration owns is left
-- without a title. Scoped on purpose — see IDEMPOTENCE note in the header.
do $$
declare blank int;
begin
  select count(*) into blank
    from itera.activity_defs d
    join _backfill_0030_titles p on p.id = d.id
   where d.title_i18n = '{}'::jsonb;
  if blank <> 0 then
    raise exception 'V12 failed: % of the 123 backfilled activity_defs still have an empty title_i18n', blank;
  end if;
end $$;

commit;
