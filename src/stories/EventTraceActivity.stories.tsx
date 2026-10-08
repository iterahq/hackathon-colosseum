import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { EventTraceActivity } from '@/components/branded/activity/EventTraceActivity';
import { EVENT_TRACE_SPEC, makeSystemActivity } from './systemKindsFixtures';
import { withActivityWidth } from './decorators';

/**
 * CENA `event_trace` (2026-09-30, system kinds) — fire the event on the
 * interface, then one tap per step: event → action → state → render. No
 * prediction inside (that is its own activity). 🚧 do-not-merge — see the
 * release-gate note in `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof EventTraceActivity> = {
  title: 'Organisms/Activities/8 · Cena/EventTrace',
  id: 'activities-cena-event-trace',
  component: EventTraceActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof EventTraceActivity>;

/** A.enabled / C.blank — o gatilho pulsa, nenhum passo revelado. */
export const Default: Story = {
  args: { activity: makeSystemActivity('event_trace', EVENT_TRACE_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('event-trace-step-event')).toHaveAttribute('data-state', 'hidden');
    await expect(canvas.queryByTestId('event-trace-next')).toBeNull();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** Gesto completo — disparar e avançar passo a passo até o render. */
export const TraceAllSteps: Story = {
  args: { activity: makeSystemActivity('event_trace', EVENT_TRACE_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('system-node-item#0'));
    await expect(canvas.getByTestId('event-trace-step-event')).toHaveAttribute('data-state', 'current');
    await userEvent.click(canvas.getByTestId('event-trace-next'));
    await userEvent.click(canvas.getByTestId('event-trace-next'));
    await expect(canvas.getByTestId('event-trace-panel-state')).toHaveTextContent('true');
    await expect(args.onComplete).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByTestId('event-trace-next'));
    await waitFor(() => expect(args.onComplete).toHaveBeenCalledTimes(1));
  },
};

/** B.done — concluída antes: todos os passos visíveis, estado final, carimbo. */
export const Done: Story = {
  args: { activity: makeSystemActivity('event_trace', EVENT_TRACE_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'true');
    await expect(canvas.getByTestId('event-trace-step-render')).toHaveAttribute('data-state', 'current');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};
