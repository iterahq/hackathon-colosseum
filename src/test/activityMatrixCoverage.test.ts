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
import { ACTIVITY_KINDS, type GeneratedChoiceTree } from '@iterahq/activity-spec';
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
};

/**
 * LINHAS POR COMPORTAMENTO — os comportamentos de produção que NÃO tinham linha.
 *
 * Plano `20260924-activity-type-one-behavior-rule` (v3), task T4. Regra: um
 * activity type = um comportamento. Quatro kinds de hoje guardam mais de um
 * (`chat_sandbox`, `terminal_sandbox`, `document`, `code`), e a linha do kind
 * acima cobre só UM deles:
 *   - `chat_sandbox` aponta o chat ABERTO, que tem 0 linhas em produção;
 *   - `terminal_sandbox` aponta o texto livre; o modo de opções não tinha linha;
 *   - `document` cobre leitura + reflexão; o caminho `ai-judge` (10 act / 10
 *     def) tinha `D` inteiro em `na`.
 *
 * Cada linha aqui tem o NOME DO KIND FUTURO (ADR-1 do plano) e o kind de hoje
 * em `from`. Quando o kind nascer em `@iterahq/activity-spec`, o teste
 * "ainda não é kind do enum" fica vermelho de propósito: a linha MUDA para a
 * `MATRIX` acima, sem reescrever célula nenhuma.
 *
 * Fixtures: linhas reais de produção (`src/stories/behaviourFixtures.ts`) e os
 * cenários c1/c2 de `src/test/fixtures/sandbox-scenarios.json`.
 */
const TERMINAL_TAP_RUNS =
  'tocar um comando da paleta JÁ o executa: não existe rascunho entre escolher e enviar, então "respondido e não enviado" não é um estado deste comportamento.';
const SANDBOX_SPEC_INVALID_BY_KIND =
  'a validação é do kind de HOJE (o schema do sandbox), antes de qualquer renderer: o card de spec inválido é o mesmo para todo comportamento do kind.';
const NO_DEGENERATE_SHAPE =
  'o menor spec que o Zod aceita para este comportamento é o próprio `Default` (um passo, uma entrada); sem a entrada, ele deixa de ser ESTE comportamento — vira outro kind, não um extremo deste.';

