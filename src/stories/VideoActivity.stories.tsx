import type { Meta, StoryObj } from '@storybook/react';
import { VideoActivity } from '@/components/branded/activity/VideoActivity';
import { SAMPLE_VIDEO, makeActivity, noop } from './activityFixtures';
import { withActivityWidth } from './decorators';

/**
 * Video — a watch-only activity. Stories: bare video, video + instruction
 * context, missing-video fallback, and the completed (locked) state.
 */
const meta: Meta<typeof VideoActivity> = {
  title: 'Organisms/Activities/1 · Exposição/Video',
  id: 'activities-exposicao-video',
  component: VideoActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof VideoActivity>;

export const Default: Story = {
  render: () => <VideoActivity activity={makeActivity('video', { video_url: SAMPLE_VIDEO })} onComplete={noop} />,
};

export const WithInstruction: Story = {
  render: () => (
    <VideoActivity
      activity={makeActivity('video', {
        video_url: SAMPLE_VIDEO,
        instruction: { text: 'Assista à demonstração de modelagem.', description: 'Preste atenção nas chaves estrangeiras.' },
      })}
      onComplete={noop}
    />
  ),
};

export const MissingVideoFallback: Story = {
  render: () => <VideoActivity activity={makeActivity('video', {})} onComplete={noop} />,
};

export const CompletedDisabled: Story = {
  render: () => (
    <VideoActivity activity={makeActivity('video', { video_url: SAMPLE_VIDEO }, 'done')} onComplete={noop} />
  ),
};
