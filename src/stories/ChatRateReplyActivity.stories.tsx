import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { CHAT_RATE_REPLY_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { rateSeededReply } from './interactions';

/**
 * KIND `chat_rate_reply` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). Rate the reply on screen good or bad; an answer key grades. There is no send: the author's fallback reply is seeded before the learner acts (T25).
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Chat/chat_rate_reply',
  id: 'activities-chat-rate-reply',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('chat_rate_reply', spec, status);

const SPEC = CHAT_RATE_REPLY_SPEC as Record<string, unknown>;

/** A.enabled + C.blank — the seeded reply is on screen and the rate panel is up; no composer. */
export const Default: Story = {
  args: { activity: activity() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByTestId('sandbox-eval', undefined, { timeout: 8000 });
    await expect(canvas.queryByTestId('sandbox-send')).not.toBeInTheDocument();
  },
};

/** C.submitted + D.correct — "weak" is right for this reply: the activity settles as a pass. */
export const AvaliadaCorretamente: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await rateSeededReply(canvasElement, 'ruim');
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — "strong" is wrong: critique + retry, no verdict. */
export const AvaliadaIncorretamente: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await rateSeededReply(canvasElement, 'top');
    await expect(within(canvasElement).getByTestId('sandbox-eval-wrong')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** B.done — concluded in an earlier session: settled, no controls. */
export const Concluida: Story = { args: { activity: activity(SPEC, 'done') } };

/** E.reveal — the live reveal: recap on screen, nothing sent. */
export const RevealedInLive: Story = { args: { activity: activity(), reveal: true } };

/** F.spec_invalido — A compose step belongs to the compose kinds (ADR-3). The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity({ ...SPEC, steps: [{ ...(SPEC.steps as Record<string, unknown>[])[0], mode: 'compose' }] }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('chat-rate-reply-invalid')).toBeInTheDocument();
  },
};
