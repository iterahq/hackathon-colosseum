import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within } from 'storybook/test';
import { MultiChoiceActivity } from '@/components/branded/activity/MultiChoiceActivity';
import { makeActivity } from './activityFixtures';
import { MULTI_CHOICE_SPEC as SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { pickMultiChoice, submitAnswer } from './interactions';

/**
 * CONTRATO `multi_choice` — escolha de UMA OU MAIS opções.
 *
 *   { instruction?, options: [{ id, label?, image_url?, audio_url? }], correct_option_ids[] }
 *
 * É contrato próprio (e não variação do single_choice) porque a autoria entrega
 * uma LISTA de corretas — e a correção só é verdadeira quando o CONJUNTO
 * marcado é igual ao conjunto esperado.
 *
 * As stories abaixo são variações de ESTADO do mesmo contrato, e desde a Fase 3
 * cada estado é produzido CLICANDO (ADR-4: as props `initialSelectedIds` /
 * `initialSubmitted` foram removidas da produção).
 */
const meta: Meta<typeof MultiChoiceActivity> = {
  title: 'Organisms/Activities/2 · Escolha/MultiChoice',
  id: 'activities-escolha-multi-choice',
  component: MultiChoiceActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof MultiChoiceActivity>;

/** O CONJUNTO exato de corretas do fixture (`correct_option_ids: a, b, d`). */
const RIGHT_SET = ['Normalizar para evitar', 'Usar chaves estrangeiras', 'Definir chaves primárias'];
/** Um conjunto ERRADO: falta uma correta e sobra a distratora. */
const WRONG_SET = ['Normalizar para evitar', 'Copiar dados entre todas'];

export const Default: Story = {
  args: { activity: makeActivity('multi_choice', SPEC) },
};

/** C.answered — parte do conjunto marcado, ainda sem enviar. */
export const Answered: Story = {
  args: { activity: makeActivity('multi_choice', SPEC) },
  play: async ({ canvasElement }) => {
    await pickMultiChoice(canvasElement, RIGHT_SET.slice(0, 2));
    const marked = within(canvasElement)
      .getAllByTestId('multi-choice-option')
      .filter((b) => b.getAttribute('data-selected') === 'true');
    await expect(marked).toHaveLength(2);
    await expect(within(canvasElement).getByTestId('multi-choice-submit')).not.toBeDisabled();
  },
};

/** C.submitted + D.correct — o CONJUNTO exato marcado e enviado. */
export const Correct: Story = {
  args: { activity: makeActivity('multi_choice', SPEC) },
  play: async ({ args, canvasElement }) => {
    await pickMultiChoice(canvasElement, RIGHT_SET);
    await submitAnswer(canvasElement, 'multi-choice-submit');
    await expect(within(canvasElement).getByTestId('multi-choice-submit')).toHaveAttribute('data-correct', 'true');
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — conjunto PARCIAL + uma distratora: erra mesmo acertando uma. */
export const Incorrect: Story = {
  args: { activity: makeActivity('multi_choice', SPEC) },
  play: async ({ args, canvasElement }) => {
    await pickMultiChoice(canvasElement, WRONG_SET);
    await submitAnswer(canvasElement, 'multi-choice-submit');
    await expect(within(canvasElement).getByTestId('multi-choice-submit')).toHaveAttribute('data-correct', 'false');
    await expect(args.onComplete).toHaveBeenCalledWith(false, expect.anything());
  },
};

/** B.done — o estado real de quem volta a uma activity já concluída. */
export const Disabled: Story = {
  args: { activity: makeActivity('multi_choice', SPEC, 'done') },
};
