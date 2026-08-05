/**
 * Fixtures da camada GERADA do BYOC.
 *
 * BYOC não é um `kind` — é uma camada sobre qualquer kind (`spec.byoc`), então
 * não entra no registro de contratos de `contractFixtures.ts`. O que a story
 * precisa é a árvore que a itera-api DEVOLVE (com gabarito embutido), não o
 * spec autorado.
 */
import type { ByocSpec, GeneratedChoiceTree, SeedCollection } from '@iterahq/activity-spec';
import type { ByocGeneration } from '@/types/byoc';

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

/**
 * `build_context` — rodadas encadeadas, SEM gabarito. O que muda entre as opções
 * é a resposta da IA, não a nota; o prêmio é o pedido que o aluno montou.
 */
export const BYOC_BUILD_CONTEXT: GeneratedChoiceTree = {
  interaction: 'build_context',
  rounds: [
    {
      id: 'r1',
      question: 'Quem está pedindo?',
      options: [
        {
          id: 'a',
          content: 'Sou zagueiro e jogo de quinta com os amigos.',
          ai_response: 'Como zagueiro, o seu ganho mais rápido está na saída de bola sob pressão.',
        },
        {
          id: 'b',
          content: 'Sou goleiro e treino duas vezes por semana.',
          ai_response: 'Como goleiro, dá pra ganhar muito em posicionamento antes do chute.',
        },
      ],
    },
    {
      id: 'r2',
      question: 'O que você quer receber?',
      options: [
        {
          id: 'a',
          content: 'Quero 3 exercícios pra treinar sozinho.',
          ai_response: '1) Passe na parede, 20 toques de cada pé. 2) Condução em zigue-zague. 3) Lançamento no alvo.',
        },
        {
          id: 'b',
          content: 'Quero entender o meu erro mais comum.',
          ai_response: 'O erro mais comum na sua posição é decidir o passe depois de receber, e não antes.',
        },
      ],
    },
    {
      id: 'r3',
      question: 'Como você quer a resposta?',
      options: [
        {
          id: 'a',
          content: 'Em lista curta, direto ao ponto.',
          ai_response: '• Passe na parede — 10 min\n• Zigue-zague — 10 min\n• Lançamento — 10 min',
        },
        {
          id: 'b',
          content: 'Explicando o porquê de cada coisa.',
          ai_response: 'Comece pelo passe na parede: ele treina o toque de primeira, que é o que te tira da pressão.',
        },
      ],
    },
  ],
};

/** O mesmo harness, na interação `build_context` (montar o próprio pedido). */
export const BYOC_BUILD_CONTEXT_SPEC: ByocSpec = {
  seed: BYOC_SEED_COLLECTION,
  harness: {
    generation_prompt:
      'O aluno gosta de: {seed}. Monte com ele um pedido para uma IA sobre esse assunto, ' +
      'uma parte por vez, e a resposta que a IA daria para cada escolha.',
    interaction: 'build_context',
  },
  fallback: BYOC_BUILD_CONTEXT,
};

/**
 * O spec BYOC completo, como a autoria escreve em `activities.spec.byoc`: pedido
 * da seed + harness + a árvore autorada de reserva (ADR-7).
 *
 * O `{seed}` do `generation_prompt` é obrigatório no Zod do pacote — é onde o
 * texto do aluno entra no prompt do modelo.
 */
export const BYOC_PICK_BEST_SPEC: ByocSpec = {
  seed: BYOC_SEED_COLLECTION,
  harness: {
    generation_prompt:
      'O aluno gosta de: {seed}. Gere duas versões do MESMO pedido para uma IA — ' +
      'uma vaga e uma com contexto — e a resposta que a IA daria para cada uma.',
    interaction: 'pick_best',
  },
  fallback: BYOC_PICK_BEST,
};

/** O mesmo harness, na interação `judge_each` (classificar cada opção). */
export const BYOC_JUDGE_EACH_SPEC: ByocSpec = {
  seed: BYOC_SEED_COLLECTION,
  harness: {
    generation_prompt:
      'O aluno gosta de: {seed}. Gere pedidos para uma IA sobre esse assunto, ' +
      'alguns bons e outros ruins, com a resposta que a IA daria para cada um.',
    interaction: 'judge_each',
  },
  fallback: BYOC_JUDGE_EACH,
};

/**
 * Uma geração como a itera-api devolve quando o modelo respondeu de verdade.
 *
 * Os valores aqui são o CAMINHO NORMAL do servidor, não o raro: `persisted` e
 * `reused` são os dois que a story errava. Toda resposta de sucesso da itera-api
 * grava a linha (`persisted: true`); `false` é o galho em que a escrita falhou e
 * a árvore volta sem lastro. Um dev que lesse a fixture ia tratar o excepcional
 * como padrão.
 */
export function byocGeneration(seed: string, tree: GeneratedChoiceTree): ByocGeneration {
  return {
    generation_id: `story-${tree.interaction}`,
    activity_id: 'story-byoc',
    attempt: 1,
    seed,
    // `'choice_tree'` é literal no servidor e NÃO é a interação — quem quer saber
    // se é escolher-uma ou julgar-cada lê `generated.interaction`.
    mode: 'choice_tree',
    generated: tree,
    fallback_used: false,
    attempts_used: 1,
    model: 'storybook-mock',
    degraded_reason: null,
    attempt_notes: [],
    created_at: null,
    reused: false,
    generation_available: true,
    persisted: true,
  };
}

/**
 * A linha DEGRADADA — o servidor persiste a reserva autorada como se fosse a
 * geração, e é `fallback_used` (não a ausência de linha) que leva a tela pra fase
 * `fallback`. Sem esta variante a story do fallback mostraria `generation` nula,
 * um estado que a itera-api não produz.
 */
export function byocFallbackGeneration(seed: string, tree: GeneratedChoiceTree): ByocGeneration {
  return {
    ...byocGeneration(seed, tree),
    fallback_used: true,
    // Duas tentativas, e a primeira deixou rastro: `degraded_reason` só guarda o
    // motivo TERMINAL, então sem `attempt_notes` o "por que a 1ª falhou" some.
    attempts_used: 2,
    degraded_reason: 'generation_failed',
    attempt_notes: ['tentativa 1: correct_option_id aponta pra uma opção que não existe'],
    generation_available: false,
  };
}
