import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveTimerControls } from '@/components/live/LiveTimerControls';

/**
 * LiveTimerControls — the instructor-only affordance to start/stop a shared
 * countdown on the current activity (broadcast to every learner).
 */
const meta: Meta<typeof LiveTimerControls> = {
  title: 'Molecules/Live/LiveTimerControls',
  component: LiveTimerControls,
  parameters: { layout: 'centered' },
  args: { onStart: () => {}, onStop: () => {} },
};
export default meta;
type Story = StoryObj<typeof LiveTimerControls>;

/** No timer running — the professor can pick a duration and start. */
export const Idle: Story = { args: { running: false } };

/** A timer is live — the control switches to "stop". */
export const Running: Story = { args: { running: true } };
