import type { Meta, StoryObj } from '@storybook/react';
import { ConceptActivity } from '@/components/branded/activity/ConceptActivity';
import { SAMPLE_AUDIO, SAMPLE_IMAGE, SAMPLE_VIDEO, makeActivity, noop } from './activityFixtures';

/**
 * Concept — a no-action display activity built on the InstructionPanel. Stories
 * cover each InstructionPanel form plus the completed (locked/disabled) state.
 */
const meta: Meta<typeof ConceptActivity> = {
  title: 'Activity/Concept',
  component: ConceptActivity,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof ConceptActivity>;

const wrap = { maxWidth: 640 } as const;

export const TextOnly: Story = {
  render: () => (
    <div style={wrap}>
      <ConceptActivity
        activity={makeActivity('concept', { instruction: { text: 'Um modelo de dados descreve como as entidades se relacionam.' } })}
        onComplete={noop}
      />
    </div>
  ),
};

export const ImageOnly: Story = {
  render: () => (
    <div style={wrap}>
      <ConceptActivity activity={makeActivity('concept', { instruction: { image_url: SAMPLE_IMAGE } })} onComplete={noop} />
    </div>
  ),
};

export const VideoWithDescription: Story = {
  render: () => (
    <div style={wrap}>
      <ConceptActivity
        activity={makeActivity('concept', {
          instruction: { text: 'Assista à introdução.', video_url: SAMPLE_VIDEO, description: 'Depois avance para o exercício.' },
        })}
        onComplete={noop}
      />
    </div>
  ),
};

export const AllMedia: Story = {
  render: () => (
    <div style={wrap}>
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
    </div>
  ),
};

/** Completed → the DoneButton locks into the menta "concluída" state. */
export const CompletedDisabled: Story = {
  render: () => (
    <div style={wrap}>
      <ConceptActivity
        activity={makeActivity('concept', { instruction: { text: 'Você já concluiu este conceito.' } }, 'done')}
        onComplete={noop}
      />
    </div>
  ),
};
