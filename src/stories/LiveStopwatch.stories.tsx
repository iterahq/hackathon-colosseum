import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveStopwatch } from '@/components/live/LiveStopwatch';

/**
 * LiveStopwatch — counts UP from the moment the learner opened the activity,
 * so the professor sees how long each one is taking to answer.
 */
const meta: Meta<typeof LiveStopwatch> = {
  title: 'Atoms/Live/LiveStopwatch',
  component: LiveStopwatch,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof LiveStopwatch>;

/** Running for just over a minute. */
export const Running: Story = { render: () => <LiveStopwatch startedAt={Date.now() - 65_000} /> };

/** Freshly opened activity. */
export const JustStarted: Story = { render: () => <LiveStopwatch startedAt={Date.now()} /> };
