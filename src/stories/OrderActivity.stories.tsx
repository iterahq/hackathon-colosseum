import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within } from 'storybook/test';
import { OrderActivity } from '@/components/branded/activity/OrderActivity';
import { makeActivity } from './activityFixtures';
import { ORDER_SPEC as SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { arrangeOrder, submitAnswer } from './interactions';

/**
 * CONTRATO `order` — ordenação de uma sequência embaralhada.
 *
 *   { instruction?, items: [{ id, label? }], correct_order: string[] }
 *
 * Contrato tipado: `correct_order` precisa ser uma PERMUTAÇÃO exata dos
 * `items[].id`. Função pedagógica própria (sequenciar) → grupo próprio.
 *
 * ── FASE 3 (ADR-4) ─────────────────────────────────────────────────────────
 * A prop `initialOrder` sumiu. Cada estado abaixo é produzido ARRASTANDO as
 * linhas pela alça — o único jeito de reordenar. O arrasto precisa de layout,
 * então os `play` carregam a tag `browser-mode` (ADR-8) e rodam no Chromium. O
 * embaralhamento inicial é POR ALUNO (`learnerShuffle`) e nunca é a solução,
 * então o `play` faz um selection-sort por RÓTULO, nunca por posição.
 *
 * O "Enviar" só habilita depois de MEXER na lista — `arrangeOrder` garante pelo
 * menos uma interação real.
 */
const meta: Meta<typeof OrderActivity> = {
  title: 'Organisms/Activities/4 · Ordenação/Order',
  id: 'activities-ordenacao-order',
  component: OrderActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof OrderActivity>;

const RIGHT = [
  'Identificar as entidades',
  'Listar os atributos',
  'Normalizar as tabelas',
  'Definir chaves e relações',
];
/** Quase lá — os dois últimos trocados. */
const NEARLY = [
  'Identificar as entidades',
  'Listar os atributos',
  'Definir chaves e relações',
  'Normalizar as tabelas',
];
/** Errado no começo, que é onde a correção fica óbvia na tela. */
const WRONG = [
  'Listar os atributos',
  'Identificar as entidades',
  'Normalizar as tabelas',
  'Definir chaves e relações',
];

export const Default: Story = {
  args: { activity: makeActivity('order', SPEC) },
};

/** C.answered — sequência mexida (quase certa), ainda sem enviar. */
export const Answered: Story = {
  args: { activity: makeActivity('order', SPEC) },
  tags: ['browser-mode'],
  play: async ({ canvasElement }) => {
    await arrangeOrder(canvasElement, NEARLY);
    const labels = within(canvasElement)
      .getAllByTestId('order-item')
      .map((li) => li.textContent ?? '');
    await expect(labels[0]).toContain(NEARLY[0]);
    await expect(within(canvasElement).getByTestId('order-submit')).not.toHaveAttribute('data-submitted');
  },
};

/** C.submitted + D.correct — sequência certa, enviada. */
export const Correct: Story = {
  args: { activity: makeActivity('order', SPEC) },
  tags: ['browser-mode'],
  play: async ({ args, canvasElement }) => {
    await arrangeOrder(canvasElement, RIGHT);
    await submitAnswer(canvasElement, 'order-submit');
    await expect(within(canvasElement).getByTestId('order-submit')).toHaveAttribute('data-correct', 'true');
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — dois passos trocados: um erro de posição basta. */
export const Incorrect: Story = {
  args: { activity: makeActivity('order', SPEC) },
  tags: ['browser-mode'],
  play: async ({ args, canvasElement }) => {
    await arrangeOrder(canvasElement, WRONG);
    await submitAnswer(canvasElement, 'order-submit');
    await expect(within(canvasElement).getByTestId('order-submit')).toHaveAttribute('data-correct', 'false');
    await expect(args.onComplete).toHaveBeenCalledWith(false, expect.anything());
  },
};

/** B.done — activity já concluída: as linhas ficam travadas (não somem). */
export const Disabled: Story = {
  args: { activity: makeActivity('order', SPEC, 'done') },
};
