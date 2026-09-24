import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TerminalSandboxActivity } from '@/components/branded/activity/TerminalSandboxActivity';
import { makeActivity } from './activityFixtures';
import { TERMINAL_PICK_COMMAND_SPEC } from './behaviourFixtures';
import { withActivityWidth } from './decorators';

/**
 * BEHAVIOUR `terminal_pick_command` — tap a WHOLE command from a palette.
 *
 * Today it is `terminal_sandbox` with `inputMode: "options"` and every step
 * `expose.optionGranularity: "command"` (3 activities + 1 def in production).
 * Plan `20260924-activity-type-one-behavior-rule` (v3, ADR-1) makes it its own
 * kind. This file shows ONLY that behaviour, so its matrix row stops pointing
 * at the free-text terminal.
 *
 * Fixture: production row `f353da62` (see `behaviourFixtures.ts`).
 *
 * A tap RUNS the command — there is no draft between "pick" and "send". A
 * wrong command runs too: the engine prints its output and the step does not
 * unlock.
 */
const meta: Meta<typeof TerminalSandboxActivity> = {
  title: 'Organisms/Activities/8 · Sandbox de terminal/Escolher comando',
  id: 'activities-terminal-pick-command',
  component: TerminalSandboxActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof TerminalSandboxActivity>;

async function tapCommand(canvasElement: HTMLElement, command: string) {
  const buttons = within(canvasElement).getAllByTestId('terminal-option-command');
  const target = buttons.find((b) => b.getAttribute('data-option') === command);
  if (!target) throw new Error(`palette has no command "${command}"`);
  await userEvent.click(target);
}

/** The palette is up; nothing ran yet. */
export const Default: Story = {
  args: { activity: makeActivity('terminal_sandbox', TERMINAL_PICK_COMMAND_SPEC) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByTestId('terminal-option-command')).toHaveLength(3);
  },
};

/** D.correct — tap `git status`: the step unlocks and the activity settles as a pass. */
export const ComandoCerto: Story = {
  args: { activity: makeActivity('terminal_sandbox', TERMINAL_PICK_COMMAND_SPEC) },
  play: async ({ args, canvasElement }) => {
    await tapCommand(canvasElement, 'git status');
    const canvas = within(canvasElement);
    await canvas.findByTestId('sandbox-reveal');
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — tap `git log`: it RUNS, prints its output, and the step stays locked. */
export const ComandoErrado: Story = {
  args: { activity: makeActivity('terminal_sandbox', TERMINAL_PICK_COMMAND_SPEC) },
  play: async ({ args, canvasElement }) => {
    await tapCommand(canvasElement, 'git log');
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/primeiro commit/)).toBeInTheDocument();
    await expect(canvas.queryByTestId('sandbox-reveal')).not.toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** B.done — concluded in an earlier session: settled, palette gone. */
export const Concluida: Story = {
  args: { activity: makeActivity('terminal_sandbox', TERMINAL_PICK_COMMAND_SPEC, 'done') },
};

/** E.reveal — live reveal: recap + master line, nothing ran. */
export const RevealedInLive: Story = {
  args: { activity: makeActivity('terminal_sandbox', TERMINAL_PICK_COMMAND_SPEC), reveal: true },
};
