/**
 * V3 — GUARD DE MATRIZ: toda célula obrigatória da matriz de estados aponta para
 * uma story que EXISTE, ou está declarada como `n/a` / `deferred` / `drift`,
 * com motivo.
 *
 * Plano: `20260728-itera-activity-testing`, Fase 2. O guard de contrato irmão
 * (`activityContractFixtures.test.ts`) já garantia "todo kind tem fixture"; este
 * sobe a régua para "todo kind tem VITRINE de cada estado que ele pode estar".
 *
 * ── POR QUE ESTA TABELA É A MÉTRICA ────────────────────────────────────────
 * O drift signal #1 do plano diz, literalmente, que não existe ferramenta de
 * cobertura neste repo (`vitest.config.ts` não tem `coverage`), e que a saída é
 * "ligar o @vitest/coverage-v8 OU aceitar que o guard de matriz é a métrica".
 * Esta tabela é essa escolha, feita: ela é legível a olho, e o número que
 * importa (`COVERAGE_SNAPSHOT`) só muda quando alguém decide mudá-lo.
 *
 * ── A REGRA QUE FAZ O GUARD NÃO MENTIR ─────────────────────────────────────
 * Um guard que fica verde sobre células que ninguém cobriu é PIOR que não ter
 * guard. Por isso não existe "célula ausente": toda combinação kind × célula
 * tem que aparecer aqui com um dos cinco estados —
 *
 *   `{ story }`    a célula está coberta; a story precisa existir de verdade
 *                  (renomeou a story? o guard fica vermelho).
 *   `{ na }`       o eixo não se aplica a este kind (ex.: correção num kind de
 *                  exposição). Nunca implícito — sempre com o motivo escrito.
 *   `{ deferred }` a célula NÃO está coberta e sabe-se por quê, com o motivo
 *                  no `why`. Três razões existem hoje:
 *                    `fase-3`        — esperava a interação real (ADR-4);
 *                    `browser-input` — a interação existe, mas o WIDGET não é
 *                                      dirigível por evento sintético nem no
 *                                      navegador (o Monaco lê do seu modelo
 *                                      interno, não do `<textarea>` do DOM);
 *                    `terminal-input`— o estado do terminal só nasce DEPOIS de
 *                                      um comando, e uma story é estado inicial.
 *                                      Esta dívida não veio da divisão do
 *                                      kind único de sandbox: ela sempre existiu
 *                                      escondida na linha dele, que cobria só o
 *                                      caminho de chat. A divisão a EXPÔS.
 *   `{ drift }`    a célula não está coberta porque a PRODUÇÃO não a implementa
 *                  (ou implementa de forma contraditória). É achado, não dívida
 *                  de teste — precisa de decisão, não de mais story.
 */
import { describe, expect, it } from 'vitest';
import type { GeneratedChoiceTree } from '@iterahq/activity-spec';
// Every kind the Player renders: the spec's `ACTIVITY_KINDS` plus the 22
// one-behaviour kinds (plan `20260924-activity-type-one-behavior-rule`).
import { KNOWN_ACTIVITY_KINDS as ACTIVITY_KINDS } from '@/utils/activitySpecBoundary';
import { indexStories } from './storyIndex';

/** Um estado da matriz, por kind. */
type Cell =
  | { story: string }
  | { na: string }
  | { deferred: 'fase-3' | 'browser-input' | 'terminal-input'; why: string }
  | { drift: string };

/**
 * As células obrigatórias — os eixos do plano, um a um.
 *
 *   A. gate ao vivo   `enabled` · `locked`      (learnerActivityGate)
 *   B. progresso      `done`                    (activity.status)
 *   C. resposta       `blank` · `answered` · `submitted`
 *   D. correção       `correct` · `incorrect`
 *   E. reveal         gabarito sem submissão
 *   F. spec inválido  degrada em card amigável, nunca crash
 *   H. degenerado     spec que o Zod ACEITA, no extremo
 *
 * (G — kind desconhecido — não é por kind: é o fallback do dispatcher, asserido
 * uma vez lá embaixo.)
 */
const CELLS = [
  'A.enabled',
  'A.locked',
  'B.done',
  'C.blank',
  'C.answered',
  'C.submitted',
  'D.correct',
  'D.incorrect',
  'E.reveal',
  'F.spec_invalido',
  'H.degenerado',
] as const;
type CellKey = (typeof CELLS)[number];

const TERMINAL_NEEDS_TYPING =
  'o terminal não tem "enviar": ele avança quando o comando digitado casa com o `unlock` do ' +
  'passo. Uma story é estado inicial, então alcançar isto exige `play` dirigindo a prompt bar. ' +
  'A recognition em si está provada em `TerminalSandboxActivity.test.tsx`.';

const EXPOSITION_NO_ANSWER =
  'kind de exposição: o aluno consome e segue — não existe resposta a produzir.';
const EXPOSITION_NO_GRADE = 'kind de exposição: não há o que corrigir (eixo D não existe aqui).';
const QUESTION_NO_GRADE =
  'kind NÃO-AVALIATIVO: existe resposta, e mesmo assim não existe resposta certa — logo não há veredito a desenhar. Verde ou vermelho aqui diria que uma opinião foi acertada.';
/* ── the ONE-BEHAVIOUR rows (plan `20260924-activity-type-one-behavior-rule`) ── */
const TERMINAL_TAP_RUNS =
  'tocar um comando da paleta JÁ o executa: não existe rascunho entre escolher e enviar, então "respondido e não enviado" não é um estado deste comportamento.';
const NO_DEGENERATE_SHAPE =
  'o menor spec que o Zod aceita para este comportamento é o próprio `Default` (um passo, uma entrada); sem a entrada, ele deixa de ser ESTE comportamento — vira outro kind, não um extremo deste.';
const COMPOSE_NO_WRONG_SEND =
  'um kind SÓ-COMPOSE não tem envio errado que vire veredito: o passo pede um envio com contexto, e um envio fraco mostra a crítica e mantém o passo aberto (ADR-3: a avaliação é o `chat_rate_reply`).';
const MONACO_INPUT =
  'digitar DENTRO do Monaco — o mesmo motivo da linha `code`: o editor lê do seu modelo interno, não do `<textarea>` do DOM, então teclado sintético não altera nada.';
const CHECKS_IN_IFRAME =
  'os `checks` rodam DENTRO do iframe de preview, contra o DOM que o código do aluno produz — impossível em jsdom. É o MESMO painel da linha `code` (`activities-producao-code--browser-checks-*`, browser mode); o kind só fixa que o juiz são os checks.';
const EDITOR_NO_SOLUTION =
  'o editor aberto não tem gabarito autorado (só `checks` ou nada): `activityHasRevealableAnswer` é false e o botão do professor nem aparece.';
const UNGRADED_NO_VERDICT =
  'sem juiz: o aluno clica "Concluir" e a activity conclui. Não existe certo nem errado a desenhar.';
const READ_NO_ANSWER = 'leitura: o aluno lê e segue — não existe resposta a produzir.';
const REFLECT_NO_GRADE =
  'o juiz é a CONTAGEM de palavras: abaixo do mínimo o envio fica travado, acima dele conclui. Não existe veredito de certo/errado.';
const QUESTION_KIND_NO_REVEAL =
  'não há gabarito: o kind não corrige, e o componente não recebe `reveal` (como a `question`).';
