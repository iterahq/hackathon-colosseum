import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { DecomposeCanvasActivity } from '@/components/branded/activity/DecomposeCanvasActivity';
import { DECOMPOSE_CANVAS_SPEC, makeSystemActivity } from './systemKindsFixtures';
import { withActivityWidth } from './decorators';

/**
 * CENA `decompose_canvas` (2026-09-30, system kinds) — select the leaves that
 * belong together, name their part, then "Verificar". Judged by constraints
 * (`must_group` / `must_separate`), never by an answer key. 🚧 do-not-merge —
 * see the release-gate note in `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof DecomposeCanvasActivity> = {
  title: 'Organisms/Activities/8 · Cena/DecomposeCanvas',
  id: 'activities-cena-decompose-canvas',
  component: DecomposeCanvasActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof DecomposeCanvasActivity>;

async function group(canvasElement: HTMLElement, ids: string[], part: string) {
  const canvas = within(canvasElement);
  for (const id of ids) await userEvent.click(canvas.getByTestId(`system-node-${id}`));
  await userEvent.click(canvas.getByTestId(`decompose-part-${part}`));
}

/** A.enabled / C.blank — nada agrupado, "Verificar" ainda desligado. */
export const Default: Story = {
  args: { activity: makeSystemActivity('decompose_canvas', DECOMPOSE_CANVAS_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'false');
    await expect(canvas.getByTestId('decompose-verify')).toBeDisabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** D.incorrect → D.correct — uma regra violada mostra a dica dela; regrupar e verificar conclui. */
export const WrongThenRight: Story = {
  args: { activity: makeSystemActivity('decompose_canvas', DECOMPOSE_CANVAS_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await group(canvasElement, ['title', 'new'], 'header');
    await group(canvasElement, ['add_btn'], 'add');
    await group(canvasElement, ['item#0', 'item#1', 'item#2'], 'item');
    await userEvent.click(canvas.getByTestId('decompose-verify'));
    await expect(canvas.getByTestId('scene-wrong-hint')).toHaveTextContent(/./);
    await expect(args.onComplete).not.toHaveBeenCalled();
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-region="item"]')).toHaveLength(3));
    await group(canvasElement, ['new'], 'add');
    await userEvent.click(canvas.getByTestId('decompose-verify'));
    await waitFor(() => expect(args.onComplete).toHaveBeenCalledTimes(1));
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'true');
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida, com o carimbo. */
export const Done: Story = {
  args: { activity: makeSystemActivity('decompose_canvas', DECOMPOSE_CANVAS_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'true');
    await expect(canvas.queryByTestId('decompose-verify')).toBeNull();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/**
 * B.done + `priorAnswer` — o host devolve a conclusão que a própria atividade
 * entregou; ela redesenha as partes do aluno (uma moldura por item da lista).
 */
export const DoneRestored: Story = {
  args: {
    activity: makeSystemActivity('decompose_canvas', DECOMPOSE_CANVAS_SPEC, 'done'),
    priorAnswer: {
      actions: [
        {
          type: 'gate_opened',
          at: 0,
          payload: {
            parts: 4,
            assignment: [
              ['title', 'header'],
              ['new', 'add'],
              ['add_btn', 'add'],
              ['item#0', 'item'],
              ['item#1', 'item'],
              ['item#2', 'item'],
            ],
          },
        },
      ],
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'true');
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-region="item"]')).toHaveLength(3));
    await expect(canvasElement.querySelectorAll('[data-region="list"]')).toHaveLength(1);
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** O mesmo gesto por toque, num viewport de celular — tocar em vez de laçar. */
export const MobileTouch: Story = {
  args: { activity: makeSystemActivity('decompose_canvas', DECOMPOSE_CANVAS_SPEC) },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await group(canvasElement, ['new', 'add_btn'], 'add');
    await waitFor(() => expect(canvas.getByTestId('system-region-add')).toBeInTheDocument());
  },
};
