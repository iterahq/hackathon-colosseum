import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { InterceptActivity } from '@/components/branded/activity/InterceptActivity';
import { makeGatedActivity } from './sceneMechanicsFixtures';
import { INTERCEPT_SPEC } from './sceneMechanicsFixturesB';
import { withActivityWidth } from './decorators';

/**
 * CENA `intercept` (2026-09-25, batch B) — a packet loops the diagram; tap
 * the node named by `answer` to catch it. A wrong tap shows `wrong_hint` and
 * the loop keeps going. 🚧 do-not-merge — see the release-gate note in
 * `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof InterceptActivity> = {
  title: 'Organisms/Activities/8 · Cena/Intercept',
  id: 'activities-cena-intercept',
  component: InterceptActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof InterceptActivity>;

/** A.enabled / C.blank — o pacote ainda circulando, nada tapado. */
export const Default: Story = {
  args: { activity: makeGatedActivity('intercept', INTERCEPT_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'false');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** D.incorrect → D.correct — nó errado mostra `wrong_hint`; o nó certo conclui na hora. */
export const WrongThenRight: Story = {
  args: { activity: makeGatedActivity('intercept', INTERCEPT_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('intercept-node-celular'));
    await expect(canvas.getByTestId('scene-wrong-hint')).toHaveTextContent(/./);
    await userEvent.click(canvas.getByTestId('intercept-node-servidor'));
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida direto. */
export const Done: Story = {
  args: { activity: makeGatedActivity('intercept', INTERCEPT_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** Mesmo toque no nó, num viewport de celular. */
export const MobileTouch: Story = {
  args: { activity: makeGatedActivity('intercept', INTERCEPT_SPEC) },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('intercept-node-servidor'));
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};
