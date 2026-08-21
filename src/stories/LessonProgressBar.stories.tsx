import type { Meta, StoryObj } from '@storybook/react-vite';
import { LessonProgressBar } from '@/components/data-layer/LessonProgressBar';
import { lessonProgress } from './dataLayerFixtures';

const meta: Meta<typeof LessonProgressBar> = {
  title: 'DataLayer/LessonProgressBar',
  component: LessonProgressBar,
  parameters: { layout: 'centered' },
  render: (args) => (
    <div style={{ width: 320 }}>
      <LessonProgressBar {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof LessonProgressBar>;

export const Halfway: Story = { args: { progress: lessonProgress } };

export const NotStarted: Story = {
  args: { progress: { ...lessonProgress, completedActivities: 0, percent: 0 } },
};

export const Complete: Story = {
  args: { progress: { ...lessonProgress, completedActivities: 12, percent: 100 } },
};

// Lição de uma atividade só: a barra pula direto de 0 para 100, sem meio-termo.
export const SingleActivity: Story = {
  args: {
    progress: { lessonId: 'l2', completedActivities: 1, totalActivities: 1, percent: 100 },
  },
};
