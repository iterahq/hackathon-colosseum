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
 * tem que aparecer aqui com um dos quatro estados —
 *
 *   `{ story }`    a célula está coberta; a story precisa existir de verdade
 *                  (renomeou a story? o guard fica vermelho).
 *   `{ na }`       o eixo não se aplica a este kind (ex.: correção num kind de
 *                  exposição). Nunca implícito — sempre com o motivo escrito.
 *   `{ deferred }` a célula NÃO está coberta e sabe-se por quê: só interação
 *                  real a produz, e ADR-4 proíbe criar prop `initial*` nova de
 *                  produção para fabricá-la. Vai na Fase 3.
 *   `{ drift }`    a célula não está coberta porque a PRODUÇÃO não a implementa
 *                  (ou implementa de forma contraditória). É achado, não dívida
 *                  de teste — precisa de decisão, não de mais story.
 */
import { describe, expect, it } from 'vitest';
import { ACTIVITY_KINDS } from '@iterahq/activity-spec';
import { indexStories } from './storyIndex';

/** Um estado da matriz, por kind. */
type Cell =
  | { story: string }
  | { na: string }
  | { deferred: 'fase-3'; why: string }
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

const EXPOSITION_NO_ANSWER =
  'kind de exposição: o aluno consome e segue — não existe resposta a produzir.';
const EXPOSITION_NO_GRADE = 'kind de exposição: não há o que corrigir (eixo D não existe aqui).';
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
    'C.answered': {
      deferred: 'fase-3',
      why: 'texto digitado abaixo do `min_words`: o document nunca teve prop `initial*` e ADR-4 congela esse padrão — só digitar de verdade produz o estado.',
    },
    'C.submitted': {
      deferred: 'fase-3',
      why: 'redação enviada — mesmo motivo de `C.answered`.',
    },
    'D.correct': {
      na: 'o `document` é contrato de CONCLUSÃO, não de correção — a Fase 1 confirmou que ele não deriva o tuple de grading. O único caminho graduado é `rubric.mode:"ai-judge"`, que exige `iteraApiConfigured()` → tier T3.',
    },
    'D.incorrect': {
      na: 'idem `D.correct` — o document não produz veredito de correção fora do caminho `ai-judge`.',
    },
    'E.reveal': { na: NO_REVEAL_PROP },
    'F.spec_invalido': { drift: LOOSE_ZOD },
    'H.degenerado': { story: 'activities-dispatcher--document-vazio' },
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
    'C.answered': {
      deferred: 'fase-3',
      why: 'ADR-4: o quiz — "the hero activity" — nunca teve seam `initial*`, e a decisão travada é NÃO criar um. Só a interação real (T1) produz o estado.',
    },
    'C.submitted': { deferred: 'fase-3', why: 'idem `C.answered` (ADR-4).' },
    'D.correct': { deferred: 'fase-3', why: 'idem `C.answered` (ADR-4).' },
    'D.incorrect': { deferred: 'fase-3', why: 'idem `C.answered` (ADR-4).' },
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
      deferred: 'fase-3',
      why: 'editar o Monaco (fase `editing` com código alterado). ADR-8 manda `code` para o browser mode justamente por isso — iframe + editor não são dirigíveis em jsdom.',
    },
    'C.submitted': {
      deferred: 'fase-3',
      why: 'as fases `submitting`/`submitted`/`settled` do `CodeSnackPhase` (ADR-8, browser mode).',
    },
    'D.correct': { deferred: 'fase-3', why: 'checks passando (ADR-8, browser mode).' },
    'D.incorrect': { deferred: 'fase-3', why: 'checks falhando (ADR-8, browser mode).' },
    'E.reveal': {
      na: '`hasRevealableAnswer("code")` é FALSE por decisão explícita e documentada em `isAnswerableLiveKind.ts`: o spec de code não carrega solução, então não há gabarito a expor (e é por isso que o botão "Revelar resposta" não aparece).',
    },
    'F.spec_invalido': { story: 'activities-producao-code--espec-invalida' },
    'H.degenerado': { story: 'activities-producao-code--sem-starter' },
  },

  /* ── 6 · Cenário com IA ─────────────────────────────────────────────── */
  sandbox_scenario: {
    'A.enabled': { story: 'activities-ia-sandbox-aberta--open-chat' },
    'A.locked': { story: 'activities-gate-locked--locked-sandbox-scenario' },
    'B.done': { story: 'activities-ia-sandbox-aberta--concluida' },
    'C.blank': { story: 'activities-ia-sandbox-aberta--open-chat' },
    'C.answered': {
      deferred: 'fase-3',
      why: 'prompt composto (slots preenchidos / chip escolhido) antes de enviar — sem seam, só interação real.',
    },
    'C.submitted': {
      deferred: 'fase-3',
      why: 'o passo-a-passo do `ChatModel` (compose → evaluate). O reducer é puro e testável sem React — é o caminho barato da Fase 3.',
    },
    'D.correct': { deferred: 'fase-3', why: '`won` (ADR-11: property-based sobre os reducers).' },
    'D.incorrect': {
      deferred: 'fase-3',
      why: '`composeWeak` / `evalWrong` (ADR-11: property-based sobre os reducers).',
    },
    'E.reveal': { story: 'activities-ia-sandbox-aberta--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-dispatcher--sandbox-espec-invalida' },
    'H.degenerado': { story: 'activities-ia-sandbox-aberta--open-chat' },
  },
};

