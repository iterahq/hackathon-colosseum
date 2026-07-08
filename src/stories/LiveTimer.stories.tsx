import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveTimer } from '@/components/live/LiveTimer';

/**
 * LiveTimer — the shared countdown pill driven by an absolute epoch-ms deadline,
 * so every screen (student + instructor) agrees. Turns red + pulses in the final
 * 5s and flips to a "done" state at zero.
 */
const meta: Meta<typeof LiveTimer> = {
  title: 'Atoms/Live/LiveTimer',
  component: LiveTimer,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof LiveTimer>;

/** Comfortably counting down. */
export const Running: Story = { render: () => <LiveTimer deadline={Date.now() + 92_000} /> };

/** Inside the final 5s window — warning styling (red + pulse). */
export const FinalSeconds: Story = { render: () => <LiveTimer deadline={Date.now() + 4_000} /> };

/** Past the deadline — the "time's up" done state. */
export const Expired: Story = { render: () => <LiveTimer deadline={Date.now() - 1_000} /> };
