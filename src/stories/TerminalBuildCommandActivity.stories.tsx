import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { TERMINAL_BUILD_COMMAND_SPEC, TERMINAL_PICK_COMMAND_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { buildTerminalLine } from './interactions';

/**
 * KIND `terminal_build_command` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). Assemble the command from TOKENS and run it. Fixture: production row `22646523`. The kind pins the token tray: a step with no `optionGranularity` still shows tokens.
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Terminal/terminal_build_command',
  id: 'activities-terminal-build-command',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('terminal_build_command', spec, status);

const SPEC = TERMINAL_BUILD_COMMAND_SPEC;

/** A.enabled + C.blank — the token tray is up; the prompt bar is empty. */
export const Default: Story = {
  args: { activity: activity() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByTestId('terminal-option-token')).toHaveLength(5);
  },
};

/** C.answered — `git add notas.md` assembled in the prompt, NOT run. */
export const LinhaMontada: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    for (const token of ['git', 'add', 'notas.md']) {
      const chip = within(canvasElement)
        .getAllByTestId('terminal-option-token')
        .find((c) => c.getAttribute('data-option') === token);
      if (!chip) throw new Error(`tray has no token "${token}"`);
      await userEvent.click(chip);
    }
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted + D.correct — build `git add notas.md` and run it: a pass. */
export const LinhaCerta: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await buildTerminalLine(canvasElement, ['git', 'add', 'notas.md']);
    await within(canvasElement).findByTestId('sandbox-reveal');
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — build `git add .` and run it: both files go in, the step stays locked. */
export const LinhaErrada: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await buildTerminalLine(canvasElement, ['git', 'add', '.']);
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/adicionado ao stage: rascunho.md/)).toBeInTheDocument();
    await expect(canvas.queryByTestId('sandbox-reveal')).not.toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** B.done — concluded in an earlier session. */
export const Concluida: Story = { args: { activity: activity(SPEC, 'done') } };

/** E.reveal — live reveal: recap + master line, nothing ran. */
export const RevealedInLive: Story = { args: { activity: activity(), reveal: true } };

/** F.spec_invalido — Whole-command steps belong to `terminal_pick_command`. The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity(TERMINAL_PICK_COMMAND_SPEC) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('terminal-build-command-invalid')).toBeInTheDocument();
  },
};
