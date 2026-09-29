import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within, type Mock } from 'storybook/test';
import { XrayActivity } from '@/components/branded/activity/XrayActivity';
import { makeActivity } from './activityFixtures';
import { SCENE_DUDA_PAGE, XRAY_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * CENA `xray` (2026-09-24) — a página por cima do próprio código; o ponteiro é
 * uma lente. Varrer `coverage_goal` (30%) do palco abre o gate.
 *
 *   { guide?, prompt, reaction, stamp, page{ url_label?, elements[] }, coverage_goal? }
 *
 * Silenciosa por decisão do Tainan ("o som não pode roubar a cena"). O gate
 * mede ÁREA com `getBoundingClientRect`, então a varredura só roda num
 * navegador de verdade — daí a tag `browser-mode` na story que varre.
 */
const meta: Meta<typeof XrayActivity> = {
  title: 'Organisms/Activities/8 · Cena/Xray',
  id: 'activities-cena-xray',
  component: XrayActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof XrayActivity>;

/** A.enabled / C.blank — a página inteira, a dica da lente, 0% escaneado. */
export const Default: Story = {
  args: { activity: makeActivity('xray', XRAY_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'false');
    await expect(canvas.queryByTestId('scene-stamp')).toBeNull();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted — a lente varre o palco em linhas; o gate abre UMA vez e o carimbo cai. */
export const Swept: Story = {
  tags: ['browser-mode'],
  args: { activity: makeActivity('xray', XRAY_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const stage = canvas.getByTestId('xray-stage');
    const box = stage.getBoundingClientRect();
    for (let row = 0; row < 5; row++) {
      for (let i = 0; i <= 20; i++) {
        const init = { clientX: box.left + (i / 20) * box.width, clientY: box.top + ((row + 0.5) / 5) * box.height, bubbles: true };
        stage.dispatchEvent(new PointerEvent('pointermove', init));
      }
    }
    await waitFor(() => expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument());
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
    const [, detail] = (args.onComplete as Mock).mock.calls[0];
    await expect(Array.isArray(detail.actions)).toBe(true);
  },
};

/** C.submitted — só teclado: as setas levam a lente pelo palco até o gate abrir UMA vez. */
export const SweptWithKeyboard: Story = {
  tags: ['browser-mode'],
  args: { activity: makeActivity('xray', XRAY_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await expect(canvas.getByTestId('xray-stage')).toHaveFocus();
    const sweep = ['{ArrowRight}', '{ArrowDown}', '{ArrowLeft}', '{ArrowDown}'];
    for (let i = 0; i < 120 && (args.onComplete as Mock).mock.calls.length === 0; i++) {
      await userEvent.keyboard(sweep[Math.floor(i / 6) % sweep.length]);
    }
    await waitFor(() => expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument());
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída numa sessão anterior: já abre resolvida, sem refazer o gesto. */
export const Done: Story = {
  args: { activity: makeActivity('xray', XRAY_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** H.degenerado — uma página de UM elemento: a mesma cena, uma linha só. */
export const SingleElement: Story = {
  args: {
    activity: makeActivity('xray', { ...XRAY_SPEC, page: { elements: [SCENE_DUDA_PAGE.elements[0]] } }),
  },
};