const BYOC_NOT_LIVE =
  'como o `concept` hospedeiro das rows BYOC, o kind não é respondível ao vivo (`isAnswerableLiveKind` false): sem timer, nada a travar.';
const BYOC_STATES_IN_TREE =
  'o estado intermediário vive na ÁRVORE gerada (`ByocTree`), coberto no fluxo de duas etapas (`--default`); uma story isolada dele seria a árvore sem a geração.';
const BYOC_VERDICT_IN_FLOW =
  'o veredito sai da árvore gerada, conferida contra o gabarito que a geração embute (ADR-13); o fluxo `--default` leva até ele com a geração mockada. Não há story que chegue ao veredito sem clicar a árvore inteira.';

const NO_REVEAL_PROP =
  'o dispatcher não propaga `reveal` para este kind e `hasRevealableAnswer` é false — não há gabarito a expor.';
const LOOSE_ZOD =
  'stub LOOSE no Zod (`z.record(z.unknown())`): nenhum objeto é rejeitado, então não existe spec inválido para mostrar. Fechar o schema é do plano irmão `20260728-itera-back-office`.';
const NO_VALIDATION_BOUNDARY =
  'o kind não chama `safeParseActivitySpec` (drift #3 / ADR-5 / ADR-13): um spec inválido atravessa o cast e vai renderizar — não há caminho de erro para colocar numa story. Pertence ao plano irmão `20260728-itera-back-office`.';

