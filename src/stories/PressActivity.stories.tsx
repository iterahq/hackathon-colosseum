import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PressActivity } from '@/components/branded/activity/PressActivity';
import { makeGatedActivity, PRESS_SPEC } from './sceneMechanicsFixtures';
import { withActivityWidth } from './decorators';

/**
 * CENA `press` (2026-09-25, batch A) — pick the option that wires the dead
 * button, then press it `goal` times. A wrong option shows `wrong_hint` and
 * the button stays dead; the learner cannot fail. 🚧 do-not-merge — see the
 * release-gate note in `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof PressActivity> = {
  title: 'Organisms/Activities/8 · Cena/Press',
  id: 'activities-cena-press',
  component: PressActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof PressActivity>;

/** A.enabled / C.blank — botão morto, nenhuma opção escolhida. */
export const Default: Story = {
  args: { activity: makeGatedActivity('press', PRESS_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('press-button')).toBeDisabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** D.incorrect → D.correct — opção errada mostra dica; a certa liga o botão; N cliques concluem. */
export const WrongThenGoalReached: Story = {
  args: { activity: makeGatedActivity('press', PRESS_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('press-option-oninput'));
    await expect(canvas.getByTestId('scene-wrong-hint')).toHaveTextContent(/./);
    await userEvent.click(canvas.getByTestId('press-option-onclick'));
    await expect(canvas.getByTestId('press-button')).toBeEnabled();
    await userEvent.click(canvas.getByTestId('press-button'));
    await userEvent.click(canvas.getByTestId('press-button'));
    await userEvent.click(canvas.getByTestId('press-button'));
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida direto. */
export const Done: Story = {
  args: { activity: makeGatedActivity('press', PRESS_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};
