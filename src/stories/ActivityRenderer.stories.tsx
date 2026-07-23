import type { Meta, StoryObj } from '@storybook/react';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity, noop } from './activityFixtures';
import {
  CODE_SPEC,
  CONCEPT_SPEC,
  DIAGRAM_MERMAID_SPEC,
  DOCUMENT_READING_SPEC,
  DOCUMENT_WRITING_RUBRIC,
  DOCUMENT_WRITING_SPEC,
  MATCH_SPEC,
  MULTI_CHOICE_SPEC,
  ORDER_SPEC,
  QUIZ_TRUE_FALSE_SPEC,
  SANDBOX_CHOICES_SPEC,
  SINGLE_CHOICE_SPEC,
  VIDEO_SPEC,
} from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * `ActivityRenderer` — o DISPATCHER: recebe uma row de `itera.activities` e
 * escolhe a view pelo `kind`. Esta página existe para ver o catálogo inteiro de
 * contratos de uma vez; a cobertura exaustiva de variantes mora nas stories de
 * cada contrato, agrupadas por FUNÇÃO pedagógica na sidebar:
 *
 *   0 · Dispatcher            → esta página (um exemplar por contrato)
 *   1 · Exposição             → Concept · Video · Diagram · Document (leitura)
 *   2 · Escolha               → SingleChoice · MultiChoice · Quiz
 *   3 · Associação            → Match
 *   4 · Ordenação             → Order
 *   5 · Produção              → Document (redação) · Code
 *   6 · Cenário com IA        → Sandbox (IA aberta · opções · slots · BYOC ao vivo)
 *   9 · Partes compartilhadas → FeedbackFooter
 *
 * Critério do agrupamento: o CONTRATO que a ferramenta de autoria precisa
 * entregar. Schema/metadata diferente → contrato diferente → story própria.
 * Variação do mesmo schema (com ou sem imagem, 2 ou 4 opções, respondida ou em
 * branco) → variante DENTRO da story, nunca uma activity nova.
 *
 * Todos os specs vêm de `./contractFixtures.ts` e são validados contra
 * `safeParseActivitySpec` em `src/test/activityContractFixtures.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Organisms/Activities/0 · Dispatcher (todos os contratos)',
  id: 'activities-dispatcher',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: noop },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

/* 1 · Exposição ---------------------------------------------------- */

/** kind = concept — exibição pura, sem interação além de concluir. */
export const Concept: Story = {
  args: { activity: makeActivity('concept', CONCEPT_SPEC) },
};

/** kind = video — assistir e concluir. */
export const Video: Story = {
  args: { activity: makeActivity('video', VIDEO_SPEC) },
};

/** kind = diagram — diagrama (mermaid ou imagem) para leitura. */
export const Diagram: Story = {
  args: { activity: makeActivity('diagram', DIAGRAM_MERMAID_SPEC) },
};

/** kind = document SEM prompt/rubric — leitura pura. */
export const DocumentLeitura: Story = {
  args: { activity: makeActivity('document', DOCUMENT_READING_SPEC) },
};

/* 2 · Escolha ------------------------------------------------------ */

/** kind = single_choice — exatamente uma correta. */
export const SingleChoice: Story = {
  args: { activity: makeActivity('single_choice', SINGLE_CHOICE_SPEC) },
};

/** kind = multi_choice — o conjunto marcado precisa bater com o esperado. */
export const MultiChoice: Story = {
  args: { activity: makeActivity('multi_choice', MULTI_CHOICE_SPEC) },
};

/** kind = quiz — correção embutida em `options[].isCorrect`. */
export const Quiz: Story = {
  args: { activity: makeActivity('quiz', QUIZ_TRUE_FALSE_SPEC) },
};

/* 3 · Associação · 4 · Ordenação ----------------------------------- */

/** kind = match — ligar a coluna da esquerda à da direita. */
export const Match: Story = {
  args: { activity: makeActivity('match', MATCH_SPEC) },
};

/** kind = order — reordenar a sequência embaralhada. */
export const Order: Story = {
  args: { activity: makeActivity('order', ORDER_SPEC) },
};

/* 5 · Produção ----------------------------------------------------- */

/** kind = document COM prompt + rubric.min_words — textarea com contador. */
export const DocumentRedacao: Story = {
  args: {
    activity: makeActivity('document', DOCUMENT_WRITING_SPEC, undefined, DOCUMENT_WRITING_RUBRIC),
  },
};

/** kind = code — Monaco + preview React ao vivo em iframe isolado. */
export const Code: Story = {
  args: { activity: makeActivity('code', CODE_SPEC) },
};

/* 6 · Cenário com IA ----------------------------------------------- */

/**
 * kind = sandbox_scenario — o dispatcher valida o Scenario no Zod e, dentro do
 * kind, escolhe o componente pela forma da autoria (`slots` → completar
 * palavras, `choices` → chips de contexto, nenhum dos dois → compose livre).
 */
export const SandboxScenario: Story = {
  args: { activity: makeActivity('sandbox_scenario', SANDBOX_CHOICES_SPEC) },
};

/* Borda ------------------------------------------------------------ */

/** kind desconhecido — o fallback explícito do dispatcher. */
export const KindDesconhecido: Story = {
  args: {
    activity: {
      ...makeActivity('concept', CONCEPT_SPEC),
      kind: 'nao_existe' as never,
    },
  },
};