const MATRIX: Record<string, Record<CellKey, Cell>> = {
  /* ── 1 · Exposição ──────────────────────────────────────────────────── */
  concept: {
    'A.enabled': { story: 'activities-exposicao-concept--text-only' },
    'A.locked': { story: 'activities-gate-locked--locked-concept' },
    'B.done': {
      na: 'ConceptActivity não tem botão de concluir — o avanço é do shell (player ou professor), então `status:"done"` não muda um pixel.',
    },
    'C.blank': { na: EXPOSITION_NO_ANSWER },
    'C.answered': { na: EXPOSITION_NO_ANSWER },
    'C.submitted': { na: EXPOSITION_NO_ANSWER },
    'D.correct': { na: EXPOSITION_NO_GRADE },
    'D.incorrect': { na: EXPOSITION_NO_GRADE },
    'E.reveal': { na: NO_REVEAL_PROP },
    'F.spec_invalido': { story: 'activities-dispatcher--concept-sem-instrucao' },
    'H.degenerado': {
      na: 'o contrato tem UM campo (`instruction`) e ele é obrigatório no Zod — sem ele o spec é inválido (eixo F), não degenerado.',
    },
  },
  concept_reveal: {
    'A.enabled': { story: 'activities-exposicao-concept-reveal--default' },
    'A.locked': { story: 'activities-gate-locked--locked-concept-reveal' },
    'B.done': {
      na: 'como o `concept`, não há botão de concluir: revelar a resposta não fecha a activity — quem avança é o shell.',
    },
    'C.blank': { story: 'activities-exposicao-concept-reveal--default' },
    'C.answered': {
      na: 'revelar NÃO é responder: o aluno pensa na cabeça e o card abre. Nada é enviado, nada é persistido.',
    },
    'C.submitted': {
      na: 'revelar NÃO é responder: o aluno pensa na cabeça e o card abre. Nada é enviado, nada é persistido.',
    },
    'D.correct': { na: EXPOSITION_NO_GRADE },
    'D.incorrect': { na: EXPOSITION_NO_GRADE },
    'E.reveal': { story: 'activities-exposicao-concept-reveal--ao-vivo' },
    'F.spec_invalido': { story: 'activities-dispatcher--concept-reveal-sem-card' },
    'H.degenerado': {
      na: 'os dois campos (`instruction` e `reveal`) são obrigatórios no Zod — faltando um, o spec é inválido (eixo F), não degenerado.',
    },
  },
  video: {
    'A.enabled': { story: 'activities-exposicao-video--default' },
    'A.locked': { story: 'activities-gate-locked--locked-video' },
    'B.done': { story: 'activities-exposicao-video--completed-disabled' },
    'C.blank': { na: EXPOSITION_NO_ANSWER },
    'C.answered': { na: EXPOSITION_NO_ANSWER },
    'C.submitted': { na: EXPOSITION_NO_ANSWER },
    'D.correct': { na: EXPOSITION_NO_GRADE },
    'D.incorrect': { na: EXPOSITION_NO_GRADE },
    'E.reveal': { na: NO_REVEAL_PROP },
    'F.spec_invalido': { story: 'activities-dispatcher--video-sem-url' },
    'H.degenerado': { story: 'activities-exposicao-video--default' },
  },
  diagram: {
    'A.enabled': { story: 'activities-exposicao-diagram--mermaid' },
    'A.locked': { story: 'activities-gate-locked--locked-diagram' },
    'B.done': { story: 'activities-exposicao-diagram--concluida' },
    'C.blank': { na: EXPOSITION_NO_ANSWER },
    'C.answered': { na: EXPOSITION_NO_ANSWER },
    'C.submitted': { na: EXPOSITION_NO_ANSWER },
    'D.correct': { na: EXPOSITION_NO_GRADE },
    'D.incorrect': { na: EXPOSITION_NO_GRADE },
    'E.reveal': { na: NO_REVEAL_PROP },
    'F.spec_invalido': { drift: LOOSE_ZOD },
    'H.degenerado': { story: 'activities-dispatcher--diagram-sem-fonte' },
  },
  document: {
    'A.enabled': { story: 'activities-exposicao-document-leitura--leitura' },
    'A.locked': { story: 'activities-gate-locked--locked-document-leitura' },
    'B.done': { story: 'activities-exposicao-document-leitura--concluida' },
    'C.blank': { story: 'activities-producao-document-redacao--com-minimo-de-palavras' },
    'C.answered': { story: 'activities-producao-document-redacao--rascunho-curto' },
    'C.submitted': { story: 'activities-producao-document-redacao--redacao-enviada' },
    'D.correct': {
      na: 'o `document` é contrato de CONCLUSÃO, não de correção — a Fase 1 confirmou que ele não deriva o tuple de grading. O único caminho graduado é `rubric.mode:"ai-judge"`, que exige `iteraApiConfigured()` → tier T3.',
    },
    'D.incorrect': {
      na: 'idem `D.correct` — o document não produz veredito de correção fora do caminho `ai-judge`.',
    },
    'E.reveal': { na: NO_REVEAL_PROP },
    'F.spec_invalido': { drift: LOOSE_ZOD },
    'H.degenerado': { story: 'activities-dispatcher--document-sem-corpo' },
  },

  /* ── 2 · Escolha ────────────────────────────────────────────────────── */
  single_choice: {
    'A.enabled': { story: 'activities-escolha-single-choice--default' },
    'A.locked': { story: 'activities-gate-locked--locked-single-choice' },
    'B.done': { story: 'activities-escolha-single-choice--disabled' },
    'C.blank': { story: 'activities-escolha-single-choice--default' },
    'C.answered': { story: 'activities-escolha-single-choice--answered' },
    'C.submitted': { story: 'activities-escolha-single-choice--correct' },
    'D.correct': { story: 'activities-escolha-single-choice--correct' },
    'D.incorrect': { story: 'activities-escolha-single-choice--incorrect' },
    'E.reveal': { story: 'activities-dispatcher--reveal-single-choice' },
    'F.spec_invalido': { drift: NO_VALIDATION_BOUNDARY },
    'H.degenerado': { story: 'activities-dispatcher--single-choice-sem-enunciado' },
  },
  multi_choice: {
    'A.enabled': { story: 'activities-escolha-multi-choice--default' },
    'A.locked': { story: 'activities-gate-locked--locked-multi-choice' },
    'B.done': { story: 'activities-escolha-multi-choice--disabled' },
    'C.blank': { story: 'activities-escolha-multi-choice--default' },
    'C.answered': { story: 'activities-escolha-multi-choice--answered' },
    'C.submitted': { story: 'activities-escolha-multi-choice--correct' },
    'D.correct': { story: 'activities-escolha-multi-choice--correct' },
    'D.incorrect': { story: 'activities-escolha-multi-choice--incorrect' },
    'E.reveal': { story: 'activities-dispatcher--reveal-multi-choice' },
    'F.spec_invalido': { drift: NO_VALIDATION_BOUNDARY },
    'H.degenerado': { story: 'activities-dispatcher--multi-choice-sem-enunciado' },
  },
  quiz: {
    'A.enabled': { story: 'activities-escolha-quiz--verdadeiro-ou-falso' },
    'A.locked': { story: 'activities-gate-locked--locked-quiz' },
    'B.done': { story: 'activities-escolha-quiz--concluida' },
    'C.blank': { story: 'activities-escolha-quiz--verdadeiro-ou-falso' },
    'C.answered': { story: 'activities-escolha-quiz--answered' },
    'C.submitted': { story: 'activities-escolha-quiz--correct' },
    'D.correct': { story: 'activities-escolha-quiz--correct' },
    'D.incorrect': { story: 'activities-escolha-quiz--incorrect' },
    'E.reveal': {
      drift:
        '`hasRevealableAnswer("quiz")` é TRUE, então o controle "Revelar resposta" APARECE para o professor num quiz — mas o dispatcher não passa `reveal` para `QuizActivity`, que ainda fixa `reveal:false`. O botão existe e não faz nada: é o mesmo formato do bug que originou a separação `isAnswerableLiveKind` × `hasRevealableAnswer`. Mudança de produção — fora do escopo de um PR de stories/testes.',
    },
    'F.spec_invalido': { drift: NO_VALIDATION_BOUNDARY },
    'H.degenerado': { story: 'activities-escolha-quiz--sem-opcoes' },
  },

  /* ── 3 · Associação · 4 · Ordenação ─────────────────────────────────── */
  match: {
    'A.enabled': { story: 'activities-associacao-match--default' },
    'A.locked': { story: 'activities-gate-locked--locked-match' },
    'B.done': { story: 'activities-associacao-match--disabled' },
    'C.blank': { story: 'activities-associacao-match--default' },
    'C.answered': { story: 'activities-associacao-match--partially-connected' },
    'C.submitted': { story: 'activities-associacao-match--correct' },
    'D.correct': { story: 'activities-associacao-match--correct' },
    'D.incorrect': { story: 'activities-associacao-match--incorrect' },
    'E.reveal': { story: 'activities-dispatcher--reveal-match' },
    'F.spec_invalido': { drift: NO_VALIDATION_BOUNDARY },
    'H.degenerado': { story: 'activities-dispatcher--match-sem-enunciado' },
  },
  order: {
    'A.enabled': { story: 'activities-ordenacao-order--default' },
    'A.locked': { story: 'activities-gate-locked--locked-order' },
    'B.done': { story: 'activities-ordenacao-order--disabled' },
    'C.blank': { story: 'activities-ordenacao-order--default' },
    'C.answered': { story: 'activities-ordenacao-order--answered' },
    'C.submitted': { story: 'activities-ordenacao-order--correct' },
    'D.correct': { story: 'activities-ordenacao-order--correct' },
    'D.incorrect': { story: 'activities-ordenacao-order--incorrect' },
    'E.reveal': { story: 'activities-dispatcher--reveal-order' },
    'F.spec_invalido': { drift: NO_VALIDATION_BOUNDARY },
    'H.degenerado': { story: 'activities-dispatcher--order-sem-enunciado' },
  },

  /* ── 5 · Produção ───────────────────────────────────────────────────── */
  code: {
    'A.enabled': { story: 'activities-producao-code--default' },
    'A.locked': { story: 'activities-gate-locked--locked-code' },
    'B.done': { story: 'activities-producao-code--concluida' },
    'C.blank': { story: 'activities-producao-code--default' },
    'C.answered': {
      deferred: 'browser-input',
      why: 'digitar DENTRO do Monaco. Foi tentado no projeto de browser e não foi obtido: o editor lê do seu modelo interno, não do `<textarea>` que ele deixa no DOM, então teclado sintético não altera nada — só a API do Monaco alteraria, e aí o teste estaria dirigindo o editor por dentro em vez de dirigir a UI. `CodeSnackActivity.test.tsx` cobre "digitou → autosave" com o CodeEditor mockado; o que falta é a digitação no editor real.',
    },
    'C.submitted': { story: 'activities-producao-code--browser-checks-passam' },
    'D.correct': { story: 'activities-producao-code--browser-checks-passam' },
    'D.incorrect': { story: 'activities-producao-code--browser-checks-falham' },
    // A pergunta é pela LINHA, não pelo kind (`activityHasRevealableAnswer`): o
    // guiado tem `blanks[].answer` e revela; o editor aberto só tem `checks` e
    // segue sem botão. A story cobre a metade que existe.
    'E.reveal': { story: 'activities-producao-code-guiado--reveal-guiado' },
    'F.spec_invalido': { story: 'activities-producao-code--espec-invalida' },
    'H.degenerado': { story: 'activities-producao-code--sem-starter' },
  },

  /* ── 6 · Cenário com IA ─────────────────────────────────────────────── */
  chat_sandbox: {
    'A.enabled': { story: 'activities-dispatcher--chat-sandbox' },
    'A.locked': { story: 'activities-gate-locked--locked-chat-sandbox' },
    'B.done': { story: 'activities-ia-sandbox-aberta--concluida' },
    'C.blank': { story: 'activities-ia-sandbox-aberta--open-chat' },
    'C.answered': { story: 'activities-ia-sandbox-aberta--prompt-composto' },
    'C.submitted': { story: 'activities-ia-sandbox-aberta--resposta-recebida' },
    'D.correct': { story: 'activities-ia-sandbox-aberta--avaliada-corretamente' },
    'D.incorrect': { story: 'activities-ia-sandbox-aberta--avaliada-incorretamente' },
    'E.reveal': { story: 'activities-dispatcher--reveal-chat-sandbox' },
    'F.spec_invalido': { story: 'activities-dispatcher--chat-sandbox-espec-invalida' },
    'H.degenerado': { story: 'activities-ia-sandbox-aberta--open-chat' },
  },

  /**
   * O terminal tem vitrine PRÓPRIA (`activities-sandbox-terminal--*`). O que
   * falta é o eixo de interação, e ele falta porque uma story é estado inicial
   * — ver `terminal-input` no cabeçalho.
   */
  terminal_sandbox: {
    'A.enabled': { story: 'activities-dispatcher--terminal-sandbox' },
    'A.locked': { story: 'activities-gate-locked--locked-terminal-sandbox' },
    'B.done': { story: 'activities-sandbox-terminal--free-text-ordered-sequence' },
    'C.blank': { story: 'activities-sandbox-terminal--free-text-single-command' },
    'C.answered': { deferred: 'terminal-input', why: TERMINAL_NEEDS_TYPING },
    'C.submitted': { deferred: 'terminal-input', why: TERMINAL_NEEDS_TYPING },
    'D.correct': { deferred: 'terminal-input', why: TERMINAL_NEEDS_TYPING },
    'D.incorrect': { deferred: 'terminal-input', why: TERMINAL_NEEDS_TYPING },
    'E.reveal': { story: 'activities-sandbox-terminal--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-dispatcher--terminal-sandbox-espec-invalida' },
    'H.degenerado': { story: 'activities-sandbox-terminal--engineless-generic-terminal' },
  },
  /* ── 7 · Consulta ───────────────────────────────────────────────────── */
  /*
   * `question` é o primeiro kind cuja linha tem `D` inteiro em `na` POR
   * DEFINIÇÃO e não por falta de tela: ele não corrige nada. Os kinds de
   * exposição também têm, mas por não terem resposta — aqui existe resposta, e
   * mesmo assim não existe veredito. É a única linha da matriz onde `C.submitted`
   * está coberta e `D` não, e essa assimetria é o kind inteiro.
   */
  question: {
    'A.enabled': { story: 'activities-consulta-question--default' },
    'A.locked': { story: 'activities-gate-locked--locked-question' },
    'B.done': { story: 'activities-consulta-question--disabled' },
    'C.blank': { story: 'activities-consulta-question--default' },
    'C.answered': { story: 'activities-consulta-question--answered' },
    'C.submitted': { story: 'activities-consulta-question--submitted' },
    'D.correct': { na: QUESTION_NO_GRADE },
    'D.incorrect': { na: QUESTION_NO_GRADE },
    'E.reveal': {
      na:
        'não há gabarito a revelar: `recommended_option_id` é a preferência de QUEM PERGUNTA, e pô-la no projetor como "a resposta" é exatamente a mentira que o kind existe pra evitar. `hasRevealableAnswer` devolve false e o componente nem aceita a prop `reveal`.',
    },
    'F.spec_invalido': { story: 'activities-dispatcher--question-sem-modo' },
    'H.degenerado': { story: 'activities-dispatcher--question-minima' },
  },

  /* ── 8 · Um comportamento por kind (plano 20260924-activity-type-one-behavior-rule) ──
   * Cada kind novo é UM comportamento de um kind acima. As linhas de
   * comportamento do T4 (`BEHAVIOUR_MATRIX`) MUDARAM para cá quando o kind
   * nasceu, apontando agora para o arquivo de stories DO KIND. */
  code_editor_checks: {
    'A.enabled': { story: 'activities-code-editor-checks--default' },
    'A.locked': { story: 'activities-gate-locked--locked-code-editor-checks' },
    'B.done': { story: 'activities-code-editor-checks--concluida' },
    'C.blank': { story: 'activities-code-editor-checks--default' },
    'C.answered': { deferred: 'browser-input', why: MONACO_INPUT },
    'C.submitted': { deferred: 'browser-input', why: CHECKS_IN_IFRAME },
    'D.correct': { deferred: 'browser-input', why: CHECKS_IN_IFRAME },
    'D.incorrect': { deferred: 'browser-input', why: CHECKS_IN_IFRAME },
    'E.reveal': { na: EDITOR_NO_SOLUTION },
    'F.spec_invalido': { story: 'activities-code-editor-checks--espec-invalida' },
    'H.degenerado': { na: NO_DEGENERATE_SHAPE },
  },
  code_editor_ungraded: {
    'A.enabled': { story: 'activities-code-editor-ungraded--default' },
    'A.locked': { story: 'activities-gate-locked--locked-code-editor-ungraded' },
    'B.done': { story: 'activities-code-editor-ungraded--concluida' },
    'C.blank': { story: 'activities-code-editor-ungraded--default' },
    'C.answered': { deferred: 'browser-input', why: MONACO_INPUT },
    'C.submitted': { story: 'activities-code-editor-ungraded--marcada-concluida' },
    'D.correct': { na: UNGRADED_NO_VERDICT },
    'D.incorrect': { na: UNGRADED_NO_VERDICT },
    'E.reveal': { na: EDITOR_NO_SOLUTION },
    'F.spec_invalido': { story: 'activities-code-editor-ungraded--espec-invalida' },
    'H.degenerado': { story: 'activities-code-editor-ungraded--sem-starter' },
  },
  code_fill_bank: {
    'A.enabled': { story: 'activities-code-fill-bank--default' },
    'A.locked': { story: 'activities-gate-locked--locked-code-fill-bank' },
    'B.done': { story: 'activities-code-fill-bank--concluida' },
    'C.blank': { story: 'activities-code-fill-bank--default' },
    'C.answered': { story: 'activities-code-fill-bank--preenchida' },
    'C.submitted': { story: 'activities-code-fill-bank--certa' },
    'D.correct': { story: 'activities-code-fill-bank--certa' },
    'D.incorrect': { story: 'activities-code-fill-bank--errada' },
    'E.reveal': { story: 'activities-code-fill-bank--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-code-fill-bank--espec-invalida' },
    'H.degenerado': { na: NO_DEGENERATE_SHAPE },
  },
  code_fill_select: {
    'A.enabled': { story: 'activities-code-fill-select--default' },
    'A.locked': { story: 'activities-gate-locked--locked-code-fill-select' },
    'B.done': { story: 'activities-code-fill-select--concluida' },
    'C.blank': { story: 'activities-code-fill-select--default' },
    'C.answered': { story: 'activities-code-fill-select--preenchida' },
    'C.submitted': { story: 'activities-code-fill-select--certa' },
    'D.correct': { story: 'activities-code-fill-select--certa' },
    'D.incorrect': { story: 'activities-code-fill-select--errada' },
    'E.reveal': { story: 'activities-code-fill-select--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-code-fill-select--espec-invalida' },
    'H.degenerado': { na: NO_DEGENERATE_SHAPE },
  },
  code_fill_type: {
    'A.enabled': { story: 'activities-code-fill-type--default' },
    'A.locked': { story: 'activities-gate-locked--locked-code-fill-type' },
    'B.done': { story: 'activities-code-fill-type--concluida' },
    'C.blank': { story: 'activities-code-fill-type--default' },
    'C.answered': { story: 'activities-code-fill-type--preenchida' },
    'C.submitted': { story: 'activities-code-fill-type--certa' },
    'D.correct': { story: 'activities-code-fill-type--certa' },
    'D.incorrect': { story: 'activities-code-fill-type--errada' },
    'E.reveal': { story: 'activities-code-fill-type--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-code-fill-type--espec-invalida' },
    'H.degenerado': { na: NO_DEGENERATE_SHAPE },
  },
  chat_compose: {
    'A.enabled': { story: 'activities-chat-compose--default' },
    'A.locked': { story: 'activities-gate-locked--locked-chat-compose' },
    'B.done': { story: 'activities-chat-compose--concluida' },
    'C.blank': { story: 'activities-chat-compose--default' },
    'C.answered': { story: 'activities-chat-compose--composto' },
    'C.submitted': { story: 'activities-chat-compose--enviado' },
    'D.correct': { story: 'activities-chat-compose--enviado' },
    'D.incorrect': { na: COMPOSE_NO_WRONG_SEND },
    'E.reveal': { story: 'activities-chat-compose--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-chat-compose--espec-invalida' },
    'H.degenerado': { na: NO_DEGENERATE_SHAPE },
  },
  chat_fill_select: {
    'A.enabled': { story: 'activities-chat-fill-select--default' },
    'A.locked': { story: 'activities-gate-locked--locked-chat-fill-select' },
    'B.done': { story: 'activities-chat-fill-select--concluida' },
    'C.blank': { story: 'activities-chat-fill-select--default' },
    'C.answered': { story: 'activities-chat-fill-select--composto' },
    'C.submitted': { story: 'activities-chat-fill-select--enviado' },
    'D.correct': { story: 'activities-chat-fill-select--enviado' },
    'D.incorrect': { na: COMPOSE_NO_WRONG_SEND },
    'E.reveal': { story: 'activities-chat-fill-select--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-chat-fill-select--espec-invalida' },
    'H.degenerado': { na: NO_DEGENERATE_SHAPE },
  },
  chat_fill_type: {
    'A.enabled': { story: 'activities-chat-fill-type--default' },
    'A.locked': { story: 'activities-gate-locked--locked-chat-fill-type' },
    'B.done': { story: 'activities-chat-fill-type--concluida' },
    'C.blank': { story: 'activities-chat-fill-type--default' },
    'C.answered': { story: 'activities-chat-fill-type--composto' },
    'C.submitted': { story: 'activities-chat-fill-type--enviado' },
    'D.correct': { story: 'activities-chat-fill-type--enviado' },
    'D.incorrect': { na: COMPOSE_NO_WRONG_SEND },
    'E.reveal': { story: 'activities-chat-fill-type--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-chat-fill-type--espec-invalida' },
    'H.degenerado': { na: NO_DEGENERATE_SHAPE },
  },
  chat_pick_context: {
    'A.enabled': { story: 'activities-chat-pick-context--default' },
    'A.locked': { story: 'activities-gate-locked--locked-chat-pick-context' },
    'B.done': { story: 'activities-chat-pick-context--concluida' },
    'C.blank': { story: 'activities-chat-pick-context--default' },
    'C.answered': { story: 'activities-chat-pick-context--composto' },
    'C.submitted': { story: 'activities-chat-pick-context--enviado' },
    'D.correct': { story: 'activities-chat-pick-context--enviado' },
    'D.incorrect': { story: 'activities-chat-pick-context--envio-fraco' },
    'E.reveal': { story: 'activities-chat-pick-context--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-chat-pick-context--espec-invalida' },
    'H.degenerado': { na: NO_DEGENERATE_SHAPE },
  },
  chat_rate_reply: {
    'A.enabled': { story: 'activities-chat-rate-reply--default' },
    'A.locked': { story: 'activities-gate-locked--locked-chat-rate-reply' },
    'B.done': { story: 'activities-chat-rate-reply--concluida' },
    'C.blank': { story: 'activities-chat-rate-reply--default' },
    'C.answered': {
      na: 'avaliar é UM toque, e o toque já envia: não existe "avaliou e não enviou". A resposta a avaliar já está na tela desde a montagem (a execução semeada, T25).',
    },
    'C.submitted': { story: 'activities-chat-rate-reply--avaliada-corretamente' },
    'D.correct': { story: 'activities-chat-rate-reply--avaliada-corretamente' },
    'D.incorrect': { story: 'activities-chat-rate-reply--avaliada-incorretamente' },
    'E.reveal': { story: 'activities-chat-rate-reply--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-chat-rate-reply--espec-invalida' },
    'H.degenerado': { na: NO_DEGENERATE_SHAPE },
  },
  terminal_type_command: {
    'A.enabled': { story: 'activities-terminal-type-command--default' },
    'A.locked': { story: 'activities-gate-locked--locked-terminal-type-command' },
    'B.done': { story: 'activities-terminal-type-command--concluida' },
    'C.blank': { story: 'activities-terminal-type-command--default' },
    'C.answered': { deferred: 'terminal-input', why: TERMINAL_NEEDS_TYPING },
    'C.submitted': { deferred: 'terminal-input', why: TERMINAL_NEEDS_TYPING },
    'D.correct': { deferred: 'terminal-input', why: TERMINAL_NEEDS_TYPING },
    'D.incorrect': { deferred: 'terminal-input', why: TERMINAL_NEEDS_TYPING },
    'E.reveal': { story: 'activities-terminal-type-command--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-terminal-type-command--espec-invalida' },
    'H.degenerado': { story: 'activities-terminal-type-command--sem-motor' },
  },
  terminal_pick_command: {
    'A.enabled': { story: 'activities-terminal-pick-command--default' },
    'A.locked': { story: 'activities-gate-locked--locked-terminal-pick-command' },
    'B.done': { story: 'activities-terminal-pick-command--concluida' },
    'C.blank': { story: 'activities-terminal-pick-command--default' },
    'C.answered': { na: TERMINAL_TAP_RUNS },
    'C.submitted': { story: 'activities-terminal-pick-command--comando-certo' },
    'D.correct': { story: 'activities-terminal-pick-command--comando-certo' },
    'D.incorrect': { story: 'activities-terminal-pick-command--comando-errado' },
    'E.reveal': { story: 'activities-terminal-pick-command--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-terminal-pick-command--espec-invalida' },
    'H.degenerado': { na: NO_DEGENERATE_SHAPE },
  },
  terminal_build_command: {
    'A.enabled': { story: 'activities-terminal-build-command--default' },
    'A.locked': { story: 'activities-gate-locked--locked-terminal-build-command' },
    'B.done': { story: 'activities-terminal-build-command--concluida' },
    'C.blank': { story: 'activities-terminal-build-command--default' },
    'C.answered': { story: 'activities-terminal-build-command--linha-montada' },
    'C.submitted': { story: 'activities-terminal-build-command--linha-certa' },
    'D.correct': { story: 'activities-terminal-build-command--linha-certa' },
    'D.incorrect': { story: 'activities-terminal-build-command--linha-errada' },
    'E.reveal': { story: 'activities-terminal-build-command--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-terminal-build-command--espec-invalida' },
    'H.degenerado': { na: NO_DEGENERATE_SHAPE },
  },
  document_read: {
    'A.enabled': { story: 'activities-document-read--leitura' },
    'A.locked': { story: 'activities-gate-locked--locked-document-read' },
    'B.done': {
      na: 'como o `concept`, não há botão de concluir — o avanço é do shell, então `status:"done"` não muda um pixel.',
    },
    'C.blank': { na: READ_NO_ANSWER },
    'C.answered': { na: READ_NO_ANSWER },
    'C.submitted': { na: READ_NO_ANSWER },
    'D.correct': { na: EXPOSITION_NO_GRADE },
    'D.incorrect': { na: EXPOSITION_NO_GRADE },
    'E.reveal': { na: NO_REVEAL_PROP },
    'F.spec_invalido': { story: 'activities-document-read--espec-invalida' },
    'H.degenerado': { story: 'activities-document-read--sem-corpo' },
  },
  document_reflect: {
    'A.enabled': { story: 'activities-document-reflect--default' },
    'A.locked': { story: 'activities-gate-locked--locked-document-reflect' },
    'B.done': { story: 'activities-document-reflect--concluida' },
    'C.blank': { story: 'activities-document-reflect--default' },
    'C.answered': { story: 'activities-document-reflect--rascunho-curto' },
    'C.submitted': { story: 'activities-document-reflect--enviada' },
    'D.correct': { na: REFLECT_NO_GRADE },
    'D.incorrect': { na: REFLECT_NO_GRADE },
    'E.reveal': { na: NO_REVEAL_PROP },
    'F.spec_invalido': { story: 'activities-document-reflect--espec-invalida' },
    'H.degenerado': { story: 'activities-document-reflect--sem-minimo' },
  },
  /** Era a linha de comportamento `document_ai_judge` do T4, `from: document`. */
  document_ai_judge: {
    'A.enabled': { story: 'activities-document-ai-judge--default' },
    'A.locked': { story: 'activities-document-ai-judge--travada' },
    'B.done': {
      drift:
        '`AiJudgeDocumentActivity` não lê `activity.status`: uma redação já aprovada reabre vazia, com o botão de enviar. É achado de produção (o aluno refaz o trabalho), não falta de story. O kind novo herda o componente; o conserto é do componente, não da divisão.',
    },
    'C.blank': { story: 'activities-document-ai-judge--default' },
    'C.answered': { story: 'activities-document-ai-judge--resposta-escrita' },
    'C.submitted': { story: 'activities-document-ai-judge--aprovada' },
    'D.correct': { story: 'activities-document-ai-judge--aprovada' },
    'D.incorrect': { story: 'activities-document-ai-judge--reprovada' },
    'E.reveal': { na: NO_REVEAL_PROP },
    // Fechou (T12): o kind valida na fronteira e recusa uma avaliação por
    // contagem de palavras — era `drift: LOOSE_ZOD` na linha de comportamento.
    'F.spec_invalido': { story: 'activities-document-ai-judge--espec-invalida' },
    // Fechou (T12): sem a porta de juiz o kind mostra "indisponível", não a
    // reflexão — era o `drift` "o host escolhe o comportamento".
    'H.degenerado': { story: 'activities-document-ai-judge--sem-porta-de-juiz' },
  },
  byoc_pick_best: {
    'A.enabled': { story: 'activities-byoc-pick-best--default' },
    'A.locked': { na: BYOC_NOT_LIVE },
    'B.done': { story: 'activities-byoc-pick-best--concluida' },
    'C.blank': { story: 'activities-byoc-pick-best--default' },
    'C.answered': { na: BYOC_STATES_IN_TREE },
    'C.submitted': { story: 'activities-byoc-pick-best--retornando' },
    'D.correct': { deferred: 'fase-3', why: BYOC_VERDICT_IN_FLOW },
    'D.incorrect': { deferred: 'fase-3', why: BYOC_VERDICT_IN_FLOW },
    'E.reveal': { story: 'activities-byoc-pick-best--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-byoc-pick-best--espec-invalida' },
    'H.degenerado': { story: 'activities-byoc-pick-best--sem-itera' },
  },
  byoc_judge_each: {
    'A.enabled': { story: 'activities-byoc-judge-each--default' },
    'A.locked': { na: BYOC_NOT_LIVE },
    'B.done': { story: 'activities-byoc-judge-each--concluida' },
    'C.blank': { story: 'activities-byoc-judge-each--default' },
    'C.answered': { na: BYOC_STATES_IN_TREE },
    'C.submitted': { story: 'activities-byoc-judge-each--retornando' },
    'D.correct': { deferred: 'fase-3', why: BYOC_VERDICT_IN_FLOW },
    'D.incorrect': { deferred: 'fase-3', why: BYOC_VERDICT_IN_FLOW },
    'E.reveal': { story: 'activities-byoc-judge-each--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-byoc-judge-each--espec-invalida' },
    'H.degenerado': { story: 'activities-byoc-judge-each--sem-itera' },
  },
  byoc_build_context: {
    'A.enabled': { story: 'activities-byoc-build-context--default' },
    'A.locked': { na: BYOC_NOT_LIVE },
    'B.done': { story: 'activities-byoc-build-context--concluida' },
    'C.blank': { story: 'activities-byoc-build-context--default' },
    'C.answered': { na: BYOC_STATES_IN_TREE },
    'C.submitted': { story: 'activities-byoc-build-context--retornando' },
    'D.correct': { na: 'não há certo nem errado: chegar ao fim da construção É o acerto (como na árvore `build_context`).' },
    'D.incorrect': { na: 'não há certo nem errado: chegar ao fim da construção É o acerto (como na árvore `build_context`).' },
    'E.reveal': { story: 'activities-byoc-build-context--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-byoc-build-context--espec-invalida' },
    'H.degenerado': { story: 'activities-byoc-build-context--sem-itera' },
  },
  question_pick_one: {
    'A.enabled': { story: 'activities-question-pick-one--default' },
    'A.locked': { story: 'activities-gate-locked--locked-question-pick-one' },
    'B.done': { story: 'activities-question-pick-one--concluida' },
    'C.blank': { story: 'activities-question-pick-one--default' },
    'C.answered': { story: 'activities-question-pick-one--respondida' },
    'C.submitted': { story: 'activities-question-pick-one--enviada' },
    'D.correct': { na: QUESTION_NO_GRADE },
    'D.incorrect': { na: QUESTION_NO_GRADE },
    'E.reveal': { na: QUESTION_KIND_NO_REVEAL },
    'F.spec_invalido': { story: 'activities-question-pick-one--espec-invalida' },
    'H.degenerado': { na: NO_DEGENERATE_SHAPE },
  },
  question_pick_many: {
    'A.enabled': { story: 'activities-question-pick-many--default' },
    'A.locked': { story: 'activities-gate-locked--locked-question-pick-many' },
    'B.done': { story: 'activities-question-pick-many--concluida' },
    'C.blank': { story: 'activities-question-pick-many--default' },
    'C.answered': { story: 'activities-question-pick-many--respondida' },
    'C.submitted': { story: 'activities-question-pick-many--enviada' },
    'D.correct': { na: QUESTION_NO_GRADE },
    'D.incorrect': { na: QUESTION_NO_GRADE },
    'E.reveal': { na: QUESTION_KIND_NO_REVEAL },
    'F.spec_invalido': { story: 'activities-question-pick-many--espec-invalida' },
    'H.degenerado': { na: NO_DEGENERATE_SHAPE },
  },
  question_write: {
    'A.enabled': { story: 'activities-question-write--default' },
    'A.locked': { story: 'activities-gate-locked--locked-question-write' },
    'B.done': { story: 'activities-question-write--concluida' },
    'C.blank': { story: 'activities-question-write--default' },
    'C.answered': { story: 'activities-question-write--respondida' },
    'C.submitted': { story: 'activities-question-write--enviada' },
    'D.correct': { na: QUESTION_NO_GRADE },
    'D.incorrect': { na: QUESTION_NO_GRADE },
    'E.reveal': { na: QUESTION_KIND_NO_REVEAL },
    'F.spec_invalido': { story: 'activities-question-write--espec-invalida' },
    'H.degenerado': { na: NO_DEGENERATE_SHAPE },
  },
};