/**
 * O NÚMERO. Snapshot da distribuição das 121 células (11 kinds × 11 células).
 *
 * Ele é assertado de propósito: mexer na cobertura tem que ser um ato
 * consciente, com o novo número escrito à mão aqui. Subir `covered` (ou baixar
 * `deferred`) é a Fase 3 fazendo efeito; subir `drift` sem discussão é sinal.
 */
const COVERAGE_SNAPSHOT = { covered: 75, na: 24, deferred: 14, drift: 8 };

/**
 * BYOC AO VIVO — o que NÃO entrou nesta matriz, declarado para não sumir.
 *
 * O BYOC live não é um kind do enum: é um CONTRATO dentro de `sandbox_scenario`
 * (`isByocLive()`), com máquina própria — `Phase = compose | responding |
 * evaluate | judging | settled`, cruzada com `responderAvailable`,
 * `judgeAvailable` e `error`.
 *
 * Nada disso é alcançável por prop: `SandboxScenarioLiveActivity` aceita apenas
 * `activity`, `onComplete` e `reveal`; todo o resto vive dentro de
 * `useSandboxScenarioLive` e só muda via `send()` / `rate()`. Alcançar essas
 * fases numa story exigiria injetar o cliente da itera-api como prop — ou seja,
 * uma prop de produção que existe só para o Storybook, exatamente o padrão que o
 * **ADR-4 congelou**. Logo: Fase 3, com interação real (e mock de rede no
 * Vitest), não Fase 2.
 */
const BYOC_LIVE_DEFERRED = [
  'phase:responding',
  'phase:evaluate',
  'phase:judging',
  'phase:settled',
  'degrade:!responderAvailable',
  'degrade:!judgeAvailable',
  'degrade:error',
] as const;

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
    Object.entries(MATRIX).flatMap(([kind, row]) =>
      CELLS.map((cell) => [`${kind} · ${cell}`, row[cell]] as const),
    ),
  )('%s aponta para uma story que existe (ou está declarada n/a · deferred · drift)', (_label, cell) => {
    if ('story' in cell) {
      expect(STORY_IDS.has(cell.story), `story inexistente: ${cell.story}`).toBe(true);
      return;
    }
    // Não-coberta é permitido — mas nunca sem motivo escrito.
    const why = 'na' in cell ? cell.na : 'deferred' in cell ? cell.why : cell.drift;
    expect(why.length).toBeGreaterThan(20);
    if ('deferred' in cell) expect(cell.deferred).toBe('fase-3');
  });

  it('a distribuição das células bate com o snapshot declarado', () => {
    const tally = { covered: 0, na: 0, deferred: 0, drift: 0 };
    for (const row of Object.values(MATRIX)) {
      for (const cell of CELLS) {
        const c = row[cell];
        if ('story' in c) tally.covered += 1;
        else if ('na' in c) tally.na += 1;
        else if ('deferred' in c) tally.deferred += 1;
        else tally.drift += 1;
      }
    }
    const total = Object.keys(MATRIX).length * CELLS.length;
    expect(tally.covered + tally.na + tally.deferred + tally.drift).toBe(total);
    expect(tally).toEqual(COVERAGE_SNAPSHOT);
  });

  it('o eixo G (kind desconhecido) tem story — ele não é por kind', () => {
    expect(STORY_IDS.has('activities-dispatcher--kind-desconhecido')).toBe(true);
  });

  it('o BYOC ao vivo tem as duas stories que dão para ter sem seam novo', () => {
    expect(STORY_IDS.has('activities-ia-sandbox-byoc-live--compose')).toBe(true);
    expect(STORY_IDS.has('activities-ia-sandbox-byoc-live--revealed-in-live')).toBe(true);
  });

  it('as fases/degradações do BYOC ao vivo seguem declaradas como adiadas para a Fase 3', () => {
    expect(BYOC_LIVE_DEFERRED.length).toBe(7);
  });
});
