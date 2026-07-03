import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatsCard } from '@/components/branded';

const meta: Meta<typeof StatsCard> = {
  title: 'Molecules/StatsCard',
  component: StatsCard,
  parameters: { layout: 'centered' },
  render: (args) => (
    <div style={{ width: 420 }}>
      <StatsCard {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof StatsCard>;

export const WithStats: Story = {
  args: { stats: { streakDays: 12, totalXp: 240, badgeCount: 5, completedActivities: 38 } },
};

export const Zeroed: Story = {
  args: { stats: { streakDays: 0, totalXp: 0, badgeCount: 0, completedActivities: 0 } },
};

export const Loading: Story = { args: { loading: true } };
