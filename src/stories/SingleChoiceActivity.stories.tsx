import type { Meta, StoryObj } from '@storybook/react';
import { SingleChoiceActivity } from '@/components/branded/activity/SingleChoiceActivity';
import { makeActivity, noop } from './activityFixtures';
import { SINGLE_CHOICE_IMAGE_SPEC, SINGLE_CHOICE_SPEC as SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `single_choice` — escolha de EXATAMENTE uma opção.
 *
 *   { instruction?, options: [{ id, label?, image_url?, audio_url? }], correct_option_id }
 *
 * Contrato tipado no `@iterahq/activity-spec`: os ids das opções são únicos e
 * `correct_option_id` precisa referenciar um deles.
 *
 * As stories abaixo são VARIAÇÕES do mesmo contrato — estados (em branco /
 * respondida / correta / incorreta / concluída) e opções com imagem em vez de
 * só texto. Nenhuma delas é uma activity diferente.
 */
const meta: Meta<typeof SingleChoiceActivity> = {
  title: 'Organisms/Activities/2 · Escolha/SingleChoice',
  id: 'activities-escolha-single-choice',
  component: SingleChoiceActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof SingleChoiceActivity>;

export const Default: Story = {
  render: () => <SingleChoiceActivity activity={makeActivity('single_choice', SPEC)} onComplete={noop} />,
};

export const Answered: Story = {
  render: () => (
    <SingleChoiceActivity activity={makeActivity('single_choice', SPEC)} onComplete={noop} initialSelectedId="a" />
  ),
};

export const Correct: Story = {
  render: () => (
    <SingleChoiceActivity activity={makeActivity('single_choice', SPEC)} onComplete={noop} initialSelectedId="b" initialSubmitted />
  ),
};

export const Incorrect: Story = {
  render: () => (
    <SingleChoiceActivity activity={makeActivity('single_choice', SPEC)} onComplete={noop} initialSelectedId="a" initialSubmitted />
  ),
};

export const Disabled: Story = {
  render: () => (
    <SingleChoiceActivity activity={makeActivity('single_choice', SPEC, 'done')} onComplete={noop} initialSelectedId="b" initialSubmitted />
  ),
};

export const ImageOptions: Story = {
  render: () => (
    <SingleChoiceActivity
      activity={makeActivity('single_choice', SINGLE_CHOICE_IMAGE_SPEC)}
      onComplete={noop}
    />
  ),
};
