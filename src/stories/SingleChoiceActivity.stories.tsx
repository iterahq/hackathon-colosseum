import type { Meta, StoryObj } from '@storybook/react';
import { SingleChoiceActivity } from '@/components/branded/activity/SingleChoiceActivity';
import { SAMPLE_IMAGE_A, SAMPLE_IMAGE_B, SAMPLE_IMAGE_C, makeActivity, noop } from './activityFixtures';
import { withActivityWidth } from './decorators';

/**
 * SingleChoice — pick exactly one. Stories cover default / answered / correct /
 * incorrect / disabled, plus an image-option variation and an instruction panel.
 */
const meta: Meta<typeof SingleChoiceActivity> = {
  title: 'Organisms/Activities/SingleChoice',
  component: SingleChoiceActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof SingleChoiceActivity>;

const SPEC = {
  instruction: { text: 'Qual estrutura evita duplicar dados entre tabelas?' },
  options: [
    { id: 'a', label: 'Copiar as colunas para cada tabela' },
    { id: 'b', label: 'Usar uma chave estrangeira (FK)' },
    { id: 'c', label: 'Duplicar a tabela inteira' },
  ],
  correct_option_id: 'b',
};

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
      activity={makeActivity('single_choice', {
        instruction: { text: 'Qual imagem representa um relacionamento 1:N?' },
        options: [
          { id: 'a', label: 'Opção A', image_url: SAMPLE_IMAGE_A },
          { id: 'b', label: 'Opção B', image_url: SAMPLE_IMAGE_B },
          { id: 'c', label: 'Opção C', image_url: SAMPLE_IMAGE_C },
        ],
        correct_option_id: 'c',
      })}
      onComplete={noop}
    />
  ),
};
