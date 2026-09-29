import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within } from 'storybook/test';
import { SingleChoiceActivity } from '@/components/branded/activity/SingleChoiceActivity';
import { makeActivity } from './activityFixtures';
import { SINGLE_CHOICE_IMAGE_SPEC, SINGLE_CHOICE_SPEC as SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { pickSingleChoice, submitAnswer } from './interactions';

/**
 * CONTRATO `single_choice` — escolha de EXATAMENTE uma opção.
 *
 *   { instruction?, options: [{ id, label?, image_url?, audio_url? }], correct_option_id }
 *
 * Contrato tipado no `@iterahq/activity-spec`: os ids das opções são únicos e
 * `correct_option_id` precisa referenciar um deles.
 *
 * As stories abaixo são VARIAÇÕES do mesmo contrato — estados (em branco /
 * respondida / correta / incorreta / concluída) e opções com imagem em vez de
 * só texto. Nenhuma delas é uma activity diferente.
 *
 * ── FASE 3 (ADR-2 / ADR-4) ─────────────────────────────────────────────────
 * `Answered`, `Correct` e `Incorrect` deixaram de ser injetadas por prop: elas
 * CLICAM. As props `initialSelectedId`/`initialSubmitted` foram REMOVIDAS da
 * produção nesta fase, e o mesmo `play` que produz o estado no canvas do
 * Storybook é o que o Vitest roda no CI (`src/test/storyPlay.test.tsx`).
 */
const meta: Meta<typeof SingleChoiceActivity> = {
  title: 'Organisms/Activities/2 · Escolha/SingleChoice',
  id: 'activities-escolha-single-choice',
  component: SingleChoiceActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof SingleChoiceActivity>;

/** A opção CORRETA e uma ERRADA deste fixture, por RÓTULO (a ordem é embaralhada). */
const RIGHT = 'chave estrangeira';
const WRONG = 'Copiar as colunas';

export const Default: Story = {
  args: { activity: makeActivity('single_choice', SPEC) },
};

/** C.answered — opção marcada, ainda NÃO enviada: o "Enviar" destrava. */
export const Answered: Story = {
  args: { activity: makeActivity('single_choice', SPEC) },
  play: async ({ canvasElement }) => {
    await pickSingleChoice(canvasElement, RIGHT);
    const submit = within(canvasElement).getByTestId('single-choice-submit');
    await expect(submit).not.toBeDisabled();
    await expect(submit).not.toHaveAttribute('data-submitted');
  },
};

/** C.submitted + D.correct — escolhe a certa e envia; o veredito sobe verde. */
export const Correct: Story = {
  args: { activity: makeActivity('single_choice', SPEC) },
  play: async ({ args, canvasElement }) => {
    await pickSingleChoice(canvasElement, RIGHT);
    await submitAnswer(canvasElement, 'single-choice-submit');
    await expect(within(canvasElement).getByTestId('single-choice-submit')).toHaveAttribute('data-correct', 'true');
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — escolhe a errada e envia; o veredito sobe vermelho. */
export const Incorrect: Story = {
  args: { activity: makeActivity('single_choice', SPEC) },
  play: async ({ args, canvasElement }) => {
    await pickSingleChoice(canvasElement, WRONG);
    await submitAnswer(canvasElement, 'single-choice-submit');
    await expect(within(canvasElement).getByTestId('single-choice-submit')).toHaveAttribute('data-correct', 'false');
    await expect(args.onComplete).toHaveBeenCalledWith(false, expect.anything());
  },
};

/**
 * B.done — activity concluída numa sessão ANTERIOR. Sem seam, este é o estado
 * REAL: o componente não persiste a escolha, então quem volta a uma activity
 * `done` vê as opções travadas e o envio já gasto — não a própria resposta.
 * (Antes a story fingia lembrar da escolha, via `initialSelectedId`.)
 */
export const Disabled: Story = {
  args: { activity: makeActivity('single_choice', SPEC, 'done') },
};

export const ImageOptions: Story = {
  args: { activity: makeActivity('single_choice', SINGLE_CHOICE_IMAGE_SPEC) },
};

/** Letter-only options that name the `**A**` / `**B**` / `**C**` blocks of the instruction keep the authored order. */
export const LetterOptions: Story = {
  args: {
    activity: makeActivity('single_choice', {
      instruction: 'Qual bloco fecha a tag certo?\n\n**A**\n\n`<h1>Oi<h1>`\n\n**B**\n\n`<h1>Oi</h1>`\n\n**C**\n\n`<h1>Oi</h>`',
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      correct_option_id: 'b',
    }),
  },
  play: async ({ canvasElement }) => {
    const labels = within(canvasElement)
      .getAllByTestId('single-choice-option')
      .map((option) => option.getAttribute('data-option-id'));
    await expect(labels).toEqual(['a', 'b', 'c']);
  },
};
