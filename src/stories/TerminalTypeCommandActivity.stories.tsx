import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { TERMINAL_TYPE_COMMAND_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import terminalScenarios from '@/test/fixtures/terminal-scenarios.json';

/**
 * KIND `terminal_type_command` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). TYPE the command and press Enter; the shared matcher grades.
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Terminal/terminal_type_command',
  id: 'activities-terminal-type-command',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('terminal_type_command', spec, status);

const SPEC = TERMINAL_TYPE_COMMAND_SPEC as Record<string, unknown>;

/** A.enabled + C.blank — the prompt bar, no palette. */
export const Default: Story = {
  args: { activity: activity() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId('terminal-option-command')).not.toBeInTheDocument();
    await expect(canvas.queryByTestId('terminal-option-token')).not.toBeInTheDocument();
  },
};

/**
 * H.degenerado — no engine: a generic terminal (`t4`), every output authored in
 * the step. The legacy `sandboxKind` key is dropped, as the kind already says it.
 * The play asserts the kind ACCEPTS it — a degenerate spec, not an invalid one.
 */
export const SemMotor: Story = {
  args: {
    activity: activity(
      (() => {
        const { sandboxKind: _legacy, steps, ...rest } = (
          terminalScenarios as Record<string, Record<string, unknown>>
        ).t4;
        // A typed-command step exposes no palette, so the empty `expose` goes too.
        const typed = (steps as Record<string, unknown>[]).map(({ expose: _palette, ...step }) => step);
        return { ...rest, steps: typed };
      })(),
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByTestId('terminal-type-command-invalid')).not.toBeInTheDocument();
  },
};

/** B.done — concluded in an earlier session. */
export const Concluida: Story = { args: { activity: activity(SPEC, 'done') } };

/** E.reveal — the live reveal: recap + master line, nothing ran. */
export const RevealedInLive: Story = { args: { activity: activity(), reveal: true } };

/** F.spec_invalido — A palette belongs to `terminal_pick_command` / `terminal_build_command`. The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity({ ...SPEC, inputMode: 'options' }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('terminal-type-command-invalid')).toBeInTheDocument();
  },
};
