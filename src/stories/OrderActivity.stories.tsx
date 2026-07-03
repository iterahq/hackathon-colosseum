import type { Meta, StoryObj } from '@storybook/react';
import { OrderActivity } from '@/components/branded/activity/OrderActivity';
import { makeActivity, noop } from './activityFixtures';
import { withActivityWidth } from './decorators';

/**
 * Order — reorder a scrambled sequence. Stories: default (scrambled) / answered
 * (reordered, not submitted) / correct / incorrect / disabled.
 */
const meta: Meta<typeof OrderActivity> = {
  title: 'Organisms/Activities/Order',
  component: OrderActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof OrderActivity>;

// Items are presented scrambled; correct_order is the intended sequence.
const SPEC = {
  instruction: { text: 'Ordene as etapas de modelagem de dados.' },
  items: [
    { id: 's3', label: '3. Normalizar as tabelas' },
    { id: 's1', label: '1. Identificar as entidades' },
    { id: 's4', label: '4. Definir chaves e relações' },
    { id: 's2', label: '2. Listar os atributos' },
  ],
  correct_order: ['s1', 's2', 's3', 's4'],
};

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
