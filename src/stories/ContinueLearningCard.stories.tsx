import type { Meta, StoryObj } from '@storybook/react-vite';
import { ContinueLearningCard } from '@/components/data-layer/ContinueLearningCard';
import { resume } from './dataLayerFixtures';

const meta: Meta<typeof ContinueLearningCard> = {
  title: 'DataLayer/ContinueLearningCard',
  component: ContinueLearningCard,
  parameters: { layout: 'centered' },
  render: (args) => (
    <div style={{ width: 480 }}>
      <ContinueLearningCard {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof ContinueLearningCard>;

export const MidLesson: Story = { args: { resume } };

export const JustStarted: Story = {
  args: { resume: { ...resume, completedActivities: 0, percent: 0 } },
};

export const AlmostDone: Story = {
  args: { resume: { ...resume, completedActivities: 11, percent: 92 } },
};

export const LongTitle: Story = {
  args: {
    resume: {
      ...resume,
      lessonTitle:
        'Estado em React: useState, useReducer e quando cada um faz sentido no fluxo de dados',
    },
  },
};
