import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgramCard } from '@/components/branded';
import type { Program } from '@/types/content';

const base: Program = {
  id: 'p1',
  tenantId: 't1',
  slug: 'web-fundamentals',
  title: { en: 'Web Fundamentals', pt: 'Fundamentos Web' },
  createdAt: new Date().toISOString(),
  unitCount: 3,
  lessonCount: 8,
  activityCount: 16,
  completedCount: 10,
  icon: 'code',
};

const meta: Meta<typeof ProgramCard> = {
  title: 'Branded/ProgramCard',
  component: ProgramCard,
  parameters: { layout: 'centered' },
  render: (args) => (
    <div style={{ width: 360 }}>
      <ProgramCard {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof ProgramCard>;

export const InProgress: Story = { args: { program: base } };

export const NotStarted: Story = {
  args: { program: { ...base, completedCount: 0, icon: 'shield', title: { en: 'Ethical Network Hacking' } } },
};

export const Completed: Story = {
  args: {
    program: { ...base, completedCount: 16, icon: 'brain', title: { en: 'AI Engineering with LLMs' } },
  },
};

export const Design: Story = {
  args: { program: { ...base, icon: 'wand', title: { en: 'UX Research Wizardry' }, completedCount: 6, activityCount: 17 } },
};

export const Cloud: Story = {
  args: { program: { ...base, icon: 'cloud', title: { en: 'Cloud Architecture on AWS' }, completedCount: 2 } },
};
