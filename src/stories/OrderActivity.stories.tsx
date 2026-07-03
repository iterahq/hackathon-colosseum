import type { Meta, StoryObj } from '@storybook/react';
import { OrderActivity } from '@/components/branded/activity/OrderActivity';
import { makeActivity, noop } from './activityFixtures';

/**
 * Order — reorder a scrambled sequence. Stories: default (scrambled) / answered
 * (reordered, not submitted) / correct / incorrect / disabled.
 */
const meta: Meta<typeof OrderActivity> = {
  title: 'Activity/Order',
  component: OrderActivity,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof OrderActivity>;

const wrap = { maxWidth: 640 } as const;

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
  render: () => (
    <div style={wrap}>
      <OrderActivity activity={makeActivity('order', SPEC)} onComplete={noop} />
    </div>
  ),
};

export const Answered: Story = {
  render: () => (
    <div style={wrap}>
      <OrderActivity activity={makeActivity('order', SPEC)} onComplete={noop} initialOrder={['s1', 's2', 's4', 's3']} />
    </div>
  ),
};

export const Correct: Story = {
  render: () => (
    <div style={wrap}>
      <OrderActivity activity={makeActivity('order', SPEC)} onComplete={noop} initialOrder={['s1', 's2', 's3', 's4']} initialSubmitted />
    </div>
  ),
};

export const Incorrect: Story = {
  render: () => (
    <div style={wrap}>
      <OrderActivity activity={makeActivity('order', SPEC)} onComplete={noop} initialOrder={['s2', 's1', 's3', 's4']} initialSubmitted />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div style={wrap}>
      <OrderActivity activity={makeActivity('order', SPEC, 'done')} onComplete={noop} initialOrder={['s1', 's2', 's3', 's4']} initialSubmitted />
    </div>
  ),
};
