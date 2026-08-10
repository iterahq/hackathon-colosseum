-- 0061 — aposenta itera.class_stars.
--
-- A estrela do professor saiu do produto (plano
-- 20260806-itera-aula-ao-vivo-alunos-reais, decisão C2 / ADR-6 do plano pai
-- 20260728-itera-aula-ao-vivo-call-lideres): não tinha uso claro, e ela NÃO era
-- enfeite — `rankByScore` somava `correctCount + stars` como ponto de pódio.
-- Nenhum cliente lê nem escreve mais nessa tabela.
--
-- A tabela FICA. Ela é append-only e guarda o histórico das aulas que já
-- aconteceram; um DROP seria irreversível para desfazer uma decisão de produto
-- que pode voltar. O que muda é o privilégio: sem call-site, `insert` é
-- superfície de escrita sem dono, então ele é revogado (a RLS já exigia staff da
-- aula — isto é a segunda perna, não a primeira). `select` continua para quem
-- for ler o histórico.
--
-- Idempotente: `revoke` e `comment on` são ambos repetíveis.

revoke insert on itera.class_stars from authenticated;

comment on table itera.class_stars is
  'APOSENTADA (migration 0061). Estrelas dadas pelo professor na aula ao vivo (migration 0029). Append-only: tirar uma estrela era um delta -1, nunca um DELETE. NAO conta mais ponto no podio e nenhum cliente escreve: insert revogado, tabela mantida so pelo historico.';
