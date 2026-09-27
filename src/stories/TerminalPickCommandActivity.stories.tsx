import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { TERMINAL_PICK_COMMAND_SPEC, TERMINAL_BUILD_COMMAND_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { tapTerminalCommand } from './interactions';

/**
 * KIND `terminal_pick_command` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). Tap a WHOLE command from the palette; one tap runs it. Fixture: production row `f353da62`.
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Terminal/terminal_pick_command',
  id: 'activities-terminal-pick-command',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('terminal_pick_command', spec, status);

const SPEC = TERMINAL_PICK_COMMAND_SPEC;

/** A.enabled + C.blank — the palette is up; nothing ran yet. */
export const Default: Story = {
  args: { activity: activity() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByTestId('terminal-option-command')).toHaveLength(3);
  },
};

/** C.submitted + D.correct — tap `git status`: the step unlocks and the activity settles as a pass. */
export const ComandoCerto: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await tapTerminalCommand(canvasElement, 'git status');
    await within(canvasElement).findByTestId('sandbox-reveal');
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — tap `git log`: it RUNS, prints its output, and the step stays locked. */
export const ComandoErrado: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await tapTerminalCommand(canvasElement, 'git log');
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/primeiro commit/)).toBeInTheDocument();
    await expect(canvas.queryByTestId('sandbox-reveal')).not.toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** B.done — concluded in an earlier session: settled, palette gone. */
export const Concluida: Story = { args: { activity: activity(SPEC, 'done') } };

/** E.reveal — live reveal: recap + master line, nothing ran. */
export const RevealedInLive: Story = { args: { activity: activity(), reveal: true } };

/** F.spec_invalido — Token steps belong to `terminal_build_command`. The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity(TERMINAL_BUILD_COMMAND_SPEC) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('terminal-pick-command-invalid')).toBeInTheDocument();
  },
};
