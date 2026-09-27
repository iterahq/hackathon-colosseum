import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { QUESTION_PICK_MANY_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { markQuestionOptions } from './interactions';

/**
 * KIND `question_pick_many` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). Pick ANY number of options. No "Outro", no notes box (ADR-9); no correct answer.
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Question/question_pick_many',
  id: 'activities-question-pick-many',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('question_pick_many', spec, status);

const SPEC = QUESTION_PICK_MANY_SPEC as Record<string, unknown>;

/** A.enabled + C.blank — nothing marked; the submit waits for an answer. */
export const Default: Story = {
  args: { activity: activity() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId('question-other')).not.toBeInTheDocument();
    await expect(canvas.getByTestId('question-submit')).toBeDisabled();
  },
};

/** C.answered — answered, NOT sent. */
export const Respondida: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await markQuestionOptions(canvasElement, ['Inbox global', 'Dashboard']);
    await expect(within(canvasElement).getByTestId('question-submit')).toBeEnabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted — sent. `true` is "completed", never "correct": the kind has no right answer. */
export const Enviada: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await markQuestionOptions(canvasElement, ['Inbox global', 'Dashboard']);
    await userEvent.click(within(canvasElement).getByTestId('question-submit'));
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** B.done — answered in an earlier session: locked. */
export const Concluida: Story = { args: { activity: activity(SPEC, 'done') } };

/** F.spec_invalido — The kind says "many"; a `mode` field is refused. The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity({ ...SPEC, mode: 'multi' }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('question-pick-many-invalid')).toBeInTheDocument();
  },
};
