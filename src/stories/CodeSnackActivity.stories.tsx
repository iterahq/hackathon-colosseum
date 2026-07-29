import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { CodeSnackActivity } from '@/components/branded/activity/code/CodeSnackActivity';
import { makeActivity, noop } from './activityFixtures';
import { CODE_SPEC, CODE_STARTER } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `code` — snack React de arquivo único (Monaco à esquerda, preview ao
 * vivo à direita).
 *
 *   { prompt, starter?, language = 'tsx', help?: { label, url } }
 *
 * Este é o único contrato TIPADO de forma estrita entre os quatro kinds
 * "dev-flavored": `CodeSpecSchema` exige `prompt` e valida `help.url`. O
 * `CodeSnackActivity` roda `safeParseActivitySpec('code', spec)` antes de
 * montar o painel — spec inválido vira um card amigável em vez de crash.
 *
 * ⚠️ REGRA DO `starter`: o preview roda dentro de um
 * `<iframe sandbox="allow-scripts">` AUTOSSUFICIENTE — React UMD + Tailwind CDN
 * carregados de `public/vendor/`, e o código do aluno é executado via
 * `new Function("React","useState","useEffect","useRef","useMemo","useCallback",…)`.
 * Não existe `require` nem bundler lá dentro: `React` e os hooks chegam como
 * GLOBAIS. Portanto o `starter` NÃO pode conter `import` — só `export default`
 * (o sucrase converte para `module.exports.default`, que é o que o iframe lê).
 *
 * Nada é mockado aqui: o autosave do `useCodeSnack` grava em `localStorage`
 * (nenhuma chamada de rede), então a story roda de ponta a ponta no canvas —
 * edite o código à esquerda e veja o preview atualizar à direita.
 */
const meta: Meta<typeof CodeSnackActivity> = {
  title: 'Organisms/Activities/5 · Produção/Code',
  id: 'activities-producao-code',
  component: CodeSnackActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: noop },
};
export default meta;
type Story = StoryObj<typeof CodeSnackActivity>;

/** `prompt` + `starter` → edite à esquerda, o preview recompila à direita. */
export const Default: Story = {
  args: { activity: makeActivity('code', CODE_SPEC) },
};

/** Variação: `help` acrescenta um link de referência abaixo do editor. */
export const ComLinkDeApoio: Story = {
  args: {
    activity: makeActivity('code', {
      ...CODE_SPEC,
      help: { label: 'Como funciona o useState', url: 'https://react.dev/reference/react/useState' },
    }),
  },
};

/**
 * Variação: sem `starter` → editor vazio. O preview mostra a mensagem
 * "Seu componente precisa de um export default." até o aluno escrever algo.
 */
export const SemStarter: Story = {
  args: {
    activity: makeActivity('code', {
      prompt: 'Comece do zero: crie um componente que mostre o seu nome na tela.',
      language: 'tsx',
    }),
  },
};

/** Variação de ESTADO: activity concluída → botão travado em "Concluída". */
export const Concluida: Story = {
  args: { activity: makeActivity('code', CODE_SPEC, 'done') },
};

/**
 * GUARDA DE CONTRATO (o único fixture deliberadamente INVÁLIDO do arquivo):
 * `prompt` é obrigatório no `CodeSpecSchema`. Sem ele o `safeParse` falha e o
 * componente renderiza o card de "configuração inválida" — é essa proteção que
 * a story documenta, não um estado normal de aula.
 */
export const EspecInvalida: Story = {
  args: { activity: makeActivity('code', { starter: CODE_STARTER }) },
};

/* ══════════════════════════════════════════════════════════════════════════
 * BROWSER MODE (ADR-8) — as stories abaixo NÃO rodam em jsdom.
 *
 * O `code` é o kind que o ADR-8 nomeia com razão inteira: o preview vive num
 * `<iframe sandbox="allow-scripts">` que jsdom não executa, e o editor é o
 * Monaco de verdade. Em jsdom, um `submit` com `checks` esperaria para sempre
 * um veredito que nunca chega — o `useCodeSnack` até tem um timeout de
 * contingência ("nada passou"), e é EXATAMENTE esse falso vermelho que provaria
 * o oposto do que se quer.
 *
 * Elas rodam no projeto `storybook-browser` (`vitest.browser.config.ts`), num
 * Chromium real, selecionadas pela tag `browser-mode`. Por ADR-9 esse projeto
 * entra em CI **não-bloqueante por uma semana**.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Checks que o `starter` JÁ satisfaz — o caminho de acerto. */
