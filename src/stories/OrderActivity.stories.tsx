import type { Meta, StoryObj } from '@storybook/react';
import { OrderActivity } from '@/components/branded/activity/OrderActivity';
import { makeActivity, noop } from './activityFixtures';
import { ORDER_SPEC as SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `order` — ordenação de uma sequência embaralhada.
 *
 *   { instruction?, items: [{ id, label? }], correct_order: string[] }
 *
 * Contrato tipado: `correct_order` precisa ser uma PERMUTAÇÃO exata dos
 * `items[].id`. Função pedagógica própria (sequenciar) → grupo próprio.
 *
 * As stories abaixo são variações de ESTADO do mesmo contrato.
 */
const meta: Meta<typeof OrderActivity> = {
  title: 'Organisms/Activities/4 · Ordenação/Order',
  id: 'activities-ordenacao-order',
  component: OrderActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof OrderActivity>;

export const Default: Story = {
  render: () => <OrderActivity activity={makeActivity('order', SPEC)} onComplete={noop} />,
};

export const Answered: Story = {
  render: () => (
    <OrderActivity activity={makeActivity('order', SPEC)} onComplete={noop} initialOrder={['s1', 's2', 's4', 's3']} />
  ),
};

export const Correct: Story = {
  render: () => (
    <OrderActivity activity={makeActivity('order', SPEC)} onComplete={noop} initialOrder={['s1', 's2', 's3', 's4']} initialSubmitted />
  ),
};

export const Incorrect: Story = {
  render: () => (
    <OrderActivity activity={makeActivity('order', SPEC)} onComplete={noop} initialOrder={['s2', 's1', 's3', 's4']} initialSubmitted />
  ),
};

export const Disabled: Story = {
  render: () => (
    <OrderActivity activity={makeActivity('order', SPEC, 'done')} onComplete={noop} initialOrder={['s1', 's2', 's3', 's4']} initialSubmitted />
  ),
};
