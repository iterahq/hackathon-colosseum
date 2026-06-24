import type { Meta, StoryObj } from '@storybook/react-vite';
import { BadgeGrid } from '@/components/branded';
import type { Badge } from '@/types/content';

const mk = (id: string, title: string, earned: boolean): Badge => ({
  id,
  slug: id,
  title: { en: title },
  icon: null,
  earned,
});

const badges: Badge[] = [
  mk('1', 'UI Master', true),
  mk('2', 'Network Hacker', false),
  mk('3', 'UX Wizard', false),
  mk('4', 'React Sage', true),
  mk('5', 'AI Sorcerer', false),
  mk('6', 'Cloud Architect', false),
];

const meta: Meta<typeof BadgeGrid> = {
  title: 'Branded/BadgeGrid',
  component: BadgeGrid,
  render: (args) => (
    <div className="rounded-3xl border border-border bg-card p-8" style={{ maxWidth: 720 }}>
      <BadgeGrid {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof BadgeGrid>;

export const Mixed: Story = { args: { badges } };
export const AllLocked: Story = { args: { badges: badges.map((b) => ({ ...b, earned: false })) } };
export const AllEarned: Story = { args: { badges: badges.map((b) => ({ ...b, earned: true })) } };
export const Empty: Story = { args: { badges: [] } };
export const Loading: Story = { args: { loading: true } };
