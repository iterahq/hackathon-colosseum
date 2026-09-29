import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, waitFor, within } from 'storybook/test';
import { TimelineActivity } from '@/components/branded/activity/TimelineActivity';
import { dragSlider } from './interactions';
import { makeGatedActivity, TIMELINE_SPEC } from './sceneMechanicsFixtures';
import { withActivityWidth } from './decorators';

/**
 * CENA `timeline` (2026-09-25, batch A) — scrub through every step. Ungraded
 * (reading family): the gate opens once every step has been visited at least
 * once. 🚧 do-not-merge — see the release-gate note in
 * `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof TimelineActivity> = {
  title: 'Organisms/Activities/8 · Cena/Timeline',
  id: 'activities-cena-timeline',
  component: TimelineActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof TimelineActivity>;

/** A.enabled / C.blank — no primeiro step. */
export const Default: Story = {
  args: { activity: makeGatedActivity('timeline', TIMELINE_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('timeline-index')).toHaveTextContent('1/3');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted — visitar cada step do scrubber abre o gate, uma vez. */
export const AllStepsVisited: Story = {
  args: { activity: makeGatedActivity('timeline', TIMELINE_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const scrubber = canvas.getByTestId('timeline-scrubber') as HTMLInputElement;
    dragSlider(scrubber, 1);
    dragSlider(scrubber, 2);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida direto. */
export const Done: Story = {
  args: { activity: makeGatedActivity('timeline', TIMELINE_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** A page frame shows its own `url_label` in the browser bar. */
export const PageFrames: Story = {
  args: {
    activity: makeGatedActivity('timeline', {
      ...TIMELINE_SPEC,
      steps: TIMELINE_SPEC.steps.slice(0, 2).map((step) => ({
        ...step,
        frame: {
          type: 'page',
          page: { url_label: 'duda.site', elements: [{ id: 'titulo', tag: 'h1', text: step.label, name: 'título' }] },
        },
      })),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('timeline-stage')).toHaveTextContent('duda.site');
  },
};

/** H.degenerado — one step has nothing to scrub: it counts as seen and the gate opens once. */
export const SingleStep: Story = {
  args: { activity: makeGatedActivity('timeline', { ...TIMELINE_SPEC, steps: TIMELINE_SPEC.steps.slice(0, 1) }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument());
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};
