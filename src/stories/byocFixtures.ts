/**
 * Fixtures da camada GERADA do BYOC.
 *
 * BYOC não é um `kind` — é uma camada sobre qualquer kind (`spec.byoc`), então
 * não entra no registro de contratos de `contractFixtures.ts`. O que a story
 * precisa é a árvore que a itera-api DEVOLVE (com gabarito embutido), não o
 * spec autorado.
 */
import type { GeneratedChoiceTree, SeedCollection } from '@iterahq/activity-spec';

/** O pedido do passo 1 — o que a autoria escreve pra puxar o contexto do aluno. */
export const BYOC_SEED_COLLECTION: SeedCollection = {
  prompt: 'Conte uma coisa que você gosta de fazer.',
  example: 'jogar futebol, fazer bolo, ouvir funk, desenhar',
  placeholder: 'Escreva aqui...',
};

/** `pick_best` — uma opção certa, apontada por `correct_option_id`. */
export const BYOC_PICK_BEST: GeneratedChoiceTree = {
  interaction: 'pick_best',
  options: [
    {
      id: 'vago',
      content: 'Me ajuda com futebol.',
      ai_response: 'Claro! Futebol é um esporte com duas equipes de 11 jogadores...',
    },
    {
      id: 'contexto',
      content:
        'Jogo futebol de quinta com amigos, sou zagueiro e queria melhorar a saída de bola. Me dá 3 exercícios pra treinar sozinho.',
      ai_response:
        '1) Passe na parede: 20 toques de cada pé... 2) Condução em zigue-zague... 3) Lançamento longo alvo...',
    },
  ],
  correct_option_id: 'contexto',
};

/** `judge_each` — o aluno classifica CADA opção; acerto = todas certas. */
export const BYOC_JUDGE_EACH: GeneratedChoiceTree = {
  interaction: 'judge_each',
  options: [
    {
      id: 'sem',
      content: 'Escreve sobre bolo.',
      ai_response: 'Bolo é uma massa assada feita com farinha, ovos e açúcar.',
      expected_verdict: 'bad',
    },
    {
      id: 'com',
      content:
        'Faço bolo de cenoura pra vender no bairro. Escreve uma legenda de Instagram de 2 linhas pra anunciar a fornada de sábado.',
      ai_response: 'Sábado tem fornada quentinha de bolo de cenoura com cobertura... encomenda no direct!',
      expected_verdict: 'good',
    },
  ],
};
