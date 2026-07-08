import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveRankingCard } from '@/components/live/LiveRankingCard';
import { sampleRanking } from './liveFixtures';

/**
 * LiveRankingCard — instructor-only speed leaderboard of the present learners,
 * ranked by cumulative answer time (fastest first). Learners who haven't
 * answered yet sit in a separate "waiting" section.
 */
const meta: Meta<typeof LiveRankingCard> = {
  title: 'Organisms/Live/LiveRankingCard',
  component: LiveRankingCard,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof LiveRankingCard>;

/** A ranked cohort with medals + one learner still to answer. */
export const Default: Story = { args: { ranking: sampleRanking } };

/** Nobody has answered yet. */
export const Empty: Story = { args: { ranking: { ranked: [], waiting: [] } } };
