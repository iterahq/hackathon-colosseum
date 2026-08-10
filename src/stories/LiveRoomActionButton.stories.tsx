import type { Meta, StoryObj } from '@storybook/react-vite';
import { Hand, MonitorPlay, UserMinus } from 'lucide-react';
import { LiveRoomActionButton } from '@/components/live/LiveRoomActionButton';

/**
 * LiveRoomActionButton — one button of the professor's per-student action menu.
 *
 * Icon AND short label, always together: the class is run from a tablet as often
 * as from a laptop, and a bare icon on a small target is where the professor hits
 * the wrong row. The `tone` is what keeps "pull to the stage" and "remove from
 * the room" from reading as the same button.
 */
const meta: Meta<typeof LiveRoomActionButton> = {
  title: 'Atoms/Live/LiveRoomActionButton',
  component: LiveRoomActionButton,
  parameters: { layout: 'centered' },
  args: { onClick: () => {}, testId: 'live-room-action-demo' },
};
export default meta;
type Story = StoryObj<typeof LiveRoomActionButton>;

/** Neutral: lowering a hand corrects state, it does not reward or punish. */
export const Neutral: Story = {
  args: { icon: Hand, label: 'Abaixar a mão' },
  name: 'Tone · neutral',
};

/** Stage pull — the accent tone shared with the stage controls. */
export const Primary: Story = {
  args: { icon: MonitorPlay, label: 'Puxar', tone: 'primary' },
  name: 'Tone · primary',
};

/** Destructive, and visually apart from every other action for that reason. */
export const Danger: Story = {
  args: { icon: UserMinus, label: 'Tirar da sala', tone: 'danger' },
  name: 'Tone · danger',
};

/** Disabled: lowering a hand that is already down is impossible. */
export const Disabled: Story = {
  args: { icon: Hand, label: 'Abaixar a mão', disabled: true },
};
