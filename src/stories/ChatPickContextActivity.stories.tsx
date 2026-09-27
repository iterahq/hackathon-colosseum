import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { CHAT_PICK_CONTEXT_SPEC, CHAT_FILL_SELECT_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { composeSandboxPrompt, sendSandboxAndSettle } from './interactions';

/**
 * KIND `chat_pick_context` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). Pick ONE context chip, then send.
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Chat/chat_pick_context',
  id: 'activities-chat-pick-context',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('chat_pick_context', spec, status);

const SPEC = CHAT_PICK_CONTEXT_SPEC as Record<string, unknown>;

/** A.enabled + C.blank — the scenario opens; nothing composed yet. */
export const Default: Story = { args: { activity: activity() } };

/** C.answered — composed, NOT sent. */
export const Composto: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await composeSandboxPrompt(canvasElement, 'redação de escola');
    await expect(within(canvasElement).getByTestId('sandbox-send')).toBeEnabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted + D.correct — sent with the right input: the step completes and the activity settles as a pass. */
export const Enviado: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await composeSandboxPrompt(canvasElement, 'redação de escola');
    await sendSandboxAndSettle(canvasElement);
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — the distractor chip: a weak send, the critique shows, the step stays open, no verdict. */
export const EnvioFraco: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await composeSandboxPrompt(canvasElement, 'oi, tudo bem');
    await userEvent.click(within(canvasElement).getByTestId('sandbox-send'));
    await within(canvasElement).findByTestId('sandbox-compose-weak', undefined, { timeout: 8000 });
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** B.done — concluded in an earlier session: settled, no controls. */
export const Concluida: Story = { args: { activity: activity(SPEC, 'done') } };

/** E.reveal — the live reveal: recap on screen, nothing sent. */
export const RevealedInLive: Story = { args: { activity: activity(), reveal: true } };

/** F.spec_invalido — Slots belong to the `chat_fill_*` kinds. The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity({ ...SPEC, slots: CHAT_FILL_SELECT_SPEC.slots }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('chat-pick-context-invalid')).toBeInTheDocument();
  },
};
