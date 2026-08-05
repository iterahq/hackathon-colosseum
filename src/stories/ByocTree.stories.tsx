import type { Meta, StoryObj } from '@storybook/react';
import { ByocTree } from '@/components/branded/activity/byoc/ByocTree';
import { BYOC_BUILD_CONTEXT, BYOC_JUDGE_EACH, BYOC_PICK_BEST } from './byocFixtures';
import { noop } from './activityFixtures';
import { withActivityWidth } from './decorators';

/**
 * BYOC ("Bring Your Own Context") — PASSO 2: responder a árvore gerada.
 *
 * BYOC não é um `kind`: é uma CAMADA (`spec.byoc`) sobre qualquer atividade. O
 * passo 1 (o aluno escreve o próprio contexto) chama a itera-api e recebe esta
 * árvore com o gabarito embutido; daí pra frente a correção é lookup local —
 * nenhuma chamada de modelo no caminho da resposta (ADR-13).
 *
 * Esta story é do `ByocTree` sozinho: a árvore é puramente apresentacional
 * (recebe `tree`, sem API e sem auth), então roda no canvas sem mock nenhum. Os
 * dois passos ligados, com a transição entre eles, estão em
 * **0 · fluxo completo**.
 *
 * As interações vêm da autoria: `pick_best` (uma opção certa), `judge_each`
 * (classificar cada opção — acerto só com TODAS certas) e `build_context`
 * (BYOC TREE MULTIPLE CHOICE: rodadas sem certo nem errado, onde cada escolha
 * entra no pedido que o aluno monta). Nas duas primeiras a `ai_response` fica
 * escondida até o envio, senão a resposta entrega o gabarito; em
 * `build_context` ela aparece na hora, porque é ela o conteúdo.
 */
const meta: Meta<typeof ByocTree> = {
  title: 'Organisms/Activities/6 · BYOC (contexto do aluno)/2 · árvore gerada',
  id: 'activities-ia-byoc-tree',
  component: ByocTree,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof ByocTree>;

/** `pick_best` — escolha a melhor opção; a resposta da IA só aparece no envio. */
export const PickBest: Story = {
  name: 'BYOC Tree · Pick Best',
  render: () => <ByocTree tree={BYOC_PICK_BEST} onComplete={noop} />,
};

/** `judge_each` — classifique cada opção como boa ou ruim. */
export const JudgeEach: Story = {
  name: 'BYOC Tree · Judge Each',
  render: () => <ByocTree tree={BYOC_JUDGE_EACH} onComplete={noop} />,
};

/**
 * `build_context` — uma rodada por tela, a escolha revela na hora o que a IA
 * responderia, e a última tela mostra o pedido inteiro que o aluno montou. Não
 * há envio nem nota: chegar ao fim É o acerto.
 */
export const BuildContext: Story = {
  name: 'BYOC Tree Multiple Choice · Build Context',
  render: () => (
    <ByocTree tree={BYOC_BUILD_CONTEXT} seed="jogar futebol de quinta" onComplete={noop} />
  ),
};

/** `reveal` — modo aula ao vivo: gabarito e respostas da IA já abertos. */
export const Revealed: Story = {
  name: 'Pick Best · revelado ao vivo',
  render: () => <ByocTree tree={BYOC_PICK_BEST} onComplete={noop} reveal />,
};

/** `done` — atividade já concluída numa sessão anterior: trancada, não refazível. */
export const Done: Story = {
  name: 'Pick Best · já concluída',
  render: () => <ByocTree tree={BYOC_PICK_BEST} onComplete={noop} done />,
};
