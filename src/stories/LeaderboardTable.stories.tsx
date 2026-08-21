import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeaderboardTable } from '@/components/data-layer/LeaderboardTable';
import { leaderboard } from './dataLayerFixtures';

const meta: Meta<typeof LeaderboardTable> = {
  title: 'DataLayer/LeaderboardTable',
  component: LeaderboardTable,
  render: (args) => (
    <div style={{ maxWidth: 560 }}>
      <LeaderboardTable {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof LeaderboardTable>;

export const Ranked: Story = { args: { entries: leaderboard } };

export const CurrentUserOnTop: Story = {
  args: { entries: leaderboard.map((e, i) => ({ ...e, isCurrentUser: i === 0 })) },
};

export const WithoutCurrentUser: Story = {
  args: { entries: leaderboard.map((e) => ({ ...e, isCurrentUser: false })) },
};

export const SingleEntry: Story = { args: { entries: leaderboard.slice(0, 1) } };

export const Empty: Story = { args: { entries: [] } };

// Nome longo é o caso que quebra layout de tabela na vida real, não o curto.
export const LongDisplayName: Story = {
  args: {
    entries: leaderboard.map((e, i) =>
      i === 1 ? { ...e, displayName: 'Maria Fernanda de Albuquerque Cavalcanti Souza' } : e,
    ),
  },
};
