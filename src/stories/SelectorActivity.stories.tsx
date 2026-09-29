import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SelectorActivity } from '@/components/branded/activity/SelectorActivity';
import { makeGatedActivity, SELECTOR_SPEC } from './sceneMechanicsFixtures';
import { withActivityWidth } from './decorators';

/**
 * CENA `selector` (2026-09-25, batch A) — pick the selector chip that matches
 * `targets` EXACTLY. A wrong chip lights up the wrong elements and shows a
 * hint; the learner cannot fail. No submit; silent. 🚧 do-not-merge — see the
 * release-gate note in `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof SelectorActivity> = {
  title: 'Organisms/Activities/8 · Cena/Selector',
  id: 'activities-cena-selector',
  component: SelectorActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof SelectorActivity>;

/** A.enabled / C.blank — nenhum chip escolhido ainda. */
export const Default: Story = {
  args: { activity: makeGatedActivity('selector', SELECTOR_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('selector-option-h1')).toHaveAttribute('aria-pressed', 'false');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** D.incorrect → D.correct — um chip errado mostra dica; o certo abre o gate. */
export const WrongThenRight: Story = {
  args: { activity: makeGatedActivity('selector', SELECTOR_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('selector-option-h1'));
    await expect(canvas.getByTestId('scene-wrong-hint')).toHaveTextContent(/./);
    await expect(args.onComplete).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByTestId('selector-option-p'));
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida direto. */
export const Done: Story = {
  args: { activity: makeGatedActivity('selector', SELECTOR_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};
