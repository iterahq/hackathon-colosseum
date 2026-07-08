import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveRosterCard } from '@/components/live/LiveRosterCard';
import { sampleRoster } from './liveFixtures';

/**
 * LiveRosterCard — "na sala": who is present in the live class right now
 * (from Realtime presence). Shown on both the student and instructor surfaces.
 */
const meta: Meta<typeof LiveRosterCard> = {
  title: 'Molecules/Live/LiveRosterCard',
  component: LiveRosterCard,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof LiveRosterCard>;

/** A populated room, with the current user highlighted. */
export const WithLearners: Story = { args: { roster: sampleRoster, selfUserId: 'a' } };

/** Nobody has joined yet. */
export const Empty: Story = { args: { roster: [] } };
