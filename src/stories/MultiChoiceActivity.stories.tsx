import type { Meta, StoryObj } from '@storybook/react';
import { MultiChoiceActivity } from '@/components/branded/activity/MultiChoiceActivity';
import { makeActivity, noop } from './activityFixtures';
import { MULTI_CHOICE_SPEC as SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `multi_choice` — escolha de UMA OU MAIS opções.
 *
 *   { instruction?, options: [{ id, label?, image_url?, audio_url? }], correct_option_ids[] }
 *
 * É contrato próprio (e não variação do single_choice) porque a autoria entrega
 * uma LISTA de corretas — e a correção só é verdadeira quando o CONJUNTO
 * marcado é igual ao conjunto esperado.
 *
 * As stories abaixo são variações de ESTADO do mesmo contrato.
 */
const meta: Meta<typeof MultiChoiceActivity> = {
  title: 'Organisms/Activities/2 · Escolha/MultiChoice',
  id: 'activities-escolha-multi-choice',
  component: MultiChoiceActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof MultiChoiceActivity>;

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
