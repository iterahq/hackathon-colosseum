import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgramIcon } from '@/components/branded';

const meta: Meta<typeof ProgramIcon> = {
  title: 'Branded/ProgramIcon',
  component: ProgramIcon,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof ProgramIcon>;

const ICONS = ['shield', 'code', 'wand', 'brain', 'cloud', 'cpu', 'rocket', 'book', 'layers', 'sparkles'];

export const AllCategories: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, maxWidth: 560 }}>
      {ICONS.map((icon) => (
        <div key={icon} style={{ textAlign: 'center' }}>
          <ProgramIcon icon={icon} size="lg" />
          <div className="font-mono text-[11px] text-muted-foreground mt-2">{icon}</div>
        </div>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
      <ProgramIcon icon="brain" size="sm" />
      <ProgramIcon icon="brain" size="md" />
      <ProgramIcon icon="brain" size="lg" />
      <ProgramIcon icon="brain" size="xl" />
    </div>
  ),
};

export const Flat: Story = {
  render: () => <ProgramIcon icon="code" size="xl" flat />,
};
