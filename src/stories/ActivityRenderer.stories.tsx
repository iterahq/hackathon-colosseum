import type { Meta, StoryObj } from '@storybook/react';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity, noop } from './activityFixtures';
import {
  CODE_SPEC,
  CONCEPT_REVEAL_SPEC,
  CONCEPT_SPEC,
  DEGENERATE_SPECS,
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
  TERMINAL_SANDBOX_SPEC,
  UNGUARDED_INVALID_SPECS,
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

/** kind = concept — leitura pura, sem "concluir" (o shell avança). */
export const Concept: Story = {
  args: { activity: makeActivity('concept', CONCEPT_SPEC) },
};

/** kind = concept_reveal — leitura que fecha num card pense-antes, sem nota. */
export const ConceptReveal: Story = {
  args: { activity: makeActivity('concept_reveal', CONCEPT_REVEAL_SPEC) },
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
 * kind = chat_sandbox — o dispatcher valida o Scenario no Zod e, dentro do
 * kind, escolhe o componente pela forma da autoria (`slots` → completar
 * palavras, `choices` → chips de contexto, nenhum dos dois → compose livre).
 */
export const SandboxScenario: Story = {
  args: { activity: makeActivity('chat_sandbox', SANDBOX_CHOICES_SPEC) },
};

/**
 * kind = chat_sandbox — o kind próprio do cenário de chat. A escolha do
 * componente por forma da autoria continua idêntica; o que mudou é que a
 * chat-idade agora é o KIND e não um campo dentro do spec.
 */
export const ChatSandbox: Story = {
  args: { activity: makeActivity('chat_sandbox', SANDBOX_CHOICES_SPEC) },
};

/**
 * kind = terminal_sandbox — o outro lado da divisão. Esta story é o que prova
 * que o roteamento é por KIND: o spec NÃO carrega `sandboxKind`, e ainda assim
 * cai no terminal.
 */
export const TerminalSandbox: Story = {
  args: { activity: makeActivity('terminal_sandbox', TERMINAL_SANDBOX_SPEC) },
};

/* EIXO E · reveal — gabarito exposto SEM submissão ------------------ */

/**
 * `reveal` é o eixo E da matriz de estados: o professor para o cronômetro e
 * abre o gabarito, sem que o aluno tenha enviado nada.
 *
 * ⚠️ ELE NÃO CHEGA A TODOS OS KINDS. O dispatcher só encaminha `reveal` para
 * `single_choice`, `multi_choice`, `match`, `order` e os sandboxes (mais a
 * camada BYOC). Nos demais o parâmetro é descartado no `switch` acima — por isso
 * só existem as cinco stories abaixo, e não onze: uma story `Reveal` de `quiz`
 * ou de `code` renderizaria exatamente o mesmo pixel do estado em branco e
 * *fingiria* cobertura. As células correspondentes estão marcadas como `n/a` ou
 * `deferred` — com o motivo — em `src/test/activityMatrixCoverage.test.ts`.
 *
 * ⚠️ DRIFT (achado da Fase 2, não corrigido aqui — é mudança de produção):
 * `hasRevealableAnswer('quiz')` é `true`, então o controle "Revelar resposta"
 * APARECE para o professor num quiz — mas `QuizActivity` fixa `reveal: false`
 * ("The quiz has NO `reveal` affordance"). Ou seja: o botão existe e não faz
 * nada. É o mesmo formato do bug que originou a separação
 * `isAnswerableLiveKind` × `hasRevealableAnswer`, agora do outro lado.
 */

/** kind = single_choice com `reveal` — a opção correta se acende sem envio. */
export const RevealSingleChoice: Story = {
  args: { activity: makeActivity('single_choice', SINGLE_CHOICE_SPEC), reveal: true },
};

/** kind = multi_choice com `reveal` — o conjunto correto se acende sem envio. */
export const RevealMultiChoice: Story = {
  args: { activity: makeActivity('multi_choice', MULTI_CHOICE_SPEC), reveal: true },
};

/** kind = match com `reveal` — as ligações corretas aparecem sem envio. */
export const RevealMatch: Story = {
  args: { activity: makeActivity('match', MATCH_SPEC), reveal: true },
};

/** kind = order com `reveal` — a sequência correta aparece sem envio. */
export const RevealOrder: Story = {
  args: { activity: makeActivity('order', ORDER_SPEC), reveal: true },
};

/** kind = chat_sandbox com `reveal` — libera "Continuar" sem rodar o cenário. */
export const RevealSandboxScenario: Story = {
  args: { activity: makeActivity('chat_sandbox', SANDBOX_CHOICES_SPEC), reveal: true },
};

/** kind = chat_sandbox com `reveal` — o `reveal` atravessa o kind novo igual. */
export const RevealChatSandbox: Story = {
  args: { activity: makeActivity('chat_sandbox', SANDBOX_CHOICES_SPEC), reveal: true },
};

/** kind = terminal_sandbox com `reveal` — libera "Continuar" sem rodar o roteiro. */
export const RevealTerminalSandbox: Story = {
  args: { activity: makeActivity('terminal_sandbox', TERMINAL_SANDBOX_SPEC), reveal: true },
};

/* EIXO H — spec que o Zod ACEITA, no extremo degenerado ------------- */

/**
 * Todos os specs abaixo vêm de `DEGENERATE_SPECS` e são provados VÁLIDOS por
 * `safeParseActivitySpec` em `src/test/activityContractFixtures.test.ts`. É a
 * leitura literal do invariante do Tainan: metadata que o schema aceita tem que
 * renderizar, mesmo quando o campo opcional não veio.
 */

/** `document` com `prompt` e sem `body` → leitura sem material de referência. */
export const DocumentSemCorpo: Story = {
  args: { activity: makeActivity('document', DEGENERATE_SPECS.document_sem_corpo.spec) },
};

/** `diagram` sem `mermaid` e sem `imageUrl` → só o enunciado. */
export const DiagramSemFonte: Story = {
  args: { activity: makeActivity('diagram', DEGENERATE_SPECS.diagram_sem_fonte.spec) },
};

/** `single_choice` sem `instruction` → opções sem enunciado nenhum. */
export const SingleChoiceSemEnunciado: Story = {
  args: {
    activity: makeActivity('single_choice', DEGENERATE_SPECS.single_choice_sem_enunciado.spec),
  },
};

/** `multi_choice` sem `instruction`. */
export const MultiChoiceSemEnunciado: Story = {
  args: {
    activity: makeActivity('multi_choice', DEGENERATE_SPECS.multi_choice_sem_enunciado.spec),
  },
};

/** `match` sem `instruction` — e com um par só. */
export const MatchSemEnunciado: Story = {
  args: { activity: makeActivity('match', DEGENERATE_SPECS.match_sem_enunciado.spec) },
};

/** `order` sem `instruction`. */
export const OrderSemEnunciado: Story = {
  args: { activity: makeActivity('order', DEGENERATE_SPECS.order_sem_enunciado.spec) },
};

/* EIXO F — spec INVÁLIDO, e o que acontece com ele ------------------ */

/**
 * ⚠️ As duas primeiras são specs que o Zod do kind REJEITA e que, ainda assim,
 * chegam inteiros no renderer — porque `safeParseActivitySpec` só é chamado em
 * `code` e nos sandboxes (ADR-5 / ADR-13 / drift signal #3). O guard prova
 * a rejeição; a story mostra o fallback que segura o tranco enquanto a fronteira
 * de validação não existe.
 */

/** `video` sem `video_url` (Zod: obrigatório) → aviso "vídeo indisponível". */
export const VideoSemUrl: Story = {
  args: { activity: makeActivity('video', UNGUARDED_INVALID_SPECS.video_sem_url.spec) },
};

/** `concept` sem `instruction` (Zod: obrigatória) → sobra o shell do concept. */
export const ConceptSemInstrucao: Story = {
  args: { activity: makeActivity('concept', UNGUARDED_INVALID_SPECS.concept_sem_instrucao.spec) },
};

/** `concept_reveal` sem o card — o `reveal` É o kind: barrado na fronteira. */
export const ConceptRevealSemCard: Story = {
  args: {
    activity: makeActivity(
      'concept_reveal',
      UNGUARDED_INVALID_SPECS.concept_reveal_sem_card.spec,
    ),
  },
};

/** `chat_sandbox` com lixo — ESTE é barrado: card `sandbox-invalid`, sem crash. */
export const ChatSandboxEspecInvalida: Story = {
  args: { activity: makeActivity('chat_sandbox', UNGUARDED_INVALID_SPECS.sandbox_lixo.spec) },
};

/**
 * `terminal_sandbox` com lixo — mesmo card. É a metade da divisão que mais
 * importa provar: um spec de terminal validado contra o schema do chat também
 * reprovaria, e aí o card seria um falso negativo em vez de um achado.
 */
export const TerminalSandboxEspecInvalida: Story = {
  args: { activity: makeActivity('terminal_sandbox', UNGUARDED_INVALID_SPECS.sandbox_lixo.spec) },
};

/* EIXO G — kind desconhecido --------------------------------------- */

/** kind desconhecido — o fallback explícito do dispatcher. */
export const KindDesconhecido: Story = {
  args: {
    activity: {
      ...makeActivity('concept', CONCEPT_SPEC),
      kind: 'nao_existe' as never,
    },
  },
};
