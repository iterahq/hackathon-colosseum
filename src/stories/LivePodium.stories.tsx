import type { Meta, StoryObj } from '@storybook/react-vite';
import { LivePodium } from '@/components/live/LivePodium';
import {
  sampleGuestUserIds,
  sampleRanking,
  sampleRankingWithGuest,
  sampleRankingWithStars,
} from './liveFixtures';

/**
 * LivePodium — the end-of-class standings.
 *
 * Score-first: points decide the order and total time only breaks ties. A point
 * is a right answer OR a star from the professor, so the star is a real reward
 * and not a badge — but the two stay side by side on the row, because the class
 * has to be able to tell an earned point from a given one.
 */
const meta: Meta<typeof LivePodium> = {
  title: 'Organisms/Live/LivePodium',
  component: LivePodium,
  parameters: { layout: 'fullscreen' },
  args: { ranking: sampleRanking },
};
export default meta;
type Story = StoryObj<typeof LivePodium>;

/** Right answers only. */
export const Default: Story = {};

/** Highlights the viewer's own row wherever it lands. */
export const WithSelf: Story = { args: { selfUserId: 'c' } };

/** Stars counted as points: Bruno's 1 right + 2 stars overtakes Caio's 2 right. */
export const WithStars: Story = { args: { ranking: sampleRankingWithStars, selfUserId: 'b' } };

/** A guest CAN win it (ADR-9) — the badge is what keeps that honest (ADR-11). */
export const WithGuestWinner: Story = {
  args: { ranking: sampleRankingWithGuest, guestUserIds: sampleGuestUserIds, selfUserId: 'a' },
};

/** Class ended before anyone answered. */
export const Empty: Story = { args: { ranking: { ranked: [], waiting: [] } } };