const CHECKS_QUE_PASSAM = [
  { id: 'titulo', label: 'A tela tem um título', selector: 'h1', assert: { type: 'exists' as const } },
  {
    id: 'botao',
    label: 'Existe um botão de curtir',
    selector: 'button',
    assert: { type: 'text' as const, contains: 'Gostei' },
  },
];

/** Um check que o `starter` NÃO satisfaz — o caminho de erro. */
const CHECKS_QUE_FALHAM = [
  { id: 'titulo', label: 'A tela tem um título', selector: 'h1', assert: { type: 'exists' as const } },
  {
    id: 'formulario',
    label: 'Existe um formulário de cadastro',
    selector: 'form',
    assert: { type: 'exists' as const },
    hint: 'Envolva o botão num <form>.',
  },
];

/**
 * C.submitted + D.correct — enviar roda os checks DENTRO do iframe, contra o
 * DOM que o código do aluno realmente produziu. É a passagem
 * `editing → submitting → submitted` inteira, e nenhuma parte dela é
 * observável em jsdom.
 */
export const BrowserChecksPassam: Story = {
  tags: ['browser-mode'],
  args: {
    activity: makeActivity('code', { ...CODE_SPEC, checks: CHECKS_QUE_PASSAM }),
    onComplete: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = canvasElement.querySelector('[data-activity-kind="code"]') as HTMLElement;
    await expect(shell).toHaveAttribute('data-phase', 'editing');

    await userEvent.click(await canvas.findByTestId('code-submit'));

    // O veredito volta do iframe: `submitting` → `submitted`, com todos verdes.
    await waitFor(() => expect(shell).toHaveAttribute('data-phase', 'submitted'), { timeout: 15000 });
    const verdicts = canvas.getAllByTestId('code-check-item');
    await expect(verdicts.every((v) => v.getAttribute('data-passed') === 'true')).toBe(true);
  },
};

/**
 * D.incorrect — um check que o código não satisfaz. O aluno vê QUAL falhou (com
 * a dica) e o caminho de volta para o editor, com o próprio código intacto.
 */
export const BrowserChecksFalham: Story = {
  tags: ['browser-mode'],
  args: {
    activity: makeActivity('code', { ...CODE_SPEC, checks: CHECKS_QUE_FALHAM }),
    onComplete: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = canvasElement.querySelector('[data-activity-kind="code"]') as HTMLElement;

    await userEvent.click(await canvas.findByTestId('code-submit'));
    await waitFor(() => expect(shell).toHaveAttribute('data-phase', 'submitted'), { timeout: 15000 });

    const verdicts = canvas.getAllByTestId('code-check-item');
    await expect(verdicts.some((v) => v.getAttribute('data-passed') === 'false')).toBe(true);
    // Falhar NÃO conclui a activity — o aluno volta a editar.
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/**
 * ── C.answered NÃO ENTROU, e o motivo fica escrito aqui ────────────────────
 *
 * A célula `code · C.answered` é "o aluno alterou o código no editor". Ela foi
 * TENTADA neste projeto de browser e NÃO foi obtida: o Monaco não lê do
 * `<textarea>` que ele mantém no DOM — aquele elemento é um sumidouro de
 * eventos, e o conteúdo real vive no modelo interno do editor. Clicar em
 * `.view-lines` e emitir teclado sintético (`userEvent.keyboard`) não altera o
 * modelo; seria preciso falar com a API do Monaco (`editor.getModel().setValue`),
 * ou seja, testar o editor pelo lado de dentro em vez de dirigir a UI — que é
 * justamente o que este tier existe para NÃO fazer.
 *
 * O que já existe, e é honesto contar: `src/test/CodeSnackActivity.test.tsx`
 * cobre "digitou → autosave debounced" com o `CodeEditor` MOCKADO. Ou seja, a
 * ligação editor → estado está provada; o que não está provada é a digitação
 * dentro do Monaco real. A célula segue declarada como não-coberta no guard de
 * matriz, com este motivo — não como coberta.
 */
