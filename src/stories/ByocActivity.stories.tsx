import type { Meta, StoryObj } from '@storybook/react';
import { ByocActivityView } from '@/components/branded/activity/byoc/ByocActivityView';
import { ByocTree } from '@/components/branded/activity/byoc/ByocTree';
import { noop } from './activityFixtures';
import { ByocFlow } from './ByocFlow';
import { byocHostActivity } from './byocFlowMock';
import {
  BYOC_BUILD_CONTEXT,
  BYOC_BUILD_CONTEXT_SPEC,
  BYOC_JUDGE_EACH,
  BYOC_JUDGE_EACH_SPEC,
  BYOC_PICK_BEST,
  BYOC_PICK_BEST_SPEC,
} from './byocFixtures';
import { withActivityWidth } from './decorators';

/**
 * BYOC ("Bring Your Own Context") — **os dois passos, numa pasta só**.
 *
 * BYOC não é um `kind`: é uma CAMADA (`spec.byoc`) sobre qualquer atividade. O
 * aluno escreve o próprio contexto numa textarea (passo 1), a itera-api gera a
 * árvore em cima dele, e o aluno responde essa árvore (passo 2). Toda story aqui
 * mostra o fluxo INTEIRO — o formulário e a árvore isolados viviam em pastas
 * separadas e diziam menos do que a transição entre eles.
 *
 * Os três tipos: **BYOC TextArea Pick Best** (uma opção certa), **BYOC TextArea
 * Judge Each** (classificar cada opção) e **BYOC TextArea Tree Pick Best**
 * (rodadas sem certo nem errado, que montam um pedido).
 *
 * ⚠️ A espera aqui é fake (2,2s); em produção são ~6s (itera-api#37).
 */
const meta: Meta<typeof ByocActivityView> = {
  title: 'Organisms/Activities/6 · BYOC (contexto do aluno)',
  id: 'activities-ia-byoc',
  component: ByocActivityView,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof ByocActivityView>;

const pickBestActivity = byocHostActivity(BYOC_PICK_BEST_SPEC);
const judgeEachActivity = byocHostActivity(BYOC_JUDGE_EACH_SPEC);
const buildContextActivity = byocHostActivity(BYOC_BUILD_CONTEXT_SPEC);

/**
 * Enviar qualquer texto percorre `seed → generating → ready` no canvas. A seed
 * volta ecoada acima da árvore (`byoc-seed-echo`): é o que prova, na tela, que a
 * atividade foi montada em cima do contexto DELE. A `ai_response` de cada opção
 * fica escondida até o envio — aberta antes, entrega o gabarito.
 */
export const BYOCTextAreaPickBest: Story = {
  name: 'BYOC TextArea Pick Best',
  render: () => (
    <ByocFlow activity={pickBestActivity} spec={BYOC_PICK_BEST_SPEC} tree={BYOC_PICK_BEST} />
  ),
};

/** O mesmo fluxo, classificando cada opção como boa ou ruim — acerto só com TODAS certas. */
export const BYOCTextAreaJudgeEach: Story = {
  name: 'BYOC TextArea Judge Each',
  render: () => (
    <ByocFlow activity={judgeEachActivity} spec={BYOC_JUDGE_EACH_SPEC} tree={BYOC_JUDGE_EACH} />
  ),
};

/**
 * O mesmo fluxo **sem certo nem errado**: cada rodada é uma faceta do pedido, a
 * escolha revela na hora o que a IA responderia com AQUELA faceta, e a última
 * tela devolve o prompt que o aluno acabou de escrever. Chegar ao fim É o acerto.
 *
 * Depois do pedido montado vem uma pergunta de fechamento cujas opções são as
 * escolhas do próprio aluno: só ELE pode respondê-la, e por isso ela não precisa
 * de conteúdo autorado.
 */
export const BYOCTextAreaTreePickBest: Story = {
  name: 'BYOC TextArea Tree Pick Best',
  render: () => (
    <ByocFlow
      activity={buildContextActivity}
      spec={BYOC_BUILD_CONTEXT_SPEC}
      tree={BYOC_BUILD_CONTEXT}
      note="Vitrine: a geração espera 2,2s. Depois disso, uma rodada por tela — a escolha revela na hora o que a IA responderia."
    />
  ),
};

/**
 * **O aluno que VOLTA** — a primeira pintura que TODO aluno vê, porque o
 * `useByoc` real nasce em `loading` e LÊ antes de escrever. A geração é
 * idempotente por aluno+atividade: recarregar cai na MESMA árvore, e quem já
 * gerou nunca mais vê o formulário de seed.
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
 * **Seed recusada** — a triagem da itera-api é determinística e roda ANTES de
 * qualquer chamada de modelo. Recusa devolve o aluno ao passo 1 com a mensagem
 * do servidor e o texto dele preservado: não é erro de validação nem acusação.
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
 * Geração estourou o teto de 10s (ou falhou) e a autoria escreveu uma árvore de
 * reserva (ADR-7): o aluno responde a reserva e segue a aula.
 *
 * Sem saída lateral aqui de propósito. Parar de esperar não cancela o servidor,
 * que termina e persiste a linha — a próxima leitura cai na geração de verdade.
 */
export const CaiNoFallback: Story = {
  render: () => (
    <ByocFlow activity={pickBestActivity} spec={BYOC_PICK_BEST_SPEC} tree={BYOC_PICK_BEST} failing />
  ),
};

/**
 * `reveal` — aula ao vivo: gabarito e respostas da IA já abertos. Renderiza a
 * árvore direto, porque no ao vivo não há passo 1.
 */
export const ReveladoAoVivo: Story = {
  name: 'Pick Best · revelado ao vivo',
  render: () => <ByocTree tree={BYOC_PICK_BEST} onComplete={noop} reveal />,
};

/** `done` — concluída numa sessão anterior: trancada, não refazível. */
export const JaConcluida: Story = {
  name: 'Pick Best · já concluída',
  render: () => <ByocTree tree={BYOC_PICK_BEST} onComplete={noop} done />,
};
