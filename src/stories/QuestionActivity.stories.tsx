import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within, userEvent } from 'storybook/test';
import { QuestionActivity } from '@/components/branded/activity/QuestionActivity';
import { makeActivity } from './activityFixtures';
import { QUESTION_MULTI_SPEC, QUESTION_SPEC as SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `question` — a pergunta NÃO-AVALIATIVA (2026-08-28, ADR-6).
 *
 *   { title?, description?, instruction?, mode, options[{ id, label, description? }],
 *     recommended_option_id?, allow_other (default true), free_text? }
 *
 * ── O QUE ESTAS STORIES EXISTEM PRA MOSTRAR ────────────────────────────────
 * Não há verde, não há vermelho e não há gabarito. `★ recomendado` é um
 * MARCADOR de quem pergunta, com o mesmo peso antes e depois do envio — a
 * `Submitted` abaixo asserta isso literalmente, porque "não pintar de verde" é
 * o comportamento inteiro do kind e um comportamento que ninguém asserta é um
 * comportamento que volta.
 *
 * ── FASE 3 (ADR-2 / ADR-4) ─────────────────────────────────────────────────
 * Todo estado é alcançado CLICANDO, do mesmo `play` que roda no canvas e no
 * Vitest. Não existe prop de seam neste componente.
 */
const meta: Meta<typeof QuestionActivity> = {
  title: 'Organisms/Activities/7 · Consulta/Question',
  id: 'activities-consulta-question',
  component: QuestionActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof QuestionActivity>;

/** C.blank / A.enabled — em branco, com a opção recomendada já marcada como tal. */
export const Default: Story = {
  args: { activity: makeActivity('question', SPEC) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // O marcador existe desde o primeiro render, e é só um marcador.
    await expect(canvas.getAllByTestId('question-recommended')).toHaveLength(1);
    // "Enviar" começa travado: nada foi respondido ainda.
    await expect(canvas.getByTestId('question-submit')).toBeDisabled();
  },
};

/** C.answered — uma opção marcada, ainda não enviada: "Enviar" destrava. */
export const Answered: Story = {
  args: { activity: makeActivity('question', SPEC) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByTestId('question-option')[1]);
    await expect(canvas.getByTestId('question-submit')).not.toBeDisabled();
  },
};

/**
 * C.submitted — enviada, e o botão fica NEUTRO.
 *
 * `data-correct` ausente é a asserção que importa: o `SubmitButton` só pinta
 * verde ou vermelho quando recebe `correct`, e este kind nunca passa. Uma
 * pergunta que ficasse verde estaria dizendo que a opinião foi acertada.
 */
export const Submitted: Story = {
  args: { activity: makeActivity('question', SPEC) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByTestId('question-option')[1]);
    await userEvent.click(canvas.getByTestId('question-submit'));
    const submit = canvas.getByTestId('question-submit');
    await expect(submit).toHaveAttribute('data-submitted', 'true');
    await expect(submit).not.toHaveAttribute('data-correct');
    await expect(args.onComplete).toHaveBeenCalled();
  },
};

/**
 * Só TEXTO — nenhuma opção marcada, e ainda assim uma resposta completa.
 *
 * Esta é a diferença que separa o kind da família de escolha: lá,
 * `submitDisabled` exige uma seleção.
 */
export const FreeTextOnly: Story = {
  args: { activity: makeActivity('question', SPEC) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByTestId('question-text'), 'Nenhuma das três.');
    await expect(canvas.getByTestId('question-submit')).not.toBeDisabled();
    await userEvent.click(canvas.getByTestId('question-submit'));
    await expect(args.onComplete).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ response: 'Nenhuma das três.' }),
    );
  },
};

/** "Outro" + texto — a saída de emergência, ligada por default. */
export const OtherWithText: Story = {
  args: { activity: makeActivity('question', SPEC) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('question-other'));
    await userEvent.type(canvas.getByTestId('question-text'), 'Um quarto caminho.');
    await expect(canvas.getByTestId('question-other')).toHaveAttribute('data-selected', 'true');
  },
};

/**
 * `multi`, e SEM "Outro" (`allow_other: false`).
 *
 * O texto livre continua na tela: ele é propriedade do kind, não uma flag do
 * spec. Desligar o "Outro" fecha a LISTA, não a boca de quem responde.
 */
export const MultiNoOther: Story = {
  args: { activity: makeActivity('question', QUESTION_MULTI_SPEC) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId('question-other')).toBeNull();
    await expect(canvas.getByTestId('question-text')).toBeInTheDocument();
    await userEvent.click(canvas.getAllByTestId('question-option')[0]);
    await userEvent.click(canvas.getAllByTestId('question-option')[2]);
    // `multi` ACUMULA — as duas ficam marcadas.
    const marked = canvas
      .getAllByTestId('question-option')
      .filter((b) => b.getAttribute('data-selected') === 'true');
    await expect(marked).toHaveLength(2);
  },
};

/**
 * B.done — respondida numa sessão ANTERIOR, sem `priorAnswer`.
 *
 * Sem a resposta guardada este é o estado real: tudo travado e nada marcado.
 * Não é um veredito, é uma tranca. O caminho COM `priorAnswer` está coberto em
 * `src/test/activityPriorAnswerRestore.test.tsx`, onde o payload pode ser
 * construído como o host o devolveria.
 */
export const Disabled: Story = {
  args: { activity: makeActivity('question', SPEC, 'done') },
};
