import type { Meta, StoryObj } from '@storybook/react';
import { ByocActivityView } from '@/components/branded/activity/byoc/ByocActivityView';
import { ByocFlow } from './ByocFlow';
import { byocHostActivity } from './byocFlowMock';
import {
  BYOC_JUDGE_EACH,
  BYOC_JUDGE_EACH_SPEC,
  BYOC_PICK_BEST,
  BYOC_PICK_BEST_SPEC,
} from './byocFixtures';
import { withActivityWidth } from './decorators';

/**
 * BYOC ("Bring Your Own Context") — **o fluxo inteiro, os dois passos**.
 *
 * BYOC não é um `kind`: é uma CAMADA (`spec.byoc`) sobre qualquer atividade. O
 * aluno escreve o próprio contexto (passo 1), a itera-api gera a árvore em cima
 * dele, e o aluno responde essa árvore (passo 2). As stories irmãs mostram cada
 * passo isolado; esta mostra a TRANSIÇÃO — que é o que faltava na vitrine.
 *
 * **A geração é mockada, o resto não.** O componente aqui é o mesmo
 * `ByocActivityView` que o app monta; só o `useByoc` (que fala com a itera-api)
 * é trocado por um relógio local (`byocFlowMock.ts`). Plugar IA de verdade no
 * Storybook seria complexidade à toa: o valor da vitrine é o contrato visual e
 * as fases, não a geração.
 *
 * ⚠️ **A espera aqui é fake** (2,2s). Em produção são ~6s ponta a ponta desde a
 * troca de modelo (itera-api#37) — não leia esta story como medição.
 *
 * O modelo roda UMA vez, na geração: a árvore já vem com o gabarito embutido, e
 * daí pra frente a correção é lookup local (ADR-13).
 */
const meta: Meta<typeof ByocActivityView> = {
  title: 'Organisms/Activities/6 · BYOC (contexto do aluno)/0 · fluxo completo',
  id: 'activities-ia-byoc-fluxo',
  component: ByocActivityView,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof ByocActivityView>;

const pickBestActivity = byocHostActivity(BYOC_PICK_BEST_SPEC);
const judgeEachActivity = byocHostActivity(BYOC_JUDGE_EACH_SPEC);

/**
 * **BYOC TREE MULTIPLE CHOICE (`pick_best`)** — escreva seu contexto, espere a
 * geração, responda a árvore. Enviar qualquer texto percorre
 * `seed → generating → ready` no canvas.
 *
 * A seed do aluno volta ecoada acima da árvore (`byoc-seed-echo`): é o que
 * prova, na tela, que a atividade foi montada em cima do contexto DELE.
 */
export const PickBest: Story = {
  render: () => (
    <ByocFlow activity={pickBestActivity} spec={BYOC_PICK_BEST_SPEC} tree={BYOC_PICK_BEST} />
  ),
};

/** **BYOC TREE JUDGE EACH** — o mesmo fluxo, classificando cada opção. */
export const JudgeEach: Story = {
  render: () => (
    <ByocFlow activity={judgeEachActivity} spec={BYOC_JUDGE_EACH_SPEC} tree={BYOC_JUDGE_EACH} />
  ),
};

/**
 * **O aluno que VOLTA** — e é a primeira pintura que TODO aluno vê, porque o
 * `useByoc` real nasce em `loading` e LÊ antes de escrever.
 *
 * A geração é idempotente por aluno+atividade: recarregar tem que cair na mesma
 * árvore, não sortear outra. Então quem já gerou nunca mais vê o formulário de
 * seed — vai de `loading` direto pro passo 2, com a própria seed ecoada em cima.
 */
export const Retornando: Story = {
  render: () => (
    <ByocFlow
      activity={pickBestActivity}
      spec={BYOC_PICK_BEST_SPEC}
      tree={BYOC_PICK_BEST}
      returning
      note="Vitrine: o aluno JÁ gerou antes. A leitura é mockada em 0,6s — sem formulário de seed, direto na árvore dele."
    />
  ),
};

/**
 * **Seed recusada** — a triagem de conteúdo da itera-api é determinística e roda
 * ANTES de qualquer chamada de modelo, então nada é gasto pra construir algo que
 * a gente recusaria.
 *
 * A tela é o ponto: recusa devolve o aluno ao passo 1 com a mensagem do servidor
 * e o texto dele preservado — não é erro de validação nem acusação. Aqui a
 * primeira seed é recusada seja qual for; a segunda passa.
 */
export const SeedRecusada: Story = {
  render: () => (
    <ByocFlow
      activity={pickBestActivity}
      spec={BYOC_PICK_BEST_SPEC}
      tree={BYOC_PICK_BEST}
      refuseFirstSeed
      note="Vitrine: envie qualquer texto — a 1ª seed é recusada de propósito pra mostrar a volta ao passo 1. Envie de novo e a geração segue."
    />
  ),
};

/**
 * Geração falhou e a autoria escreveu uma árvore de reserva (ADR-7): o aluno
 * responde a reserva e ainda pode voltar e tentar outro contexto.
 */
export const CaiNoFallback: Story = {
  render: () => (
    <ByocFlow activity={pickBestActivity} spec={BYOC_PICK_BEST_SPEC} tree={BYOC_PICK_BEST} failing />
  ),
};

/** Geração falhou e NÃO há reserva — o único caminho é tentar de novo. */
export const Indisponivel: Story = {
  render: () => (
    <ByocFlow
      activity={pickBestActivity}
      spec={BYOC_PICK_BEST_SPEC}
      tree={BYOC_PICK_BEST}
      failing
      withFallback={false}
    />
  ),
};
