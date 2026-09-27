import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { QUESTION_PICK_ONE_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { markQuestionOptions } from './interactions';

/**
 * KIND `question_pick_one` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). Pick ONE option. No "Outro", no notes box (ADR-9); no correct answer.
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Question/question_pick_one',
  id: 'activities-question-pick-one',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('question_pick_one', spec, status);

const SPEC = QUESTION_PICK_ONE_SPEC as Record<string, unknown>;

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
    await markQuestionOptions(canvasElement, ['Manter o adaptador']);
    await expect(within(canvasElement).getByTestId('question-submit')).toBeEnabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted — sent. `true` is "completed", never "correct": the kind has no right answer. */
export const Enviada: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await markQuestionOptions(canvasElement, ['Manter o adaptador']);
    await userEvent.click(within(canvasElement).getByTestId('question-submit'));
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** B.done — answered in an earlier session: locked. */
export const Concluida: Story = { args: { activity: activity(SPEC, 'done') } };

/** F.spec_invalido — The in-place "Outro" is gone from the pick kinds (ADR-3, ADR-9). The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity({ ...SPEC, allow_other: true }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('question-pick-one-invalid')).toBeInTheDocument();
  },
};
