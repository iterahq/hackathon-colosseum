import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { DOCUMENT_REFLECT_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { markDone, writeReflection } from './interactions';

/**
 * KIND `document_reflect` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). Write a reflection; a word count (`evaluation.minWords`, or `rubric.min_words` during the transition) gates the submit.
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Document/document_reflect',
  id: 'activities-document-reflect',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('document_reflect', spec, status);

const SPEC = DOCUMENT_REFLECT_SPEC as Record<string, unknown>;

const LONG =
  'A chave primaria e a coluna que identifica cada linha de forma unica dentro de uma tabela. ' +
  'No caso da escola o numero de matricula funciona bem porque nunca se repete entre dois alunos ' +
  'diferentes e nunca fica vazio para ninguem.';

/** A.enabled + C.blank — the textarea, the counter, the floor, a disabled submit. */
export const Default: Story = {
  args: { activity: activity() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('document-min-words')).toHaveTextContent('30');
    await expect(canvas.getByTestId('activity-done')).toBeDisabled();
  },
};

/** C.answered — a draft below the floor: the submit stays disabled. */
export const RascunhoCurto: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await writeReflection(canvasElement, 'Curto demais.');
    await expect(within(canvasElement).getByTestId('activity-done')).toBeDisabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted — over the floor and sent: the activity completes with the text as its artifact. */
export const Enviada: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await writeReflection(canvasElement, LONG);
    await markDone(canvasElement);
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** B.done — concluded in an earlier session. */
export const Concluida: Story = { args: { activity: activity(SPEC, 'done') } };

/** H.degenerado — `minWords` absent: any non-empty text may be sent. */
export const SemMinimo: Story = { args: { activity: activity({ prompt: DOCUMENT_REFLECT_SPEC.prompt }) } };

/** F.spec_invalido — An AI judge belongs to `document_ai_judge`. The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity({ ...SPEC, evaluation: { mode: 'ai-judge', criteria: [{ criterion: 'x' }] } }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('document-reflect-invalid')).toBeInTheDocument();
  },
};
