import type { Meta, StoryObj } from '@storybook/react-vite';
import { Hand, Star, StarOff, UserMinus } from 'lucide-react';
import { LiveRoomActionButton } from '@/components/live/LiveRoomActionButton';

/**
 * LiveRoomActionButton — one button of the professor's per-student action menu.
 *
 * Icon AND short label, always together: the class is run from a tablet as often
 * as from a laptop, and a bare icon on a small target is where the professor hits
 * the wrong row. The `tone` is what keeps "give a star" and "remove from the room"
 * from reading as the same button.
 */
const meta: Meta<typeof LiveRoomActionButton> = {
  title: 'Atoms/Live/LiveRoomActionButton',
  component: LiveRoomActionButton,
  parameters: { layout: 'centered' },
  args: { onClick: () => {}, testId: 'live-room-action-demo' },
};
export default meta;
type Story = StoryObj<typeof LiveRoomActionButton>;

/** Reward — the one action the professor uses most in a class. */
export const Star_: Story = {
  args: { icon: Star, label: 'Estrela', tone: 'star' },
  name: 'Tone · star',
};

/** Neutral: lowering a hand corrects state, it does not reward or punish. */
export const Neutral: Story = {
  args: { icon: Hand, label: 'Abaixar a mão' },
  name: 'Tone · neutral',
};

/** Destructive, and visually apart from the rewards for exactly that reason. */
export const Danger: Story = {
  args: { icon: UserMinus, label: 'Tirar da sala', tone: 'danger' },
  name: 'Tone · danger',
};

/** Stage pull — the accent tone shared with the stage controls. */
export const Primary: Story = {
  args: { icon: Star, label: 'Puxar', tone: 'primary' },
  name: 'Tone · primary',
};

/** Disabled: taking a star back is impossible at zero. */
export const Disabled: Story = {
  args: { icon: StarOff, label: 'Tirar estrela', disabled: true },
};
