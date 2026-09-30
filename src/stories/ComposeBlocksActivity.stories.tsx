import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ComposeBlocksActivity } from '@/components/branded/activity/ComposeBlocksActivity';
import { COMPOSE_BLOCKS_SPEC, makeSystemActivity } from './systemKindsFixtures';
import { withActivityWidth } from './decorators';

/**
 * CENA `compose_blocks` (2026-09-30, system kinds) — drag a block onto its
 * parent slot (or tap the block, then the slot); the preview grows with the
 * tree. Completes once the tree equals `target`. 🚧 do-not-merge — see the
 * release-gate note in `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof ComposeBlocksActivity> = {
  title: 'Organisms/Activities/8 · Cena/ComposeBlocks',
  id: 'activities-cena-compose-blocks',
  component: ComposeBlocksActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ComposeBlocksActivity>;

async function place(canvasElement: HTMLElement, block: string, slot: string) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByTestId(`compose-block-${block}`));
  await userEvent.click(canvas.getByTestId(`compose-slot-${slot}`));
}

/** A.enabled / C.blank — só a raiz na estrutura. */
export const Default: Story = {
  args: { activity: makeSystemActivity('compose_blocks', COMPOSE_BLOCKS_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-frame')).toHaveAttribute('data-solved', 'false');
    await expect(canvas.getByTestId('compose-slot-root')).toBeInTheDocument();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** D.incorrect → D.correct — um item direto na raiz volta com a dica; a árvore certa conclui. */
export const WrongThenRight: Story = {
  args: { activity: makeSystemActivity('compose_blocks', COMPOSE_BLOCKS_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await place(canvasElement, 'task_item', 'root');
    await expect(canvas.getByTestId('scene-wrong-hint')).toHaveTextContent(/./);
    await place(canvasElement, 'header', 'root');
    await place(canvasElement, 'add_form', 'root');
    await place(canvasElement, 'task_list', 'root');
    const list = canvas.getAllByTestId(/^compose-slot-n/).at(-1) as HTMLElement;
    const slot = list.dataset.testid?.replace('compose-slot-', '') ?? '';
    await place(canvasElement, 'task_item', slot);
    await place(canvasElement, 'task_item', slot);
    await waitFor(() => expect(args.onComplete).toHaveBeenCalledTimes(1));
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
  },
};

/** B.done — concluída numa sessão anterior: a árvore-alvo montada, com o carimbo. */
export const Done: Story = {
  args: { activity: makeSystemActivity('compose_blocks', COMPOSE_BLOCKS_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(canvas.getByTestId('compose-preview')).toHaveTextContent('Minhas tarefas');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};
