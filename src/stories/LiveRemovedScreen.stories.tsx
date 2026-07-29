import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveRemovedScreen } from '@/components/live/LiveRemovedScreen';

/**
 * LiveRemovedScreen — what the learner sees when the professor takes them out of
 * the room.
 *
 * It exists because the removal is DURABLE: the row in `itera.class_removals`
 * makes the realtime JOIN be denied, so without this screen the learner would sit
 * on a "reconectando…" that never resolves and the app would look broken instead
 * of having done what the professor asked. The tone is deliberately neutral — the
 * exit happens in front of the whole class, and it is not a punishment.
 */
const meta: Meta<typeof LiveRemovedScreen> = {
  title: 'Organisms/Live/LiveRemovedScreen',
  component: LiveRemovedScreen,
  parameters: { layout: 'fullscreen' },
  args: { onLeave: () => {} },
};
export default meta;
type Story = StoryObj<typeof LiveRemovedScreen>;

export const Default: Story = {};