/**
 * LINHAS POR COMPORTAMENTO — VAZIA desde que os kinds nasceram.
 *
 * Plano `20260924-activity-type-one-behavior-rule`, T4 abriu aqui cinco linhas
 * com o NOME DO KIND FUTURO (`chat_pick_context`, `chat_fill_select`,
 * `terminal_pick_command`, `terminal_build_command`, `document_ai_judge`) e o
 * kind de hoje em `from`. T9–T14 fizeram os kinds nascer, e as cinco MUDARAM
 * para a `MATRIX` acima, como o teste abaixo exige. O registro fica, vazio, para
 * a próxima vez que um kind esconder um comportamento que a produção usa.
 */
const BEHAVIOUR_MATRIX: Record<string, { from: string; row: Record<CellKey, Cell> }> = {};

/**
 * O NÚMERO. Snapshot da distribuição das 396 células (36 kinds × 11 células; a
 * `BEHAVIOUR_MATRIX` está vazia desde T9–T14).
 *
 * Ele é assertado de propósito: mexer na cobertura tem que ser um ato
 * consciente, com o novo número escrito à mão aqui. Subir `covered` (ou baixar
 * `deferred`) é a Fase 3 fazendo efeito; subir `drift` sem discussão é sinal.
 *
 * Histórico:
 *   Fase 2       → { covered: 75, na: 24, deferred: 14, drift: 8 }
 *   Fase 3 (PR A)→ { covered: 85, na: 24, deferred:  4, drift: 8 }
 *   Fase 3 (PR B)→ { covered: 88, na: 24, deferred:  1, drift: 8 }
 *   concept_reveal→{ covered: 93, na: 30, deferred:  1, drift: 8 }  (12º kind)
 *   0.11.0        →{ covered: 104, sameScreen: 7, na: 30, deferred: 5, drift: 8 }
 *                  (o kind único de sandbox partido em `chat_sandbox` +
 *                  `terminal_sandbox`; +11 cobertas de verdade, +7 declaradas
 *                  como a mesma tela e +4 de dívida do terminal que a linha
 *                  única escondia)
 *   1.0.0         →{ covered: 100, na: 30, deferred: 5, drift: 8 }
 *                  (o kind único saiu do enum; as 7 células `sameScreen` do
 *                  chat viraram cobertura própria, porque as stories que elas
 *                  apontavam agora SÃO `chat_sandbox`)
 *
 *   question      →{ covered: 109, na: 32, deferred: 5, drift: 8 }  (14º kind,
 *                  2026-08-28). +8 cobertas e +3 `na`. As três `na` NÃO são
 *                  dívida: `D.correct`, `D.incorrect` e `E.reveal` não existem
 *                  num kind sem resposta certa, e declará-las cobertas exigiria
 *                  inventar um veredito.
 *
 *   comportamentos→{ covered: 155, na: 38, deferred: 5, drift: 11 }  (2026-09-24,
 *                  plano `20260924-activity-type-one-behavior-rule`, T4). +5
 *                  linhas de COMPORTAMENTO (`BEHAVIOUR_MATRIX`), 55 células:
 *                  +46 cobertas, +6 `na`, +3 `drift` — as três do
 *                  `document_ai_judge` (não lê `status`, schema LOOSE, e o host
 *                  troca de comportamento sem a porta de juiz). O total passa a
 *                  ser (kinds + comportamentos) × 11.
 *
 *   um comportamento por kind →{ covered: 286, na: 83, deferred: 18, drift: 9 }
 *                  (2026-09-27, plano `20260924-activity-type-one-behavior-rule`,
 *                  T9–T14). 36 kinds × 11 = 396 células: os 22 kinds novos
 *                  entraram na `MATRIX` com um arquivo de stories cada, e as 5
 *                  linhas de comportamento do T4 mudaram para as linhas dos
 *                  kinds (a `BEHAVIOUR_MATRIX` ficou vazia). `drift` CAIU de 11
 *                  para 9: dois dos três achados do `document_ai_judge` fecharam
 *                  no kind — o spec agora é validado (F) e sem a porta de juiz o
 *                  kind mostra "indisponível" em vez de virar reflexão (H). O
 *                  terceiro (B.done: o componente não lê `status`) é do
 *                  componente e continua `drift`. `deferred` subiu 13, todos com
 *                  o motivo técnico da linha de origem: Monaco/iframe no editor
 *                  (5, `browser-input`), digitação no terminal (4,
 *                  `terminal-input`) e o veredito BYOC que só existe no fim da
 *                  árvore gerada (4, `fase-3`).
 *
 * As 10 células que viraram: `quiz` C.answered/C.submitted/D.correct/D.incorrect
 * (a activity herói, que não tinha NENHUM estado de resposta), `document`
 * C.answered/C.submitted (rascunho abaixo do `min_words` × redação enviada) e
 * o sandbox de chat C.answered/C.submitted/D.correct/D.incorrect (o
 * passo-a-passo do `ChatModel`). TODAS produzidas por interação real, nenhuma
 * por prop nova — que era exatamente a condição do ADR-4.
 *
 * O PR B (browser mode, ADR-8) fechou 3 das 4 do `code` — `C.submitted`,
 * `D.correct` e `D.incorrect` — com o iframe de preview EXECUTANDO o código do
 * aluno e avaliando os `checks` contra o DOM que ele produziu. Isso é
 * literalmente impossível em jsdom, que não roda iframe.
 *
 * Sobra UMA célula não-coberta no repo inteiro: `code · C.answered`. Ela não
 * está adiada por falta de tempo — está declarada `browser-input`, com o motivo
 * técnico escrito na linha. Um número que para em 1 e sabe explicar o 1 vale
 * mais do que um 0 obtido afrouxando a régua.
 */
