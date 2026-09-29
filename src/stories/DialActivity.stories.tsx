import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, waitFor, within } from 'storybook/test';
import { DialActivity } from '@/components/branded/activity/DialActivity';
import { dragSlider } from './interactions';
import { DIAL_SPEC, makeGatedActivity } from './sceneMechanicsFixtures';
import { withActivityWidth } from './decorators';

/**
 * CENA `dial` (2026-09-25, batch A) — drag a slider; the styled element
 * restyles live. Settles once the value holds inside `target` for a moment.
 * No submit; silent. 🚧 do-not-merge — see the release-gate note in
 * `packages/activities/src/specs.ts`.
 */

const meta: Meta<typeof DialActivity> = {
  title: 'Organisms/Activities/8 · Cena/Dial',
  id: 'activities-cena-dial',
  component: DialActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof DialActivity>;

/** A.enabled / C.blank — o slider no `start`, fora do range alvo. */
export const Default: Story = {
  args: { activity: makeGatedActivity('dial', DIAL_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'false');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted — arrastar até o range alvo abre o gate, uma vez. */
export const Settled: Story = {
  args: { activity: makeGatedActivity('dial', DIAL_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const slider = canvas.getByTestId('dial-slider') as HTMLInputElement;
    dragSlider(slider, 28);
    await waitFor(() => expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument(), { timeout: 2000 });
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida direto. */
export const Done: Story = {
  args: { activity: makeGatedActivity('dial', DIAL_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};
