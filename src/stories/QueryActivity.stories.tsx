import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { QueryActivity } from '@/components/branded/activity/QueryActivity';
import { makeGatedActivity } from './sceneMechanicsFixtures';
import { QUERY_SPEC } from './sceneMechanicsFixturesB';
import { withActivityWidth } from './decorators';

/**
 * CENA `query` (2026-09-25, batch B) — toggle SQL clause chips; the table
 * obeys live. Ungraded: no wrong toggle, only a result that has not reached
 * `goal` yet. Settles once the live result matches `goal` exactly. 🚧
 * do-not-merge — see the release-gate note in `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof QueryActivity> = {
  title: 'Organisms/Activities/8 · Cena/Query',
  id: 'activities-cena-query',
  component: QueryActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof QueryActivity>;

/** A.enabled / C.blank — nenhuma cláusula ligada, tabela cheia. */
export const Default: Story = {
  args: { activity: makeGatedActivity('query', QUERY_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('query-goal-state')).toHaveAttribute('data-reached', 'false');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** C.submitted — ligar `estoque = 0` já alcança o `goal` (linha 2) e assenta. */
export const GoalReached: Story = {
  args: { activity: makeGatedActivity('query', QUERY_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('query-clause-estoque-zero'));
    await expect(canvas.getByTestId('query-goal-state')).toHaveAttribute('data-reached', 'true');
    await waitFor(() => expect(args.onComplete).toHaveBeenCalledTimes(1), { timeout: 2000 });
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida direto. */
export const Done: Story = {
  args: { activity: makeGatedActivity('query', QUERY_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'true');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** Mesmo toque nos chips de cláusula, num viewport de celular. */
export const MobileTouch: Story = {
  args: { activity: makeGatedActivity('query', QUERY_SPEC) },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('query-clause-estoque-zero'));
    await expect(canvas.getByTestId('query-row-2')).toBeInTheDocument();
  },
};