const COVERAGE_SNAPSHOT = { covered: 286, na: 83, deferred: 18, drift: 9 };

/**
 * BYOC AO VIVO — o que não entra nesta matriz, e onde ele é provado.
 *
 * O BYOC live não é um kind do enum: é um CONTRATO dentro dos kinds de sandbox
 * (`isByocLive()`), com máquina própria — `Phase = compose | responding |
 * evaluate | judging | settled`, cruzada com `responderAvailable`,
 * `judgeAvailable` e `error`.
 *
 * Nada disso é alcançável por prop: `SandboxScenarioLiveActivity` aceita apenas
 * `activity`, `onComplete` e `reveal`; todo o resto vive dentro de
 * `useSandboxScenarioLive` e só muda via `send()` / `rate()`. A Fase 2 adiou
 * essas células registrando que alcançá-las numa STORY exigiria injetar o
 * cliente da itera-api como prop — ou seja, a mesma seam de produção que o
 * **ADR-4 congelou e esta fase deletou**.
 *
 * ── COMO A FASE 3 FECHOU, SEM CRIAR A SEAM ─────────────────────────────────
 * Mockando `@/api/iteraApi` no LIMITE DO TESTE (`vi.mock`), não na produção. O
 * hook roda inteiro, de verdade; só a rede é substituída. O preço honesto é
 * que estas fases têm cobertura de TESTE e não de VITRINE: elas não viram
 * story, porque uma story não pode mockar módulo por conta própria. A vitrine
 * mostra o CAMINHO FELIZ — `.storybook/mocks/iteraApi.ts` responde no lugar do
 * modelo. A degradação continua sendo assunto dos testes abaixo, e não da tela.
 */
