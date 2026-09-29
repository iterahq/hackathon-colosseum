import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PlugActivity } from '@/components/branded/activity/PlugActivity';
import { makeGatedActivity, PLUG_SPEC } from './sceneMechanicsFixtures';
import { withActivityWidth } from './decorators';

/**
 * CENA `plug` (2026-09-25, batch A) — pull the cable and the page collapses;
 * plug it back and it heals. Gate opens only after BOTH halves, in order.
 * No submit; silent. 🚧 do-not-merge — see the release-gate note in
 * `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof PlugActivity> = {
  title: 'Organisms/Activities/8 · Cena/Plug',
  id: 'activities-cena-plug',
  component: PlugActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof PlugActivity>;

/** A.enabled / C.blank — conectado, o cabo no lugar. */
export const Default: Story = {
  args: { activity: makeGatedActivity('plug', PLUG_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('plug-stage')).toHaveAttribute('data-connected', 'true');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted — puxa, depois pluga de volta: o gate abre uma vez. */
export const Solved: Story = {
  args: { activity: makeGatedActivity('plug', PLUG_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const cable = canvas.getByTestId('plug-cable');
    await userEvent.click(cable);
    await expect(canvas.getByTestId('plug-stage')).toHaveAttribute('data-connected', 'false');
    await userEvent.click(cable);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
    // The cable stays live: the learner compares the two versions freely, with no second verdict.
    await userEvent.click(cable);
    await expect(canvas.getByTestId('plug-stage')).toHaveAttribute('data-connected', 'false');
    await userEvent.click(cable);
    await expect(canvas.getByTestId('plug-stage')).toHaveAttribute('data-connected', 'true');
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida direto. */
export const Done: Story = {
  args: { activity: makeGatedActivity('plug', PLUG_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByTestId('plug-cable'));
    await expect(canvas.getByTestId('plug-stage')).toHaveAttribute('data-connected', 'false');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};
