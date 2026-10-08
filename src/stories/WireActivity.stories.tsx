import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { WireActivity } from '@/components/branded/activity/WireActivity';
import { makeGatedActivity } from './sceneMechanicsFixtures';
import { WIRE_SPEC } from './sceneMechanicsFixturesB';
import { withActivityWidth } from './decorators';

/**
 * CENA `wire` (2026-09-25, batch B) — pick a left end, tap the right end it
 * belongs to. A wrong pair shows `wrong_hint` and never sticks; the beat
 * completes once every left end is wired. 🚧 do-not-merge — see the
 * release-gate note in `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof WireActivity> = {
  title: 'Organisms/Activities/8 · Cena/Wire',
  id: 'activities-cena-wire',
  component: WireActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof WireActivity>;

/** A.enabled / C.blank — nenhum par conectado ainda. */
export const Default: Story = {
  args: { activity: makeGatedActivity('wire', WIRE_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'false');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** D.incorrect → D.correct — par errado mostra dica; os três certos concluem. */
export const WrongThenRight: Story = {
  args: { activity: makeGatedActivity('wire', WIRE_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('wire-left-tag-h1'));
    await userEvent.click(canvas.getByTestId('wire-right-paragrafo'));
    await expect(canvas.getByTestId('scene-wrong-hint')).toHaveTextContent(/./);
    await userEvent.click(canvas.getByTestId('wire-left-tag-h1'));
    await userEvent.click(canvas.getByTestId('wire-right-titulo'));
    await userEvent.click(canvas.getByTestId('wire-left-tag-p'));
    await userEvent.click(canvas.getByTestId('wire-right-paragrafo'));
    await userEvent.click(canvas.getByTestId('wire-left-tag-a'));
    await userEvent.click(canvas.getByTestId('wire-right-link'));
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'true');
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida, com todos os fios ligados. */
export const Done: Story = {
  args: { activity: makeGatedActivity('wire', WIRE_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'true');
    for (const pair of WIRE_SPEC.pairs) {
      await expect(canvas.getByTestId(`wire-left-${pair.left_id}`)).toHaveAttribute('data-wired', 'true');
    }
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** Mesmo gesto de tap-tap, num viewport de toque — nunca drag, então pointer e touch concordam. */
export const MobileTouch: Story = {
  args: { activity: makeGatedActivity('wire', WIRE_SPEC) },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('wire-left-tag-h1'));
    await userEvent.click(canvas.getByTestId('wire-right-titulo'));
    await expect(args.onComplete).not.toHaveBeenCalled();
    await expect(canvas.getByTestId('wire-left-tag-h1')).toBeDisabled();
  },
};