const BYOC_LIVE_COVERAGE: Record<string, string> = {
  'phase:compose': 'story: activities-ia-sandbox-byoc-live--compose',
  'phase:responding': 'src/test/byocLivePhases.test.tsx — "phase `responding`"',
  'phase:evaluate': 'src/test/SandboxScenarioLive.test.tsx — os 4 cenários binários',
  'phase:judging': 'src/test/byocLivePhases.test.tsx — "phase `judging`"',
  'phase:settled': 'src/test/SandboxScenarioLive.test.tsx — outcome/feedback assertados',
  'degrade:!responderAvailable': 'src/test/SandboxScenarioLive.test.tsx — "responder degraded"',
  'degrade:!judgeAvailable': 'src/test/SandboxScenarioLive.test.tsx — "judge unavailable → UNVERIFIED"',
  'degrade:error': 'src/test/byocLivePhases.test.tsx — respond()/judge() LANÇAM',
};

/**
 * BYOC (contexto do aluno) — as três interações da árvore GERADA.
 *
 * Também não entra na matriz por kind, e pelo mesmo motivo do bloco acima: BYOC
 * é camada (`spec.byoc`) sobre um kind hospedeiro, então uma linha aqui seria um
 * 13º kind que o enum não tem. O que precisa ser garantido é outra coisa: que
 * cada `interaction` do union de `GeneratedChoiceTree` apareça na vitrine no
 * fluxo de DOIS PASSOS, porque a queixa que originou isto foi exatamente ver o
 * passo 1 no Storybook e o passo 2 em lugar nenhum. Antes eram dois níveis (a
 * árvore isolada também); a árvore sozinha nunca provou a transição, que é o
 * que faltava, e viver em pasta própria só espalhava o BYOC pela vitrine.
 *
 * `build_context` não tem célula de correção: não há certo nem errado, chegar
 * ao fim É o acerto.
 */
