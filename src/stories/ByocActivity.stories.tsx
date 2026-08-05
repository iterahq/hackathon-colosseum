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
 * ⚠️ **A espera aqui é fake e curta** (2,2s). Em produção a geração leva 47–58s
 * contra o modelo free — não leia esta story como medição de latência.
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
