import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { LiveTypeActivity } from '@/components/branded/activity/LiveTypeActivity';
import { makeActivity } from './activityFixtures';
import { LIVE_TYPE_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * CENA `live_type` (2026-09-24) — editor à esquerda, navegador à direita. Um
 * fantasma digita o `<h1>`; depois o aluno digita DENTRO da tag e a página
 * acompanha cada tecla. O texto dele, parado por 700 ms, abre o gate.
 *
 *   frame da cena + { target_id, min_length? }
 *
 * O texto do aluno NUNCA vai pro trace — só `{ length }`. As stories que
 * esperam o fantasma (~3 s) vão pro navegador (`browser-mode`).
 */
const meta: Meta<typeof LiveTypeActivity> = {
  title: 'Organisms/Activities/8 · Cena/Live type',
  id: 'activities-cena-live-type',
  component: LiveTypeActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof LiveTypeActivity>;

const GHOST_DONE = { timeout: 8000 };

/** A.enabled / C.blank — o fantasma começa a digitar; ainda não é a vez do aluno. */
export const Default: Story = {
  args: { activity: makeActivity('live_type', LIVE_TYPE_SPEC) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('live-type-ghost')).toBeInTheDocument();
    await expect(canvas.queryByTestId('live-type-input')).toBeNull();
  },
};

/** C.answered — a vez do aluno: o texto vira um campo DENTRO da tag, já selecionado. */
export const LearnerTurn: Story = {
  tags: ['browser-mode'],
  args: { activity: makeActivity('live_type', LIVE_TYPE_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = await waitFor(() => canvas.getByTestId('live-type-input'), GHOST_DONE);
    await expect(input).toHaveValue('Oi, eu sou o Tera');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted — o aluno troca pelo próprio nome; o navegador acompanha e o gate abre. */
export const TypedOwnName: Story = {
  tags: ['browser-mode'],
  args: { activity: makeActivity('live_type', LIVE_TYPE_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = await waitFor(() => canvas.getByTestId('live-type-input'), GHOST_DONE);
    await userEvent.clear(input);
    await userEvent.type(input, 'Oi, eu sou o Samuel');
    await expect(canvas.getByTestId('live-type-target')).toHaveTextContent('Oi, eu sou o Samuel');
    // The gate opens only after SETTLE_MS (700ms) of no further typing — give
    // the default 1000ms assertion window enough room over that debounce.
    await waitFor(() => expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'true'), { timeout: 3000 });
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída antes: o texto original na tag, carimbo à vista, nada a digitar de novo. */
export const Done: Story = {
  args: { activity: makeActivity('live_type', LIVE_TYPE_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'true');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};
