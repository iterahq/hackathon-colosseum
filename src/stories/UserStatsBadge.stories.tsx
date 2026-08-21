import type { Meta, StoryObj } from '@storybook/react-vite';
import { UserStatsBadge } from '@/components/data-layer/UserStatsBadge';
import { stats } from './dataLayerFixtures';

const meta: Meta<typeof UserStatsBadge> = {
  title: 'DataLayer/UserStatsBadge',
  component: UserStatsBadge,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof UserStatsBadge>;

export const Default: Story = { args: { stats } };

export const FreshAccount: Story = {
  args: { stats: { ...stats, totalXp: 0, level: 1, currentStreak: 0, livesRemaining: 5 } },
};

export const NoLivesLeft: Story = { args: { stats: { ...stats, livesRemaining: 0 } } };

export const HighNumbers: Story = {
  args: { stats: { ...stats, totalXp: 128450, level: 42, currentStreak: 365 } },
};
