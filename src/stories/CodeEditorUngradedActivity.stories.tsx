import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { CODE_EDITOR_UNGRADED_SPEC, CODE_EDITOR_CHECKS_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * KIND `code_editor_ungraded` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). Type in the open editor; no judge — the learner clicks "Concluir".
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Code/code_editor_ungraded',
  id: 'activities-code-editor-ungraded',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('code_editor_ungraded', spec, status);

const SPEC = CODE_EDITOR_UNGRADED_SPEC as Record<string, unknown>;

/** A.enabled + C.blank — the open editor on the starter, and the live preview. */
export const Default: Story = {
  args: { activity: activity() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryAllByTestId(/^guided-blank-/)).toHaveLength(0);
  },
};

/** H.degenerado — no `starter`: the editor opens empty. */
export const SemStarter: Story = {
  args: {
    activity: activity({
      prompt: 'Comece do zero: crie um componente que mostre o seu nome na tela.',
      language: 'tsx',
    }),
  },
};

/** B.done — concluded in an earlier session. */
export const Concluida: Story = { args: { activity: activity(SPEC, 'done') } };

/** C.submitted — no judge: "Concluir" completes the activity. */
export const MarcadaConcluida: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByTestId('activity-done'));
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** F.spec_invalido — DOM checks belong to `code_editor_checks`. The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity(CODE_EDITOR_CHECKS_SPEC as Record<string, unknown>) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('code-editor-ungraded-invalid')).toBeInTheDocument();
  },
};
