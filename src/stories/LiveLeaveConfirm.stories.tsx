import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveLeaveConfirm } from '@/components/live/LiveLeaveConfirm';

/**
 * LiveLeaveConfirm — the learner's "leave the class?" confirmation, anchored under
 * the close X of the live chrome.
 *
 * The X sits a thumb away from the LIVE pill and the avatar, so an accidental tap
 * used to drop a learner out of the cohort with no obvious way back. Focus starts
 * on "continuar na aula": the safe option, never the exit.
 */
const meta: Meta<typeof LiveLeaveConfirm> = {
  title: 'Organisms/Live/LiveLeaveConfirm',
  component: LiveLeaveConfirm,
  args: { onConfirm: () => {}, onCancel: () => {} },
};
export default meta;
type Story = StoryObj<typeof LiveLeaveConfirm>;

export const Default: Story = {};
