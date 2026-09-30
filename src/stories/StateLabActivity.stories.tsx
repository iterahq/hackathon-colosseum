import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { StateLabActivity } from '@/components/branded/activity/StateLabActivity';
import { makeSystemActivity, STATE_LAB_SPEC } from './systemKindsFixtures';
import { withActivityWidth } from './decorators';

/**
 * CENA `state_lab` (2026-09-30, system kinds) — operate the explicit state and
 * watch the interface redraw; completes when every goal holds at once.
 * 🚧 do-not-merge — see the release-gate note in
 * `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof StateLabActivity> = {
  title: 'Organisms/Activities/8 · Cena/StateLab',
  id: 'activities-cena-state-lab',
  component: StateLabActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof StateLabActivity>;

/** A.enabled / C.blank — estado inicial, nenhuma meta cumprida. */
export const Default: Story = {
  args: { activity: makeSystemActivity('state_lab', STATE_LAB_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('state-lab-goal-0')).toHaveAttribute('data-met', 'false');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** Gesto completo — ligar as duas tarefas redesenha a lista e cumpre as metas. */
export const ReachGoals: Story = {
  args: { activity: makeSystemActivity('state_lab', STATE_LAB_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('state-lab-control-add_task'));
    await expect(canvas.getByTestId('system-node-item#3')).toBeInTheDocument();
    await userEvent.click(canvas.getByTestId('state-lab-control-toggle_first'));
    await expect(canvas.getByTestId('state-lab-goal-0')).toHaveAttribute('data-met', 'true');
    await expect(args.onComplete).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByTestId('state-lab-control-toggle_second'));
    await waitFor(() => expect(args.onComplete).toHaveBeenCalledTimes(1));
  },
};

/** B.done — concluída antes: abre com as metas cumpridas e o carimbo. */
export const Done: Story = {
  args: { activity: makeSystemActivity('state_lab', STATE_LAB_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(canvas.getByTestId('state-lab-goal-1')).toHaveAttribute('data-met', 'true');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};
