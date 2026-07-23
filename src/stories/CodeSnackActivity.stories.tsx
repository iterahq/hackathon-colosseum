import type { Meta, StoryObj } from '@storybook/react';
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
