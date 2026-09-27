import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { CHAT_FILL_TYPE_SPEC, CHAT_FILL_SELECT_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { fillSandboxSlot, sendSandboxAndSettle } from './interactions';

/**
 * KIND `chat_fill_type` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). TYPE every slot, then send.
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Chat/chat_fill_type',
  id: 'activities-chat-fill-type',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('chat_fill_type', spec, status);

const SPEC = CHAT_FILL_TYPE_SPEC as Record<string, unknown>;

/** A.enabled + C.blank — the scenario opens; nothing composed yet. */
export const Default: Story = { args: { activity: activity() } };

/** C.answered — composed, NOT sent. */
export const Composto: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await fillSandboxSlot(canvasElement, { placeholder: 'ex.: meu irmão pequeno', text: 'meu irmão de 8 anos' });
    await expect(within(canvasElement).getByTestId('sandbox-send')).toBeEnabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted + D.correct — sent with the right input: the step completes and the activity settles as a pass. */
export const Enviado: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await fillSandboxSlot(canvasElement, { placeholder: 'ex.: meu irmão pequeno', text: 'meu irmão de 8 anos' });
    await sendSandboxAndSettle(canvasElement);
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** B.done — concluded in an earlier session: settled, no controls. */
export const Concluida: Story = { args: { activity: activity(SPEC, 'done') } };

/** E.reveal — the live reveal: recap on screen, nothing sent. */
export const RevealedInLive: Story = { args: { activity: activity(), reveal: true } };

/** F.spec_invalido — A list slot belongs to `chat_fill_select`. The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity({ ...SPEC, slots: CHAT_FILL_SELECT_SPEC.slots }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('chat-fill-type-invalid')).toBeInTheDocument();
  },
};