const BEHAVIOUR_MATRIX: Record<string, { from: string; row: Record<CellKey, Cell> }> = {
  /** `chat_sandbox` com `choices[]` — 10 act / 10 def em produção. */
  chat_pick_context: {
    from: 'chat_sandbox',
    row: {
      'A.enabled': { story: 'activities-ia-sandbox-opcoes--vague-ask' },
      'A.locked': { story: 'activities-gate-locked--locked-chat-pick-context' },
      'B.done': { story: 'activities-ia-sandbox-opcoes--concluida' },
      'C.blank': { story: 'activities-ia-sandbox-opcoes--vague-ask' },
      'C.answered': { story: 'activities-ia-sandbox-opcoes--contexto-escolhido' },
      'C.submitted': { story: 'activities-ia-sandbox-opcoes--resposta-recebida' },
      'D.correct': { story: 'activities-ia-sandbox-opcoes--avaliada-corretamente' },
      'D.incorrect': { story: 'activities-ia-sandbox-opcoes--avaliada-incorretamente' },
      'E.reveal': { story: 'activities-ia-sandbox-opcoes--revealed-in-live' },
      'F.spec_invalido': { story: 'activities-dispatcher--chat-sandbox-espec-invalida' },
      'H.degenerado': { na: NO_DEGENERATE_SHAPE },
    },
  },
  /** `chat_sandbox` com `slots[]` de kind `select` — 18 act / 9 def em produção. */
  chat_fill_select: {
    from: 'chat_sandbox',
    row: {
      'A.enabled': { story: 'activities-ia-sandbox-slots--who-am-i' },
      'A.locked': { story: 'activities-gate-locked--locked-chat-fill-select' },
      'B.done': { story: 'activities-ia-sandbox-slots--concluida' },
      'C.blank': { story: 'activities-ia-sandbox-slots--who-am-i' },
      'C.answered': { story: 'activities-ia-sandbox-slots--opcao-escolhida' },
      'C.submitted': { story: 'activities-ia-sandbox-slots--resposta-recebida' },
      'D.correct': { story: 'activities-ia-sandbox-slots--avaliada-corretamente' },
      'D.incorrect': { story: 'activities-ia-sandbox-slots--avaliada-incorretamente' },
      'E.reveal': { story: 'activities-ia-sandbox-slots--revealed-in-live' },
      'F.spec_invalido': { story: 'activities-dispatcher--chat-sandbox-espec-invalida' },
      'H.degenerado': { na: NO_DEGENERATE_SHAPE },
    },
  },
  /** `terminal_sandbox`, `inputMode: options`, granularidade `command` — 3 act / 1 def. */
  terminal_pick_command: {
    from: 'terminal_sandbox',
    row: {
      'A.enabled': { story: 'activities-terminal-pick-command--default' },
      'A.locked': { story: 'activities-gate-locked--locked-terminal-pick-command' },
      'B.done': { story: 'activities-terminal-pick-command--concluida' },
      'C.blank': { story: 'activities-terminal-pick-command--default' },
      'C.answered': { na: TERMINAL_TAP_RUNS },
      'C.submitted': { story: 'activities-terminal-pick-command--comando-certo' },
      'D.correct': { story: 'activities-terminal-pick-command--comando-certo' },
      'D.incorrect': { story: 'activities-terminal-pick-command--comando-errado' },
      'E.reveal': { story: 'activities-terminal-pick-command--revealed-in-live' },
      'F.spec_invalido': { story: 'activities-dispatcher--terminal-sandbox-espec-invalida' },
      'H.degenerado': { na: NO_DEGENERATE_SHAPE },
    },
  },
  /** `terminal_sandbox`, `inputMode: options`, granularidade `token` — 2 act / 1 def. */
  terminal_build_command: {
    from: 'terminal_sandbox',
    row: {
      'A.enabled': { story: 'activities-terminal-build-command--default' },
      'A.locked': { story: 'activities-gate-locked--locked-terminal-build-command' },
      'B.done': { story: 'activities-terminal-build-command--concluida' },
      'C.blank': { story: 'activities-terminal-build-command--default' },
      'C.answered': { story: 'activities-terminal-build-command--linha-montada' },
      'C.submitted': { story: 'activities-terminal-build-command--linha-certa' },
      'D.correct': { story: 'activities-terminal-build-command--linha-certa' },
      'D.incorrect': { story: 'activities-terminal-build-command--linha-errada' },
      'E.reveal': { story: 'activities-terminal-build-command--revealed-in-live' },
      'F.spec_invalido': { story: 'activities-dispatcher--terminal-sandbox-espec-invalida' },
      'H.degenerado': { na: NO_DEGENERATE_SHAPE },
    },
  },
  /** `document` com `rubric.mode: "ai-judge"` — 10 act / 10 def em produção. */
  document_ai_judge: {
    from: 'document',
    row: {
      'A.enabled': { story: 'activities-producao-document-ai-judge--default' },
      'A.locked': { story: 'activities-producao-document-ai-judge--travada' },
      'B.done': {
        drift:
          '`AiJudgeDocumentActivity` não lê `activity.status`: uma redação já aprovada reabre vazia, com o botão de enviar. É achado de produção (o aluno refaz o trabalho), não falta de story.',
      },
      'C.blank': { story: 'activities-producao-document-ai-judge--default' },
      'C.answered': { story: 'activities-producao-document-ai-judge--resposta-escrita' },
      'C.submitted': { story: 'activities-producao-document-ai-judge--aprovada' },
      'D.correct': { story: 'activities-producao-document-ai-judge--aprovada' },
      'D.incorrect': { story: 'activities-producao-document-ai-judge--reprovada' },
      'E.reveal': { na: NO_REVEAL_PROP },
      'F.spec_invalido': { drift: LOOSE_ZOD },
      'H.degenerado': {
        drift:
          'sem a porta `api.judge` o MESMO spec vira a reflexão por contagem de palavras (`DocumentActivity`): o host escolhe o comportamento. A regra do plano proíbe isso ("no host-dependent behaviour"); a story `--sem-porta-de-juiz` mostra a troca.',
      },
    },
  },
};

/**
 * O NÚMERO. Snapshot da distribuição das 209 células ((14 kinds + 5 linhas de
 * comportamento) × 11 células).
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
const COVERAGE_SNAPSHOT = { covered: 155, na: 38, deferred: 5, drift: 11 };

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
