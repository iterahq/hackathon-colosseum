import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TerminalSandboxActivity } from '@/components/branded/activity/TerminalSandboxActivity';
import { makeActivity } from './activityFixtures';
import { TERMINAL_BUILD_COMMAND_SPEC } from './behaviourFixtures';
import { withActivityWidth } from './decorators';

/**
 * BEHAVIOUR `terminal_build_command` — assemble ONE command from loose tokens,
 * then run it.
 *
 * Today it is `terminal_sandbox` with `inputMode: "options"` and every step
 * `expose.optionGranularity: "token"` (2 activities + 1 def in production).
 * Plan `20260924-activity-type-one-behavior-rule` (v3, ADR-1) makes it its own
 * kind. Fixture: production row `22646523` (see `behaviourFixtures.ts`).
 *
 * Unlike `terminal_pick_command`, a tap does NOT run: the tokens build a line
 * in the prompt bar, and the learner runs it. So this behaviour HAS a
 * "answered, not sent" state.
 */
const meta: Meta<typeof TerminalSandboxActivity> = {
  title: 'Organisms/Activities/8 · Sandbox de terminal/Montar comando',
  id: 'activities-terminal-build-command',
  component: TerminalSandboxActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof TerminalSandboxActivity>;

async function tapTokens(canvasElement: HTMLElement, tokens: string[]) {
  for (const token of tokens) {
    const chips = within(canvasElement).getAllByTestId('terminal-option-token');
    const target = chips.find((c) => c.getAttribute('data-option') === token);
    if (!target) throw new Error(`tray has no token "${token}"`);
    await userEvent.click(target);
  }
}

async function runLine(canvasElement: HTMLElement) {
  await userEvent.click(within(canvasElement).getByTestId('terminal-run'));
}

/** The token tray is up; the prompt bar is empty. */
export const Default: Story = {
  args: { activity: makeActivity('terminal_sandbox', TERMINAL_BUILD_COMMAND_SPEC) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByTestId('terminal-option-token')).toHaveLength(5);
  },
};

/** C.answered — the line `git add notas.md` is built and NOT run yet. */
export const LinhaMontada: Story = {
  args: { activity: makeActivity('terminal_sandbox', TERMINAL_BUILD_COMMAND_SPEC) },
  play: async ({ args, canvasElement }) => {
    await tapTokens(canvasElement, ['git', 'add', 'notas.md']);
    const canvas = within(canvasElement);
    await expect(canvas.getAllByTestId('terminal-option-token')).toHaveLength(2);
    await expect(canvas.queryByTestId('sandbox-reveal')).not.toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted + D.correct — build `git add notas.md` and run it: the step unlocks. */
export const LinhaCerta: Story = {
  args: { activity: makeActivity('terminal_sandbox', TERMINAL_BUILD_COMMAND_SPEC) },
  play: async ({ args, canvasElement }) => {
    await tapTokens(canvasElement, ['git', 'add', 'notas.md']);
    await runLine(canvasElement);
    await within(canvasElement).findByTestId('sandbox-reveal');
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — build `git add .` and run it: both files go in, the step stays locked. */
export const LinhaErrada: Story = {
  args: { activity: makeActivity('terminal_sandbox', TERMINAL_BUILD_COMMAND_SPEC) },
  play: async ({ args, canvasElement }) => {
    await tapTokens(canvasElement, ['git', 'add', '.']);
    await runLine(canvasElement);
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/adicionado ao stage: rascunho.md/)).toBeInTheDocument();
    await expect(canvas.queryByTestId('sandbox-reveal')).not.toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** B.done — concluded in an earlier session. */
export const Concluida: Story = {
  args: { activity: makeActivity('terminal_sandbox', TERMINAL_BUILD_COMMAND_SPEC, 'done') },
};

/** E.reveal — live reveal: recap + master line, nothing ran. */
export const RevealedInLive: Story = {
  args: { activity: makeActivity('terminal_sandbox', TERMINAL_BUILD_COMMAND_SPEC), reveal: true },
};
