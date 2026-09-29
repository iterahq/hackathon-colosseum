import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ArrangeActivity } from '@/components/branded/activity/ArrangeActivity';
import { ARRANGE_SPEC, makeGatedActivity } from './sceneMechanicsFixtures';
import { withActivityWidth } from './decorators';

/**
 * CENA `arrange` (2026-09-25, batch A) — reorder items (move up/down — the
 * accessible alternative to drag, same as `OrderActivity`) until they settle
 * in `correct`. No submit; silent. 🚧 do-not-merge — see the release-gate
 * note in `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof ArrangeActivity> = {
  title: 'Organisms/Activities/8 · Cena/Arrange',
  id: 'activities-cena-arrange',
  component: ArrangeActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ArrangeActivity>;

/** A.enabled / C.blank — na ordem `start`, embaralhada. */
export const Default: Story = {
  args: { activity: makeGatedActivity('arrange', ARRANGE_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('arrange-item-confirmar')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted — subir os itens até `correct` abre o gate, uma vez. */
export const Settled: Story = {
  args: { activity: makeGatedActivity('arrange', ARRANGE_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // start = [confirmar, checar-saldo, debitar] → correct = [checar-saldo, debitar, confirmar]
    await userEvent.click(canvas.getByTestId('arrange-up-checar-saldo'));
    await userEvent.click(canvas.getByTestId('arrange-up-debitar'));
    await waitFor(() => expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument(), { timeout: 2000 });
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida direto. */
export const Done: Story = {
  args: { activity: makeGatedActivity('arrange', ARRANGE_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};
