import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecentActivityFeed } from '@/components/data-layer/RecentActivityFeed';
import { activityEvents } from './dataLayerFixtures';

const meta: Meta<typeof RecentActivityFeed> = {
  title: 'DataLayer/RecentActivityFeed',
  component: RecentActivityFeed,
  parameters: { layout: 'centered' },
  render: (args) => (
    <div style={{ width: 400 }}>
      <RecentActivityFeed {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof RecentActivityFeed>;

export const AllTypes: Story = { args: { events: activityEvents } };

// Um evento só não desenha a linha vertical da timeline — vale ver isolado.
export const SingleEvent: Story = { args: { events: [activityEvents[0]] } };

export const Empty: Story = { args: { events: [] } };

export const LongLabel: Story = {
  args: {
    events: [
      {
        ...activityEvents[0],
        label:
          'Terminou "Estado em React: useState, useReducer e quando cada um faz sentido no fluxo de dados"',
      },
      activityEvents[1],
    ],
  },
};
