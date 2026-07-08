import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveSoundToggle } from '@/components/live/LiveSoundToggle';

/**
 * LiveSoundToggle — mutes/unmutes the live-class sound cues (shared preference
 * persisted in localStorage). Full-width label variant for sidebars and an
 * icon-only `compact` variant for the always-visible header slot.
 */
const meta: Meta<typeof LiveSoundToggle> = {
  title: 'Atoms/Live/LiveSoundToggle',
  component: LiveSoundToggle,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof LiveSoundToggle>;

/** Full-width labelled button (sidebar). */
export const Default: Story = { args: { compact: false } };

/** Icon-only round button (header). */
export const Compact: Story = { args: { compact: true } };
