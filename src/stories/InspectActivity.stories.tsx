import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { InspectActivity } from '@/components/branded/activity/InspectActivity';
import { makeActivity } from './activityFixtures';
import { INSPECT_SPEC, SCENE_DUDA_PAGE } from './contractFixtures';
import { discoverAllTwins } from './interactions';
import { withActivityWidth } from './decorators';

/**
 * CENA `inspect` (2026-09-24) — a página de um lado, o código do outro.
 * Apontar qualquer lado acende o gêmeo e um fio liga os dois; cada primeira
 * descoberta vira uma ficha `<tag> = nome`. Achar todas abre o gate.
 */
const meta: Meta<typeof InspectActivity> = {
  title: 'Organisms/Activities/8 · Cena/Inspect',
  id: 'activities-cena-inspect',
  component: InspectActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof InspectActivity>;

/** A.enabled / C.blank — quatro fichas `? ? ?`, nada descoberto. */
export const Default: Story = {
  args: { activity: makeActivity('inspect', INSPECT_SPEC) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('inspect-chips')).toHaveAttribute('data-found', '0');
  },
};

/** C.answered — duas peças achadas: as fichas enchem, o gate continua fechado. */
export const Partial: Story = {
  args: { activity: makeActivity('inspect', INSPECT_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const targets = canvas.getAllByTestId('inspect-page-target');
    await userEvent.hover(targets[0]);
    await userEvent.hover(targets[3]);
    await expect(canvas.getByTestId('inspect-chips')).toHaveAttribute('data-found', '2');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted — todas achadas: o gate abre UMA vez e o carimbo cai. */
export const AllFound: Story = {
  args: { activity: makeActivity('inspect', INSPECT_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await discoverAllTwins(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** C.answered — só teclado: Tab chega na peça, Enter e Espaço a descobrem, o gate abre UMA vez. */
export const KeyboardOnly: Story = {
  args: { activity: makeActivity('inspect', INSPECT_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const targets = canvas.getAllByTestId('inspect-page-target');
    for (const [index, target] of targets.entries()) {
      await userEvent.tab();
      await expect(target).toHaveFocus();
      await userEvent.keyboard(index % 2 === 0 ? '{Enter}' : ' ');
    }
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída antes: todas as fichas cheias, sem novo `onComplete`. */
export const Done: Story = {
  args: { activity: makeActivity('inspect', INSPECT_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).getByTestId('inspect-chips')).toHaveAttribute('data-found', '4');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** H.degenerado — o mínimo legal: DUAS peças. Um par só não seria descoberta. */
export const TwoElements: Story = {
  args: {
    activity: makeActivity('inspect', { ...INSPECT_SPEC, page: { elements: SCENE_DUDA_PAGE.elements.slice(0, 2) } }),
  },
};
