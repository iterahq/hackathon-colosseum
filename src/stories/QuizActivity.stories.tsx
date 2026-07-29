import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { QUIZ_TRUE_FALSE_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { pickQuizOption, submitAnswer } from './interactions';

/**
 * CONTRATO `quiz` — a activity "herói": pergunta única + opções com a correção
 * embutida em cada opção.
 *
 *   { label?, question? | prompt, options: [{ id?, text? | label?, isCorrect? }], explanation? }
 *
 * Por que é um contrato SEPARADO de `single_choice` (e não uma variação dele):
 *   - a correção vem de `options[].isCorrect`, e não de um `correct_option_id`;
 *   - o enunciado é `question`/`prompt` (string), e não um InstructionPanel;
 *   - ele aceita `label` (a tarja verde-mono acima da pergunta), que single_choice
 *     não tem, e é o único contrato do spec que declara `explanation` (o porquê
 *     mostrado quando o aluno erra — o player lê esse campo em toda kind avaliada,
 *     mas só o quiz o carrega hoje).
 * A ferramenta de autoria precisa entregar um JSON diferente → activity diferente.
 *
 * `quiz` ainda é stub LOOSE no `@iterahq/activity-spec` (`z.record(z.unknown())`),
 * então o Zod aceita qualquer objeto. Os fixtures abaixo foram montados a partir
 * do que o `QuizActivity` de fato LÊ (ver o switch do ActivityRenderer).
 *
 * `QuizActivity` não é exportado — a story renderiza o dispatcher REAL
 * (`ActivityRenderer`) com `kind: 'quiz'`, que é exatamente o caminho de produção.
 *
 * ── FASE 3: o buraco que o ADR-4 mandou esperar ────────────────────────────
 * Até a Fase 2 o quiz — a activity que o próprio código chama de "herói" — era
 * o ÚNICO kind graduado sem story de respondido/correto/incorreto, e o motivo
 * estava escrito na matriz: ele nunca teve seam `initial*`, e a decisão travada
 * (ADR-4) foi NÃO criar um. O que destrava essas três células não é uma prop
 * nova — é a INTERAÇÃO. As stories abaixo clicam a opção e enviam, exatamente
 * como o aluno, e o mesmo `play` roda no CI (`src/test/storyPlay.test.tsx`).
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Organisms/Activities/2 · Escolha/Quiz',
  id: 'activities-escolha-quiz',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

/** Duas opções → layout lado a lado + tarja "VERDADEIRO OU FALSO?" automática. */
export const VerdadeiroOuFalso: Story = {
  args: { activity: makeActivity('quiz', QUIZ_TRUE_FALSE_SPEC) },
};

/** Variação do mesmo contrato: 3+ opções → lista empilhada com ícone de acerto. */
export const MultiplasOpcoes: Story = {
  args: {
    activity: makeActivity('quiz', {
      question: 'Qual coluna serve melhor como chave primária de uma tabela de alunos?',
      options: [
        { id: 'a', text: 'O nome completo do aluno', isCorrect: false },
        { id: 'b', text: 'O número de matrícula', isCorrect: true },
        { id: 'c', text: 'A turma em que ele estuda', isCorrect: false },
        { id: 'd', text: 'A data de nascimento', isCorrect: false },
      ],
      explanation: 'Nome e data de nascimento podem se repetir; a matrícula é única por aluno.',
    }),
  },
};

/** Variação: `label` sobrescreve a tarja padrão. */
export const TarjaCustomizada: Story = {
  args: {
    activity: makeActivity('quiz', {
      label: 'REVISÃO RÁPIDA',
      question: 'Uma tabela pode ter mais de uma chave estrangeira?',
      options: [
        { id: 'sim', text: 'Sim', isCorrect: true },
        { id: 'nao', text: 'Não', isCorrect: false },
      ],
    }),
  },
};

/** Variação: `explanation` aparece só quando o aluno ERRA — responda no canvas. */
export const ComExplicacao: Story = {
  args: {
    activity: makeActivity('quiz', {
      label: 'PENSE UM POUCO',
      question: 'Guardar o mesmo endereço em três tabelas diferentes é uma boa ideia?',
      options: [
        { id: 'sim', text: 'Sim', isCorrect: false },
        { id: 'nao', text: 'Não', isCorrect: true },
      ],
      explanation:
        'Se o endereço mudar, você teria que lembrar de corrigir em três lugares. Guarde uma vez e referencie.',
    }),
  },
};

/** Variação de ESTADO: activity já concluída → o envio fica travado. */
export const Concluida: Story = {
  args: { activity: makeActivity('quiz', QUIZ_TRUE_FALSE_SPEC, 'done') },
};

/**
 * C.answered — opção marcada, ainda NÃO enviada. O quiz não colore nada antes
 * do envio: só o "Enviar" sai do estado desabilitado.
 */
export const Answered: Story = {
  args: { activity: makeActivity('quiz', QUIZ_TRUE_FALSE_SPEC) },
  play: async ({ canvasElement }) => {
    await pickQuizOption(canvasElement, 'Falso');
    const submit = within(canvasElement).getByTestId('quiz-submit');
    await expect(submit).not.toBeDisabled();
    await expect(submit).not.toHaveAttribute('data-submitted');
  },
};

/** C.submitted + D.correct — responde certo; a `explanation` NÃO aparece (só no erro). */
export const Correct: Story = {
  args: { activity: makeActivity('quiz', QUIZ_TRUE_FALSE_SPEC) },
  play: async ({ args, canvasElement }) => {
    await pickQuizOption(canvasElement, 'Falso');
    await submitAnswer(canvasElement, 'quiz-submit');
    await expect(within(canvasElement).getByTestId('quiz-submit')).toHaveAttribute('data-correct', 'true');
    await expect(within(canvasElement).queryByTestId('answer-explanation')).toBeNull();
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — responde errado; a opção certa acende junto com o erro. */
export const Incorrect: Story = {
  args: { activity: makeActivity('quiz', QUIZ_TRUE_FALSE_SPEC) },
  play: async ({ args, canvasElement }) => {
    await pickQuizOption(canvasElement, 'Verdadeiro');
    await submitAnswer(canvasElement, 'quiz-submit');
    await expect(within(canvasElement).getByTestId('quiz-submit')).toHaveAttribute('data-correct', 'false');
    await expect(within(canvasElement).getByTestId('answer-explanation')).toBeInTheDocument();
    await expect(args.onComplete).toHaveBeenCalledWith(false, expect.anything());
  },
};

/** Borda: `options` vazio → o renderer cai no texto do `prompt`. */
export const SemOpcoes: Story = {
  args: {
    activity: makeActivity('quiz', {
      prompt: 'Este quiz foi publicado sem opções — a autoria precisa preencher `options`.',
      options: [],
    }),
  },
};
