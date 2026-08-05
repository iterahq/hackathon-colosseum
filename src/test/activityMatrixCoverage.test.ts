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
 *   `{ deferred }` a célula NÃO está coberta e sabe-se por quê, com o motivo
 *                  no `why`. Duas razões existem hoje:
 *                    `fase-3`        — esperava a interação real (ADR-4);
 *                    `browser-input` — a interação existe, mas o WIDGET não é
 *                                      dirigível por evento sintético nem no
 *                                      navegador (o Monaco lê do seu modelo
 *                                      interno, não do `<textarea>` do DOM).
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
  | { deferred: 'fase-3' | 'browser-input'; why: string }
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
    'C.answered': { story: 'activities-ia-sandbox-aberta--prompt-composto' },
    'C.submitted': { story: 'activities-ia-sandbox-aberta--resposta-recebida' },
    'D.correct': { story: 'activities-ia-sandbox-aberta--avaliada-corretamente' },
    'D.incorrect': { story: 'activities-ia-sandbox-aberta--avaliada-incorretamente' },
    'E.reveal': { story: 'activities-ia-sandbox-aberta--revealed-in-live' },
    'F.spec_invalido': { story: 'activities-dispatcher--sandbox-espec-invalida' },
    'H.degenerado': { story: 'activities-ia-sandbox-aberta--open-chat' },
  },
};

/**
 * O NÚMERO. Snapshot da distribuição das 132 células (12 kinds × 11 células).
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
 *
 * As 10 células que viraram: `quiz` C.answered/C.submitted/D.correct/D.incorrect
 * (a activity herói, que não tinha NENHUM estado de resposta), `document`
 * C.answered/C.submitted (rascunho abaixo do `min_words` × redação enviada) e
 * `sandbox_scenario` C.answered/C.submitted/D.correct/D.incorrect (o
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
const COVERAGE_SNAPSHOT = { covered: 93, na: 30, deferred: 1, drift: 8 };

/**
 * BYOC AO VIVO — o que não entra nesta matriz, e onde ele é provado.
 *
 * O BYOC live não é um kind do enum: é um CONTRATO dentro de `sandbox_scenario`
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
 * cada `interaction` do union de `GeneratedChoiceTree` apareça na vitrine nos
 * DOIS níveis — a árvore isolada e o fluxo de dois passos —, porque a queixa que
 * originou isto foi exatamente ver o passo 1 no Storybook e o passo 2 em lugar
 * nenhum.
 *
 * `build_context` não tem célula de correção em nível nenhum: não há certo nem
 * errado, chegar ao fim É o acerto.
 */
const BYOC_TREE_COVERAGE: Record<
  GeneratedChoiceTree['interaction'],
  { tree: string; flow: string }
> = {
  pick_best: {
    tree: 'activities-ia-byoc-tree--pick-best',
    flow: 'activities-ia-byoc-fluxo--pick-best',
  },
  judge_each: {
    tree: 'activities-ia-byoc-tree--judge-each',
    flow: 'activities-ia-byoc-fluxo--judge-each',
  },
  build_context: {
    tree: 'activities-ia-byoc-tree--build-context',
    flow: 'activities-ia-byoc-fluxo--build-context',
  },
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
    if ('deferred' in cell) expect(['fase-3', 'browser-input']).toContain(cell.deferred);
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

  it('toda interação da árvore BYOC tem story isolada E de fluxo completo', () => {
    for (const [interaction, { tree, flow }] of Object.entries(BYOC_TREE_COVERAGE)) {
      expect(STORY_IDS.has(tree), `${interaction}: falta a árvore isolada`).toBe(true);
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
