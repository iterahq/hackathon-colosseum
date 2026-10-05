import type { Meta, StoryObj } from '@storybook/react';
import { ConceptActivity } from '@/components/branded/activity/ConceptActivity';
import { SAMPLE_AUDIO, SAMPLE_IMAGE, SAMPLE_VIDEO, makeActivity, noop } from './activityFixtures';
import { withActivityWidth } from './decorators';
import { FLAT_GIT, LONG_FUNCTION } from './richTextFixtures';

/**
 * Concept — a pure READING/exposition activity built on the InstructionPanel.
 * Stories cover each InstructionPanel form. There is NO "mark done" button: a
 * concept is read, not completed — advancing is driven by the shell (a
 * "Continuar" in the self-paced player, or the instructor in the live class).
 *
 * A tela sai INTEIRA: a paginação por `---` foi aposentada em 2026-07-31, e a
 * pergunta com resposta escondida virou o kind `concept_reveal`.
 *
 * NOTE: Concept is classified as an activity (activity_kind = 'concept') even
 * though it has no user interaction. It belongs in Organisms/Activities
 * alongside the other kinds per the activity_kind enum.
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

/** Aula real (Git, Educar+): a tela inteira de uma vez — conceito é slide. */
export const AulaReal: Story = {
  render: () => (
    <ConceptActivity activity={makeActivity('concept', { instruction: { text: FLAT_GIT } })} onComplete={noop} />
  ),
};

/** A long reading screen: the rhythm, the steps and the code window have to hold up over eight-plus blocks. */
export const TextoLongo: Story = {
  render: () => (
    <ConceptActivity activity={makeActivity('concept', { instruction: { text: LONG_FUNCTION } })} onComplete={noop} />
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
