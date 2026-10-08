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

/** A.enabled / C.blank — na ordem `start`, embaralhada; o `sub` de um item aparece embaixo do rótulo. */
export const Default: Story = {
  args: {
    activity: makeGatedActivity('arrange', {
      ...ARRANGE_SPEC,
      items: ARRANGE_SPEC.items.map((item) => (item.id === 'debitar' ? { ...item, sub: 'tira da conta' } : item)),
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('arrange-item-confirmar')).toBeInTheDocument();
    await expect(canvas.getByTestId('arrange-sub-debitar')).toHaveTextContent('tira da conta');
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
    await waitFor(() => expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'true'), { timeout: 2000 });
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** H.degenerado — `start` já igual a `correct`: nada abre sem um gesto do aluno. */
export const StartAlreadyCorrect: Story = {
  args: { activity: makeGatedActivity('arrange', { ...ARRANGE_SPEC, start: ARRANGE_SPEC.correct }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'false');
    await expect(args.onComplete).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByTestId('arrange-down-checar-saldo'));
    await userEvent.click(canvas.getByTestId('arrange-up-checar-saldo'));
    await waitFor(() => expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'true'), { timeout: 2000 });
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida, já na ordem certa. */
export const Done: Story = {
  args: { activity: makeGatedActivity('arrange', ARRANGE_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'true');
    const ids = [...canvas.getByTestId('arrange-stage').querySelectorAll('li')].map((li) => li.dataset.testid);
    await expect(ids).toEqual(ARRANGE_SPEC.correct.map((id) => `arrange-item-${id}`));
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};
