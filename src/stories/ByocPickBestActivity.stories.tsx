import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { ByocTree } from '@/components/branded/activity/byoc/ByocTree';
import { makeActivity, noop } from './activityFixtures';
import { ByocFlow } from './ByocFlow';
import { BYOC_PICK_BEST, BYOC_JUDGE_EACH_SPEC, BYOC_PICK_BEST_SPEC } from './byocFixtures';
import { BYOC_PICK_BEST_KIND_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * KIND `byoc_pick_best` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour, ADR-4, T13). The learner gives their own context, then
 * they pick the best generated option; the embedded answer key grades.
 *
 * `spec.byoc` was a LAYER over any host kind, and its `harness.interaction`
 * picked one of three behaviours. This kind accepts ONE interaction. With no
 * itera-api it shows an explicit "unavailable" state, never the host card.
 *
 * The generation is mocked (`ByocFlow`); the kind-level states go through the
 * real dispatcher. The stories here are STATES of this one behaviour.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/BYOC/byoc_pick_best',
  id: 'activities-byoc-pick-best',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: noop },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = BYOC_PICK_BEST_KIND_SPEC) => makeActivity('byoc_pick_best', spec);

/** A.enabled + C.blank → the whole two-step flow: the seed form, then the generated tree. */
export const Default: Story = {
  render: () => <ByocFlow activity={activity()} spec={BYOC_PICK_BEST_SPEC} tree={BYOC_PICK_BEST} />,
};

/** C.submitted — a learner who generated before: straight to their own tree. */
export const Retornando: Story = {
  render: () => <ByocFlow activity={activity()} spec={BYOC_PICK_BEST_SPEC} tree={BYOC_PICK_BEST} returning />,
};

/** B.done — concluded in an earlier session: locked, not redoable. */
export const Concluida: Story = {
  render: () => <ByocTree tree={BYOC_PICK_BEST} onComplete={noop} done />,
};

/** E.reveal — the live reveal shows the answer key; nothing is sent. */
export const RevealedInLive: Story = {
  render: () => <ByocTree tree={BYOC_PICK_BEST} onComplete={noop} reveal />,
};

/** H.degenerado — no itera-api: the explicit "unavailable" state, never the host `concept` card. */
export const SemItera: Story = {
  args: { activity: activity() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('byoc-unavailable')).toBeInTheDocument();
  },
};

/** F.spec_invalido — a harness of ANOTHER interaction: the card, never the other interaction. */
export const EspecInvalida: Story = {
  args: { activity: activity({ ...BYOC_PICK_BEST_KIND_SPEC, byoc: BYOC_JUDGE_EACH_SPEC }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('byoc-pick-best-invalid')).toBeInTheDocument();
  },
};
