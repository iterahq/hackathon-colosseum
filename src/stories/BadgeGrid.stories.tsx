import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronRight } from 'lucide-react';
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
  title: 'Molecules/BadgeGrid',
  component: BadgeGrid,
  render: (args) => (
    <div style={{ maxWidth: 820 }}>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h3 className="font-display text-foreground">Your badge collection</h3>
          <p className="mt-1 text-sm text-muted-foreground">Earn one for each completed course</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm font-medium text-menta transition-colors hover:text-evergreen-hi"
        >
          See all
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="rounded-3xl border border-border bg-card p-6 md:p-8">
        <BadgeGrid {...args} />
      </div>
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
