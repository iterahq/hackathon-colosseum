import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { QUESTION_WRITE_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { writeQuestionNote } from './interactions';

/**
 * KIND `question_write` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). TYPE a free answer — the old in-place "Outro" became this kind. No options; no correct answer.
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Question/question_write',
  id: 'activities-question-write',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('question_write', spec, status);

const SPEC = QUESTION_WRITE_SPEC as Record<string, unknown>;

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
    await writeQuestionNote(canvasElement, 'Eu testaria o contrato de persistência primeiro.');
    await expect(within(canvasElement).getByTestId('question-submit')).toBeEnabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted — sent. `true` is "completed", never "correct": the kind has no right answer. */
export const Enviada: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await writeQuestionNote(canvasElement, 'Eu testaria o contrato de persistência primeiro.');
    await userEvent.click(within(canvasElement).getByTestId('question-submit'));
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** B.done — answered in an earlier session: locked. */
export const Concluida: Story = { args: { activity: activity(SPEC, 'done') } };

/** F.spec_invalido — Options belong to the pick kinds. The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity({ ...SPEC, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('question-write-invalid')).toBeInTheDocument();
  },
};
