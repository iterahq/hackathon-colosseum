import type { Meta, StoryObj } from '@storybook/react';
import { MultiChoiceActivity } from '@/components/branded/activity/MultiChoiceActivity';
import { makeActivity, noop } from './activityFixtures';

/**
 * MultiChoice — pick one-or-more. Correct only when the selected SET equals the
 * correct set. Stories: default / answered / correct / incorrect / disabled.
 */
const meta: Meta<typeof MultiChoiceActivity> = {
  title: 'Activity/MultiChoice',
  component: MultiChoiceActivity,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof MultiChoiceActivity>;

const wrap = { maxWidth: 640 } as const;

const SPEC = {
  instruction: { text: 'Quais são boas práticas de modelagem relacional?' },
  options: [
    { id: 'a', label: 'Normalizar para evitar redundância' },
    { id: 'b', label: 'Usar chaves estrangeiras para relações' },
    { id: 'c', label: 'Copiar dados entre todas as tabelas' },
    { id: 'd', label: 'Definir chaves primárias' },
  ],
  correct_option_ids: ['a', 'b', 'd'],
};

export const Default: Story = {
  render: () => (
    <div style={wrap}>
      <MultiChoiceActivity activity={makeActivity('multi_choice', SPEC)} onComplete={noop} />
    </div>
  ),
};

export const Answered: Story = {
  render: () => (
    <div style={wrap}>
      <MultiChoiceActivity activity={makeActivity('multi_choice', SPEC)} onComplete={noop} initialSelectedIds={['a', 'b']} />
    </div>
  ),
};

export const Correct: Story = {
  render: () => (
    <div style={wrap}>
      <MultiChoiceActivity activity={makeActivity('multi_choice', SPEC)} onComplete={noop} initialSelectedIds={['a', 'b', 'd']} initialSubmitted />
    </div>
  ),
};

export const Incorrect: Story = {
  render: () => (
    <div style={wrap}>
      <MultiChoiceActivity activity={makeActivity('multi_choice', SPEC)} onComplete={noop} initialSelectedIds={['a', 'c']} initialSubmitted />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div style={wrap}>
      <MultiChoiceActivity activity={makeActivity('multi_choice', SPEC, 'done')} onComplete={noop} initialSelectedIds={['a', 'b', 'd']} initialSubmitted />
    </div>
  ),
};
