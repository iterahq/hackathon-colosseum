import type { Meta, StoryObj } from '@storybook/react';
import { InstructionPanel } from '@/components/branded/activity/InstructionPanel';
import { SAMPLE_AUDIO, SAMPLE_IMAGE, SAMPLE_VIDEO } from './activityFixtures';

/**
 * InstructionPanel — the shared "lesson instruction" primitive (ADR-2). It
 * renders ANY combination of text · image · video · audio + a description. Every
 * form below is a first-class variation the general activity types compose.
 */
const meta: Meta<typeof InstructionPanel> = {
  title: 'Activity/InstructionPanel',
  component: InstructionPanel,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof InstructionPanel>;

const wrap = { maxWidth: 560 } as const;

export const TextOnly: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel spec={{ text: 'O que é normalização de dados e por que ela importa?' }} />
    </div>
  ),
};

export const ImageOnly: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel spec={{ image_url: SAMPLE_IMAGE }} />
    </div>
  ),
};

export const VideoOnly: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel spec={{ video_url: SAMPLE_VIDEO }} />
    </div>
  ),
};

export const AudioOnly: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel spec={{ audio_url: SAMPLE_AUDIO }} />
    </div>
  ),
};

export const TextPlusImage: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel spec={{ text: 'Observe o diagrama entidade-relacionamento abaixo.', image_url: SAMPLE_IMAGE }} />
    </div>
  ),
};

export const TextPlusDescription: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel
        spec={{
          text: 'Chaves estrangeiras (FK)',
          description: 'Uma FK referencia a chave primária de outra tabela — evita copiar dados e mantém a integridade referencial.',
        }}
      />
    </div>
  ),
};

export const AllMedia: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel
        spec={{
          text: 'Combine todas as mídias num só painel.',
          image_url: SAMPLE_IMAGE,
          video_url: SAMPLE_VIDEO,
          audio_url: SAMPLE_AUDIO,
          description: 'Texto, imagem, vídeo e áudio — o InstructionPanel aceita qualquer combinação.',
        }}
      />
    </div>
  ),
};

/** Empty spec → renders nothing (defensive). */
export const EmptyRendersNothing: Story = {
  render: () => (
    <div style={wrap}>
      <div style={{ color: '#7D7568', fontFamily: 'monospace', fontSize: 12 }}>
        (empty spec → the panel returns null; nothing renders below)
      </div>
      <InstructionPanel spec={{}} />
    </div>
  ),
};
