import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { CODE_FILL_TYPE_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { fillGuidedBlanks, settleGuided } from './guidedInteractions';

/**
 * KIND `code_fill_type` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). Type EVERY blank; the answer text grades.
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Code/code_fill_type',
  id: 'activities-code-fill-type',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('code_fill_type', spec, status);

const SPEC = CODE_FILL_TYPE_SPEC as Record<string, unknown>;

/** A.enabled + C.blank — the locked template, every blank empty. */
export const Default: Story = { args: { activity: activity() } };

/** C.answered — every blank filled, nothing sent yet. */
export const Preenchida: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await fillGuidedBlanks(canvasElement, { setter: 'setCurtidas', inicial: '0' });
    await expect(within(canvasElement).getByTestId('guided-submit')).toBeEnabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted + D.correct — the right answers: the verdict is a pass. */
export const Certa: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await fillGuidedBlanks(canvasElement, { setter: 'setCurtidas', inicial: '0' });
    await settleGuided(canvasElement);
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — one wrong blank: the verdict is a fail. */
export const Errada: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await fillGuidedBlanks(canvasElement, { setter: 'setLikes', inicial: '0' });
    await settleGuided(canvasElement);
    await expect(args.onComplete).toHaveBeenCalledWith(false, expect.anything());
  },
};

/** B.done — concluded in an earlier session: the template is read-only. */
export const Concluida: Story = { args: { activity: activity(SPEC, 'done') } };

/** E.reveal — the live reveal fills the authored answers; nothing is sent. */
export const RevealedInLive: Story = {
  args: { activity: activity(), reveal: true },
  play: async ({ args, canvasElement }) => {
    await expect(within(canvasElement).getByTestId('guided-code-revealed')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** F.spec_invalido — A bank blank belongs to `code_fill_bank`. The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity({ ...SPEC, blanks: [{ id: 'setter', kind: 'bank', answer: 'setCurtidas' }] }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('code-fill-type-invalid')).toBeInTheDocument();
  },
};
