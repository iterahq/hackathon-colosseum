import type { Meta, StoryObj } from '@storybook/react';
import { ConceptActivity } from '@/components/branded/activity/ConceptActivity';
import { SAMPLE_AUDIO, SAMPLE_IMAGE, SAMPLE_VIDEO, makeActivity, noop } from './activityFixtures';
import { withActivityWidth } from './decorators';

/**
 * Concept — a no-action display activity built on the InstructionPanel. Stories
 * cover each InstructionPanel form plus the completed (locked/disabled) state.
 *
 * NOTE: Concept is classified as an activity (activity_kind = 'concept') even
 * though it has no user interaction beyond "mark done". It belongs in
 * Organisms/Activities alongside the other kinds per the activity_kind enum.
 */
const meta: Meta<typeof ConceptActivity> = {
  title: 'Organisms/Activities/1 · Exposição/Concept',
  id: 'activities-exposicao-concept',
  component: ConceptActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof ConceptActivity>;

export const TextOnly: Story = {
  render: () => (
    <ConceptActivity
      activity={makeActivity('concept', { instruction: { text: 'Um modelo de dados descreve como as entidades se relacionam.' } })}
      onComplete={noop}
    />
  ),
};

export const ImageOnly: Story = {
  render: () => (
    <ConceptActivity activity={makeActivity('concept', { instruction: { image_url: SAMPLE_IMAGE } })} onComplete={noop} />
  ),
};

export const VideoWithDescription: Story = {
  render: () => (
    <ConceptActivity
      activity={makeActivity('concept', {
        instruction: { text: 'Assista à introdução.', video_url: SAMPLE_VIDEO, description: 'Depois avance para o exercício.' },
      })}
      onComplete={noop}
    />
  ),
};

export const AllMedia: Story = {
  render: () => (
    <ConceptActivity
      activity={makeActivity('concept', {
        instruction: {
          text: 'Conceito completo com todas as mídias.',
          image_url: SAMPLE_IMAGE,
          audio_url: SAMPLE_AUDIO,
          description: 'Texto + imagem + áudio + descrição.',
        },
      })}
      onComplete={noop}
    />
  ),
};

/** Completed → the DoneButton locks into the menta "concluída" state. */
export const CompletedDisabled: Story = {
  render: () => (
    <ConceptActivity
      activity={makeActivity('concept', { instruction: { text: 'Você já concluiu este conceito.' } }, 'done')}
      onComplete={noop}
    />
  ),
};
