import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveActivityStatsCard } from '@/components/live/LiveActivityStatsCard';
import { sampleAnswerers } from './liveFixtures';

/**
 * LiveActivityStatsCard — how the room is answering the activity on screen.
 *
 * The instructor gets the full correct / wrong / still-thinking split (the "run
 * the room" surface). The learner gets the same participation pulse with
 * `hideCorrectness`: responded / waiting only, plus the progress bar — never who
 * got it right or wrong.
 */
const meta: Meta<typeof LiveActivityStatsCard> = {
  title: 'Molecules/Live/LiveActivityStatsCard',
  component: LiveActivityStatsCard,
  parameters: { layout: 'centered' },
  args: { answerers: sampleAnswerers },
  render: (args) => (
    <div style={{ width: 348 }}>
      <LiveActivityStatsCard {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof LiveActivityStatsCard>;

/** Instructor: 2 right, 1 wrong, 1 still thinking. */
export const Instructor: Story = {};

/** Learner: the wrong/right split collapses into one "responderam" bucket. */
export const Learner: Story = { args: { hideCorrectness: true } };

/** Flush inside the sidebar panel (`bare` drops the card chrome). */
export const BareInSidebar: Story = { args: { hideCorrectness: true, bare: true } };

/** Short viewport (see useCompactHeight). */
export const Compact: Story = { args: { hideCorrectness: true, bare: true, compact: true } };

/** Empty room — must not divide by zero. */
export const EmptyRoom: Story = { args: { answerers: [] } };
