import type { Meta, StoryObj } from '@storybook/react-vite';
import { AchievementsList } from '@/components/data-layer/AchievementsList';
import { achievements } from './dataLayerFixtures';

const meta: Meta<typeof AchievementsList> = {
  title: 'DataLayer/AchievementsList',
  component: AchievementsList,
  render: (args) => (
    <div style={{ maxWidth: 420 }}>
      <AchievementsList {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof AchievementsList>;

export const Mixed: Story = { args: { achievements } };

export const AllLocked: Story = {
  args: { achievements: achievements.map((a) => ({ ...a, unlockedAt: null })) },
};

export const AllUnlocked: Story = {
  args: {
    achievements: achievements.map((a) => ({ ...a, unlockedAt: '2026-08-20T12:00:00.000Z' })),
  },
};

export const Empty: Story = { args: { achievements: [] } };
