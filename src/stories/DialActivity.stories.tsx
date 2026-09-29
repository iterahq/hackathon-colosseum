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

/** A.enabled / C.blank — o slider no `start`, fora do range alvo; a linha do CSS e a dica do alvo embaixo. */
export const Default: Story = {
  args: { activity: makeGatedActivity('dial', { ...DIAL_SPEC, target_hint: 'entre 24 e 32' }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'false');
    await expect(canvas.getByTestId('dial-rule')).toHaveTextContent('p { font-size: 12px; }');
    await expect(canvas.getByTestId('dial-target-hint')).toHaveTextContent('entre 24 e 32');
    dragSlider(canvas.getByTestId('dial-slider') as HTMLInputElement, 14);
    await expect(canvas.getByTestId('dial-rule')).toHaveTextContent('p { font-size: 14px; }');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** H.degenerado — o `start` já dentro do alvo: nada abre sem um gesto do aluno. */
export const StartInsideTarget: Story = {
  args: { activity: makeGatedActivity('dial', { ...DIAL_SPEC, start: 26 }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await expect(canvas.queryByTestId('scene-stamp')).toBeNull();
    await expect(args.onComplete).not.toHaveBeenCalled();
    dragSlider(canvas.getByTestId('dial-slider') as HTMLInputElement, 27);
    await waitFor(() => expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument(), { timeout: 2000 });
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
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
    // The slider stays live after the gate: the learner keeps exploring, with no second verdict.
    dragSlider(slider, 14);
    await expect(canvas.getByTestId('dial-rule')).toHaveTextContent('p { font-size: 14px; }');
    dragSlider(slider, 30);
    await expect(canvas.getByTestId('dial-rule')).toHaveTextContent('p { font-size: 30px; }');
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida, com o slider num valor dentro do alvo, e ainda mexe. */
export const Done: Story = {
  args: { activity: makeGatedActivity('dial', DIAL_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    const slider = canvas.getByTestId('dial-slider') as HTMLInputElement;
    await expect(slider.value).toBe('28');
    await expect(canvas.getByTestId('dial-rule')).toHaveTextContent('p { font-size: 28px; }');
    await expect(slider).toBeEnabled();
    dragSlider(slider, 16);
    await expect(canvas.getByTestId('dial-value')).toHaveTextContent('16px');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};