const BYOC_TREE_COVERAGE: Record<GeneratedChoiceTree['interaction'], string> = {
  pick_best: 'activities-ia-byoc--byoc-text-area-pick-best',
  judge_each: 'activities-ia-byoc--byoc-text-area-judge-each',
  build_context: 'activities-ia-byoc--byoc-text-area-tree-pick-best',
};

const STORY_IDS = new Set(indexStories().map((s) => s.id));

describe('guard da matriz de estados das activities (V3)', () => {
  it('todo kind do enum `itera.activity_kind` tem uma linha na matriz', () => {
    expect([...ACTIVITY_KINDS].filter((k) => !(k in MATRIX)).sort()).toEqual([]);
  });

  it('a matriz não declara kind que não existe no enum', () => {
    const known = new Set<string>(ACTIVITY_KINDS);
    expect(Object.keys(MATRIX).filter((k) => !known.has(k)).sort()).toEqual([]);
  });

  it.each(Object.keys(MATRIX))('%s declara TODAS as células — nenhuma omissão silenciosa', (kind) => {
    expect(CELLS.filter((c) => !(c in MATRIX[kind]))).toEqual([]);
  });

  it.each(
    [...Object.entries(MATRIX), ...Object.entries(BEHAVIOUR_MATRIX).map(([k, b]) => [k, b.row] as const)].flatMap(
      ([kind, row]) => CELLS.map((cell) => [`${kind} · ${cell}`, row[cell]] as const),
    ),
  )('%s aponta para uma story que existe (ou está declarada n/a · deferred · drift)', (_label, cell) => {
    if ('story' in cell) {
      expect(STORY_IDS.has(cell.story), `story inexistente: ${cell.story}`).toBe(true);
      return;
    }
    // Não-coberta é permitido — mas nunca sem motivo escrito.
    const why = 'na' in cell ? cell.na : 'deferred' in cell ? cell.why : cell.drift;
    expect(why.length).toBeGreaterThan(20);
    if ('deferred' in cell) {
      expect(['fase-3', 'browser-input', 'terminal-input']).toContain(cell.deferred);
    }
  });

  it('a distribuição das células bate com o snapshot declarado', () => {
    const tally = { covered: 0, na: 0, deferred: 0, drift: 0 };
    const rows = [...Object.values(MATRIX), ...Object.values(BEHAVIOUR_MATRIX).map((b) => b.row)];
    for (const row of rows) {
      for (const cell of CELLS) {
        const c = row[cell];
        if ('story' in c) tally.covered += 1;
        else if ('na' in c) tally.na += 1;
        else if ('deferred' in c) tally.deferred += 1;
        else tally.drift += 1;
      }
    }
    const total = rows.length * CELLS.length;
    expect(tally.covered + tally.na + tally.deferred + tally.drift).toBe(total);
    expect(tally).toEqual(COVERAGE_SNAPSHOT);
  });

  it.each(Object.keys(BEHAVIOUR_MATRIX))(
    'o comportamento %s declara TODAS as células — nenhuma omissão silenciosa',
    (behaviour) => {
      expect(CELLS.filter((c) => !(c in BEHAVIOUR_MATRIX[behaviour].row))).toEqual([]);
    },
  );

  it('toda linha de comportamento vem de um kind da matriz (o kind de HOJE)', () => {
    const orphans = Object.entries(BEHAVIOUR_MATRIX)
      .filter(([, b]) => !(b.from in MATRIX))
      .map(([k]) => k);
    expect(orphans).toEqual([]);
  });

  it('linha de comportamento que virou kind do enum MUDA para a MATRIX (não fica duplicada)', () => {
    const known = new Set<string>(ACTIVITY_KINDS);
    expect(Object.keys(BEHAVIOUR_MATRIX).filter((k) => known.has(k)).sort()).toEqual([]);
  });

  it('o eixo G (kind desconhecido) tem story — ele não é por kind', () => {
    expect(STORY_IDS.has('activities-dispatcher--kind-desconhecido')).toBe(true);
  });

  it('o BYOC ao vivo tem as duas stories que dão para ter sem seam novo', () => {
    expect(STORY_IDS.has('activities-ia-sandbox-byoc-live--compose')).toBe(true);
    expect(STORY_IDS.has('activities-ia-sandbox-byoc-live--revealed-in-live')).toBe(true);
  });

  it('toda interação da árvore BYOC tem story de fluxo completo', () => {
    for (const [interaction, flow] of Object.entries(BYOC_TREE_COVERAGE)) {
      expect(STORY_IDS.has(flow), `${interaction}: falta o fluxo completo`).toBe(true);
    }
  });

  it('toda fase/degradação do BYOC ao vivo aponta para onde ela é provada', () => {
    const machine = [
      'phase:compose',
      'phase:responding',
      'phase:evaluate',
      'phase:judging',
      'phase:settled',
      'degrade:!responderAvailable',
      'degrade:!judgeAvailable',
      'degrade:error',
    ];
    expect(machine.filter((k) => !(k in BYOC_LIVE_COVERAGE))).toEqual([]);
    for (const [k, where] of Object.entries(BYOC_LIVE_COVERAGE)) {
      expect(where.length, `${k} sem referência de prova`).toBeGreaterThan(20);
    }
  });
});
