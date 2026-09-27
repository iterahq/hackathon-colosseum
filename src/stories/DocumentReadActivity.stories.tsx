import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { DOCUMENT_READING_SPEC, DOCUMENT_REFLECT_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * KIND `document_read` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). Read a prompt and a body; nothing to do — the shell advances.
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Document/document_read',
  id: 'activities-document-read',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('document_read', spec, status);

const SPEC = DOCUMENT_READING_SPEC as Record<string, unknown>;

/** A.enabled — the card: prompt + body, no input, no button. */
export const Leitura: Story = {
  args: { activity: activity() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('document-prompt')).toBeInTheDocument();
    await expect(canvas.queryByTestId('document-reflection-input')).not.toBeInTheDocument();
    await expect(canvas.queryByTestId('activity-done')).not.toBeInTheDocument();
  },
};

/** H.degenerado — no body: the prompt alone. */
export const SemCorpo: Story = { args: { activity: activity({ prompt: DOCUMENT_READING_SPEC.prompt }) } };

/** F.spec_invalido — An evaluation belongs to `document_reflect` / `document_ai_judge`. The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity(DOCUMENT_REFLECT_SPEC as Record<string, unknown>) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('document-read-invalid')).toBeInTheDocument();
  },
};
