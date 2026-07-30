import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveHandButton } from '@/components/live/LiveHandButton';

/**
 * LiveHandButton — the learner's only way to ask for the floor mid-class.
 *
 * `full` is the placement that ships: a full-width row at the TOP of the learner
 * sidebar, opposite the activity column. Squeezed into the top chrome (the
 * default, compact shape) it was too small to be found during a class — which is
 * exactly the complaint that moved it.
 */
const meta: Meta<typeof LiveHandButton> = {
  title: 'Molecules/Live/LiveHandButton',
  component: LiveHandButton,
  parameters: { layout: 'centered' },
  args: { onToggle: () => {} },
};
export default meta;
type Story = StoryObj<typeof LiveHandButton>;

/** Sidebar placement, hand down — the label is always visible. */
export const SidebarDown: Story = {
  args: { full: true, raised: false },
  render: (args) => (
    <div style={{ width: 300 }}>
      <LiveHandButton {...args} />
    </div>
  ),
};

/** Sidebar placement, hand up — pulses so the professor sees it from the front. */
export const SidebarRaised: Story = {
  args: { full: true, raised: true },
  render: (args) => (
    <div style={{ width: 300 }}>
      <LiveHandButton {...args} />
    </div>
  ),
};

/** The compact shape, kept for tight rows: label hides below `sm`. */
export const Compact: Story = { args: { raised: false } };

/** Compact and raised. */
export const CompactRaised: Story = { args: { raised: true } };
