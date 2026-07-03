import type { Meta, StoryObj } from '@storybook/react';
import { MultiChoiceActivity } from '@/components/branded/activity/MultiChoiceActivity';
import { makeActivity, noop } from './activityFixtures';
import { withActivityWidth } from './decorators';

/**
 * MultiChoice — pick one-or-more. Correct only when the selected SET equals the
 * correct set. Stories: default / answered / correct / incorrect / disabled.
 */
const meta: Meta<typeof MultiChoiceActivity> = {
  title: 'Organisms/Activities/MultiChoice',
  component: MultiChoiceActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof MultiChoiceActivity>;

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
  render: () => <MultiChoiceActivity activity={makeActivity('multi_choice', SPEC)} onComplete={noop} />,
};

export const Answered: Story = {
  render: () => (
    <MultiChoiceActivity activity={makeActivity('multi_choice', SPEC)} onComplete={noop} initialSelectedIds={['a', 'b']} />
  ),
};

export const Correct: Story = {
  render: () => (
    <MultiChoiceActivity activity={makeActivity('multi_choice', SPEC)} onComplete={noop} initialSelectedIds={['a', 'b', 'd']} initialSubmitted />
  ),
};

export const Incorrect: Story = {
  render: () => (
    <MultiChoiceActivity activity={makeActivity('multi_choice', SPEC)} onComplete={noop} initialSelectedIds={['a', 'c']} initialSubmitted />
  ),
};

export const Disabled: Story = {
  render: () => (
    <MultiChoiceActivity activity={makeActivity('multi_choice', SPEC, 'done')} onComplete={noop} initialSelectedIds={['a', 'b', 'd']} initialSubmitted />
  ),
};
