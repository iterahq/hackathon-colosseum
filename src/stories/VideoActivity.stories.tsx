import type { Meta, StoryObj } from '@storybook/react';
import { VideoActivity } from '@/components/branded/activity/VideoActivity';
import { SAMPLE_VIDEO, makeActivity, noop } from './activityFixtures';

/**
 * Video — a watch-only activity. Stories: bare video, video + instruction
 * context, missing-video fallback, and the completed (locked) state.
 */
const meta: Meta<typeof VideoActivity> = {
  title: 'Activity/Video',
  component: VideoActivity,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof VideoActivity>;

const wrap = { maxWidth: 640 } as const;

export const Default: Story = {
  render: () => (
    <div style={wrap}>
      <VideoActivity activity={makeActivity('video', { video_url: SAMPLE_VIDEO })} onComplete={noop} />
    </div>
  ),
};

export const WithInstruction: Story = {
  render: () => (
    <div style={wrap}>
      <VideoActivity
        activity={makeActivity('video', {
          video_url: SAMPLE_VIDEO,
          instruction: { text: 'Assista à demonstração de modelagem.', description: 'Preste atenção nas chaves estrangeiras.' },
        })}
        onComplete={noop}
      />
    </div>
  ),
};

export const MissingVideoFallback: Story = {
  render: () => (
    <div style={wrap}>
      <VideoActivity activity={makeActivity('video', {})} onComplete={noop} />
    </div>
  ),
};

export const CompletedDisabled: Story = {
  render: () => (
    <div style={wrap}>
      <VideoActivity activity={makeActivity('video', { video_url: SAMPLE_VIDEO }, 'done')} onComplete={noop} />
    </div>
  ),
};
