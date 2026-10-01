import type { Meta, StoryObj } from '@storybook/react-vite';
import { EnrolledProgramCard } from '@/components/branded/EnrolledProgramCard';

const program = {
  id: 'itera-v2',
  title: { pt: 'Itera: HTML, CSS e JS do zero', en: 'Itera: HTML, CSS and JS from zero' },
  unitCount: 3,
  lessonCount: 15,
  activityCount: 235,
  icon: 'code',
};

const meta: Meta<typeof EnrolledProgramCard> = {
  title: 'Branded/EnrolledProgramCard',
  component: EnrolledProgramCard,
  args: { onOpen: () => {} },
  render: (args) => (
    <div style={{ maxWidth: 340 }}>
      <EnrolledProgramCard {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof EnrolledProgramCard>;

export const NotStarted: Story = { args: { program } };
export const InProgress: Story = { args: { program: { ...program, completedCount: 19 } } };
export const Completed: Story = { args: { program: { ...program, completedCount: 235 } } };
