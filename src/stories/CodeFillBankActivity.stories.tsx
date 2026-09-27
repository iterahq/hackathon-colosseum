import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { CODE_FILL_BANK_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { fillGuidedBlanks, settleGuided } from './guidedInteractions';

/**
 * KIND `code_fill_bank` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). Drag or click a chip from the word bank into EVERY blank; the answer text grades.
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Code/code_fill_bank',
  id: 'activities-code-fill-bank',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('code_fill_bank', spec, status);

const SPEC = CODE_FILL_BANK_SPEC as Record<string, unknown>;

/** A.enabled + C.blank — the locked template, every blank empty. */
export const Default: Story = { args: { activity: activity() } };

/** C.answered — every blank filled, nothing sent yet. */
export const Preenchida: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await fillGuidedBlanks(canvasElement, { hook: 'useState', evento: 'onClick' });
    await expect(within(canvasElement).getByTestId('guided-submit')).toBeEnabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted + D.correct — the right answers: the verdict is a pass. */
export const Certa: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await fillGuidedBlanks(canvasElement, { hook: 'useState', evento: 'onClick' });
    await settleGuided(canvasElement);
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — one wrong blank: the verdict is a fail. */
export const Errada: Story = {
  args: { activity: activity() },
  play: async ({ args, canvasElement }) => {
    await fillGuidedBlanks(canvasElement, { hook: 'useEffect', evento: 'onClick' });
    await settleGuided(canvasElement);
    await expect(args.onComplete).toHaveBeenCalledWith(false, expect.anything());
  },
};

/** B.done — concluded in an earlier session: the template is read-only. */
export const Concluida: Story = { args: { activity: activity(SPEC, 'done') } };

/** E.reveal — the live reveal fills the authored answers; nothing is sent. */
export const RevealedInLive: Story = {
  args: { activity: activity(), reveal: true },
  play: async ({ args, canvasElement }) => {
    await expect(within(canvasElement).getByTestId('guided-code-revealed')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** F.spec_invalido — A dropdown blank belongs to `code_fill_select`. The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity({ ...SPEC, blanks: [{ id: 'hook', kind: 'select', answer: 'useState', options: ['useState', 'useEffect'] }] }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('code-fill-bank-invalid')).toBeInTheDocument();
  },
};
