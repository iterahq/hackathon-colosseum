import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { CodeSnackActivity } from '@/components/branded/activity/code/CodeSnackActivity';
import { makeActivity, noop } from './activityFixtures';
import { CODE_DROPDOWN_SPEC, CODE_OPTIONS_SPEC, CODE_TEXT_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `code` GUIADO — o MESMO kind `code`, reconhecido por `blanks`:
 *
 *   { prompt, starter (com `{{blank:<id>}}`), blanks[], word_bank? }
 *
 * O editor aberto é nível expert: a sintaxe inteira fica no caminho da UMA
 * decisão que a atividade quer ensinar. Aqui o template vem TRAVADO e só as
 * lacunas aceitam interação, em três degraus de dificuldade — colocar uma
 * palavra que já está na tela, escolher numa lista ao lado da lacuna, digitar
 * de cabeça.
 *
 * ⚠️ Não é Monaco. O Monaco 0.55 não tem read-only PARCIAL: o contorno usual
 * (desfazer a edição do aluno depois do fato) perde para colar, multi-cursor e
 * undo, e o editor passa a brigar com quem digita. O painel travado com widgets
 * de verdade não tem esse buraco — e é por isso que estas stories rodam em
 * jsdom, sem `settleMonacoLanguageWorker`.
 *
 * O preview à direita só aparece com TODAS as lacunas preenchidas: um template
 * meio substituído é erro de sintaxe, e stack trace vermelho em cima de código
 * que o aluno ainda não terminou de ler diz "eu quebrei" — a única mensagem que
 * um primeiro exercício não pode passar.
 */
const meta: Meta<typeof CodeSnackActivity> = {
  title: 'Organisms/Activities/5 · Produção/Code Guiado',
  id: 'activities-producao-code-guiado',
  component: CodeSnackActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: noop },
};
export default meta;
type Story = StoryObj<typeof CodeSnackActivity>;

/**
 * `blanks[].kind = 'bank'` — o degrau mais fácil. As palavras estão todas na
 * tela; o exercício é decidir ONDE cada uma vai. Chip gasto fica apagado em vez
 * de sair da lista, senão o banco reflui embaixo do dedo do aluno.
 */
export const CodeWithOptions: Story = {
  args: { activity: makeActivity('code', CODE_OPTIONS_SPEC), onComplete: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = canvasElement.querySelector('[data-activity-kind="code"]') as HTMLElement;
    await expect(shell).toHaveAttribute('data-guided-variant', 'options');

    // O chip cai na lacuna MIRADA, e sem clique nenhum a mira é a primeira vazia.
    await userEvent.click(canvas.getByRole('button', { name: 'useState' }));
    await userEvent.click(canvas.getByRole('button', { name: 'onClick' }));

    const submit = canvas.getByTestId('guided-submit');
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.click(submit);

    await expect(canvas.getByTestId('guided-feedback')).toHaveAttribute('data-all-correct', 'true');
    await userEvent.click(canvas.getByTestId('guided-continue'));
    // O código MONTADO sobe com o veredito — o `code` já fazia isso, o guiado não abre exceção.
    await expect(args.onComplete).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ response: expect.stringContaining('useState(0)') }),
    );
  },
};

/**
 * `blanks[].kind = 'select'` — os candidatos ficam ao lado da lacuna, então o
 * aluno lê o código com cada opção no lugar antes de escolher. É o degrau que
 * ensina a DISTINGUIR (`useState` vs `useEffect`), não a lembrar.
 */
export const CodeWithDropdown: Story = {
  args: { activity: makeActivity('code', CODE_DROPDOWN_SPEC), onComplete: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = canvasElement.querySelector('[data-activity-kind="code"]') as HTMLElement;
    await expect(shell).toHaveAttribute('data-guided-variant', 'dropdown');

    await userEvent.selectOptions(canvas.getByTestId('guided-blank-hook'), 'useState');
    // Errar de propósito: o veredito lista SÓ a lacuna errada, com a dica dela.
    await userEvent.selectOptions(canvas.getByTestId('guided-blank-evento'), 'onChange');
    await userEvent.click(canvas.getByTestId('guided-submit'));

    const wrong = within(canvas.getByTestId('guided-feedback-wrong'));
    await expect(wrong.getAllByRole('listitem')).toHaveLength(1);
    await expect(canvas.getByTestId('guided-score')).toHaveTextContent('1');
  },
};

/**
 * `blanks[].kind = 'text'` — nada é dado: o exercício é lembrar. A lacuna é
 * dimensionada pelo candidato mais LONGO, então o campo não cresce enquanto se
 * digita nem entrega o tamanho da resposta.
 */
export const CodeWithTextInput: Story = {
  args: { activity: makeActivity('code', CODE_TEXT_SPEC), onComplete: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = canvasElement.querySelector('[data-activity-kind="code"]') as HTMLElement;
    await expect(shell).toHaveAttribute('data-guided-variant', 'text');

    await expect(canvas.getByTestId('guided-preview-waiting')).toBeInTheDocument();
    await userEvent.type(canvas.getByTestId('guided-blank-setter'), 'setCurtidas');
    await userEvent.type(canvas.getByTestId('guided-blank-inicial'), '0');

    // Preenchidas todas as lacunas, o preview destrava.
    await waitFor(() => expect(canvas.queryByTestId('guided-preview-waiting')).toBeNull());
  },
};

/** Variação de ESTADO: activity concluída → template em leitura, botão travado. */
export const Concluida: Story = {
  args: { activity: makeActivity('code', CODE_OPTIONS_SPEC, 'done') },
};

/**
 * `reveal` — o professor parou o relógio e pôs o gabarito na tela. É o único
 * `code` que revela: `blanks[].answer` é solução escrita pelo autor, e o editor
 * aberto só tem `checks`.
 *
 * ESTADO DE APRESENTAÇÃO: não sobrescreve o rascunho, não chama `onComplete`,
 * não vira acerto no pódio — religar o relógio devolve o que o aluno tinha,
 * porque nada passou por cima. Tom próprio e não o verde de acerto, que diria
 * "você acertou" sobre uma resposta que ele não deu; e não só cor, o nome
 * acessível da lacuna diz de quem é a resposta.
 */
export const RevealGuiado: Story = {
  args: { activity: makeActivity('code', CODE_OPTIONS_SPEC), onComplete: fn(), reveal: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = canvasElement.querySelector('[data-activity-kind="code"]') as HTMLElement;
    await expect(shell).toHaveAttribute('data-revealed', 'true');
    await expect(canvas.getByTestId('guided-code-revealed')).toBeInTheDocument();

    const hook = canvas.getByTestId('guided-blank-hook');
    await expect(hook).toHaveTextContent('useState');
    await expect(hook).toHaveAttribute('data-revealed', 'true');
    await expect(hook).toBeDisabled();

    // Sem enviar e sem recomeçar: revelar não é uma tentativa do aluno.
    await expect(canvas.queryByTestId('guided-submit')).toBeNull();
    await expect(canvas.getByTestId('code-reset')).toBeDisabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};
