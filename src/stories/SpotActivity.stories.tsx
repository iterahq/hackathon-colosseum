import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SpotActivity } from '@/components/branded/activity/SpotActivity';
import { makeGatedActivity } from './sceneMechanicsFixtures';
import { SPOT_SPEC } from './sceneMechanicsFixturesB';
import { withActivityWidth } from './decorators';

/**
 * CENA `spot` (2026-09-25, batch B) — tap the exact token that broke the
 * page; it heals in place. A miss shows `miss_hint`; the beat completes once
 * every bug is found. 🚧 do-not-merge — see the release-gate note in
 * `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof SpotActivity> = {
  title: 'Organisms/Activities/8 · Cena/Spot',
  id: 'activities-cena-spot',
  component: SpotActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof SpotActivity>;

/** A.enabled / C.blank — página ainda quebrada, nenhum bug encontrado. */
export const Default: Story = {
  args: { activity: makeGatedActivity('spot', SPOT_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'false');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** D.incorrect → D.correct — tapar um token comum mostra `miss_hint`; o bug conclui. */
export const WrongThenRight: Story = {
  args: { activity: makeGatedActivity('spot', SPOT_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // The bug token looks exactly like its neighbours: the source never gives the answer away.
    await expect(canvas.getByTestId('spot-token-typo-clas').className).toBe(canvas.getByTestId('spot-token-plain-0-0').className);
    await userEvent.click(canvas.getByTestId('spot-token-plain-0-0'));
    await expect(canvas.getByTestId('scene-wrong-hint')).toHaveTextContent(/./);
    await userEvent.click(canvas.getByTestId('spot-token-typo-clas'));
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida, com o bug já consertado. */
export const Done: Story = {
  args: { activity: makeGatedActivity('spot', SPOT_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(canvas.getByTestId('spot-token-typo-clas')).toHaveTextContent('class');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** Mesmo toque no token, num viewport de celular. */
export const MobileTouch: Story = {
  args: { activity: makeGatedActivity('spot', SPOT_SPEC) },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('spot-token-typo-clas'));
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};
