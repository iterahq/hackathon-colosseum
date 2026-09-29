import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { BucketActivity } from '@/components/branded/activity/BucketActivity';
import { makeGatedActivity } from './sceneMechanicsFixtures';
import { BUCKET_SPEC } from './sceneMechanicsFixturesB';
import { withActivityWidth } from './decorators';

/**
 * CENA `bucket` (2026-09-25, batch B) — pick a chip, tap the bucket it
 * belongs to. A wrong bucket bounces the chip back with its own `hint`; the
 * beat completes once every chip is placed. 🚧 do-not-merge — see the
 * release-gate note in `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof BucketActivity> = {
  title: 'Organisms/Activities/8 · Cena/Bucket',
  id: 'activities-cena-bucket',
  component: BucketActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof BucketActivity>;

/** A.enabled / C.blank — todos os chips ainda na bandeja. */
export const Default: Story = {
  args: { activity: makeGatedActivity('bucket', BUCKET_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'false');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** D.incorrect → D.correct — balde errado mostra a dica do chip; o certo o encaixa. */
export const WrongThenRight: Story = {
  args: { activity: makeGatedActivity('bucket', BUCKET_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('bucket-chip-px'));
    await userEvent.click(canvas.getByTestId('bucket-drop-relativa'));
    await expect(canvas.getByTestId('scene-wrong-hint')).toHaveTextContent(/./);
    await userEvent.click(canvas.getByTestId('bucket-chip-px'));
    await userEvent.click(canvas.getByTestId('bucket-drop-absoluta'));
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida direto. */
export const Done: Story = {
  args: { activity: makeGatedActivity('bucket', BUCKET_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** Mesmo gesto de pick-then-tap, num viewport de celular. */
export const MobileTouch: Story = {
  args: { activity: makeGatedActivity('bucket', BUCKET_SPEC) },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('bucket-chip-px'));
    await userEvent.click(canvas.getByTestId('bucket-drop-absoluta'));
    await waitFor(() => expect(canvas.queryByTestId('bucket-chip-px')).not.toBeInTheDocument());
  },
};
