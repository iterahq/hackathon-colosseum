/**
 * V4 — O INVARIANTE DO TAINAN, EXECUTÁVEL.
 *
 * > *"se ela receber um metadata confiável, ela vai passar por todos os tipos
 * > sem falhar"* — plano `20260728-itera-activity-testing`, Goal 1 / V4.
 *
 * Este arquivo é a forma executável dessa frase. Para CADA contrato de
 * `ACTIVITY_CONTRACTS` (a fonte única de fixtures, já Zod-validada pelo guard
 * `activityContractFixtures.test.ts`), ele:
 *
 *   1. monta o DISPATCHER REAL (`ActivityRenderer`) — não o componente folha,
 *      porque o caminho de produção passa pelo `switch (activity.kind)`;
 *   2. confere que a árvore montada se identifica com o `data-activity-kind`
 *      certo (um kind que caísse no fallback `UnknownActivity` seria pego aqui);
 *   3. DIRIGE a interação real do kind — clicando, digitando, avaliando — pelos
 *      mesmos helpers que as stories usam (`src/stories/interactions.ts`);
 *   4. exige que `onComplete` receba o BOOLEANO esperado (ou que não seja
 *      chamado, quando o passo não conclui);
 *   5. falha se qualquer coisa lançar OU escrever em `console.error`.
 *
 * ── O QUE ESTE INVARIANTE PROVA, E O QUE NÃO PROVA (leia antes de citá-lo) ──
 *
 * PROVA: que todo contrato do registro renderiza, aceita a interação real do
 * seu kind e emite o veredito certo. Como a matriz A–E entra como eixo
 * (`reveal`, `done`), ele também prova as combinações de gate por kind.
 *
 * NÃO PROVA nada sobre `spec` ARBITRÁRIO vindo do banco. `safeParseActivitySpec`
 * só é chamado nos kinds de `code` e de sandbox — drift signal #3 /
 * ADR-5 / ADR-13. Nos outros 9 o spec entra por cast. Portanto o invariante está
 * provado contra as FIXTURES, e a fronteira de validação que o tornaria
 * universal pertence ao plano irmão `20260728-itera-back-office`.
 *
 * NÃO PROVA layout/CSS/geometria: jsdom não faz layout. ADR-8 manda `code`
 * (iframe + Monaco) para o browser mode por isso.
 */
import './storybookTestBridge';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import type { Activity, ActivityKind } from '@/types/content';
import { makeActivity } from '@/stories/activityFixtures';
import { ACTIVITY_CONTRACTS, type ContractKey } from '@/stories/contractFixtures';
import { fillGuidedBlanks, settleGuided } from '@/stories/guidedInteractions';
import {
  arrangeOrder,
  buildTerminalLine,
  composeSandboxPrompt,
  fillSandboxSlot,
  rateSeededReply,
  sendSandboxAndSettle,
  tapTerminalCommand,
  writeQuestionNote,
  connectPairs,
  markDone,
  markQuestionOptions,
  discoverAllTwins,
  pickMultiChoice,
  pickQuizOption,
  pickSingleChoice,
  rateSandbox,
  sendSandboxPrompt,
  submitAnswer,
  writeReflection,
} from '@/stories/interactions';

/** Como dirigir UM contrato até um veredito, e qual veredito esperar. */
interface Drive {
  /** O `data-activity-kind` que a árvore montada tem que anunciar. */
  kind: ActivityKind;
  /** Leva a activity até o acerto. `undefined` = o kind não tem caminho de acerto. */
  correct?: (canvas: HTMLElement) => Promise<void>;
  /** Leva a activity até o erro. `undefined` = kind sem eixo D (exposição). */
  incorrect?: (canvas: HTMLElement) => Promise<void>;
  /**
   * Motivo, por escrito, quando um caminho não existe. Igual ao guard de
   * matriz: não-coberto é aceitável, não-coberto SEM motivo não é.
   */
  why?: string;
}

/* Rótulos dos fixtures — a busca é sempre por texto, nunca por posição, porque
 * single/multi/match/order embaralham as opções a cada montagem. */
const SC_RIGHT = 'chave estrangeira';
const SC_WRONG = 'Copiar as colunas';
const SC_IMG_RIGHT = 'Opção C';
const SC_IMG_WRONG = 'Opção A';
const MC_RIGHT = ['Normalizar para evitar', 'Usar chaves estrangeiras', 'Definir chaves primárias'];
const MC_WRONG = ['Copiar dados entre todas'];
const ORDER_RIGHT = [
  'Identificar as entidades',
  'Listar os atributos',
  'Normalizar as tabelas',
  'Definir chaves e relações',
];
const ORDER_WRONG = [
  'Listar os atributos',
  'Identificar as entidades',
  'Normalizar as tabelas',
  'Definir chaves e relações',
];
const MATCH_RIGHT: [string, string][] = [
  ['Chave primária', 'Identifica unicamente uma linha'],
  ['Chave estrangeira', 'Referencia a PK de outra tabela'],
  ['Índice', 'Acelera buscas por coluna'],
];
const MATCH_WRONG: [string, string][] = [
  ['Chave primária', 'Referencia a PK de outra tabela'],
  ['Chave estrangeira', 'Identifica unicamente uma linha'],
  ['Índice', 'Acelera buscas por coluna'],
];
const LONG_REFLECTION =
  'A chave primaria e a coluna que identifica cada linha de forma unica dentro de uma ' +
  'tabela. No caso da escola o numero de matricula funciona bem porque nunca se repete ' +
  'entre dois alunos diferentes e nunca fica vazio para ninguem.';

const EXPOSITION =
  'kind de exposição: não há o que submeter. O "marcar como concluída" foi removido porque ' +
  'ao vivo ele virava ponto no pódio por ter LIDO um slide — e o professor avançava a turma ' +
  'de qualquer jeito, então o ranking media obediência. Quem avança é o shell.';

/**
 * O mapa contrato → interação. TODO contrato do registro precisa de uma linha —
 * é isso que faz um contrato novo (ou um kind novo) chegar aqui vermelho em vez
 * de passar despercebido.
 */
const DRIVES: Record<ContractKey, Drive> = {
  concept: {
    kind: 'concept',
    why:
      'o `ConceptActivity` NÃO tem affordance de conclusão nenhuma, por decisão escrita no ' +
      'próprio componente: "a concept is not something the learner completes, it\'s something ' +
      'they read" — quem avança é o shell (player ou professor). Ele nunca chama `onComplete`.',
  },
  concept_reveal: {
    kind: 'concept_reveal',
    why:
      'o card "pense antes" NUNCA pontua: revelar a resposta é um ato de leitura, não de ' +
      'submissão. Como o `concept`, ele não chama `onComplete` — quem avança é o shell. O ' +
      'gate do botão (e o bypass ao vivo) vive em `ConceptRevealActivity.test.tsx`.',
  },
  video: { kind: 'video', why: EXPOSITION },
  diagram: { kind: 'diagram', why: EXPOSITION },
  document_reading: { kind: 'document', why: EXPOSITION },

  single_choice: {
    kind: 'single_choice',
    correct: async (c) => {
      await pickSingleChoice(c, SC_RIGHT);
      await submitAnswer(c, 'single-choice-submit');
    },
    incorrect: async (c) => {
      await pickSingleChoice(c, SC_WRONG);
      await submitAnswer(c, 'single-choice-submit');
    },
  },
  single_choice_images: {
    kind: 'single_choice',
    correct: async (c) => {
      await pickSingleChoice(c, SC_IMG_RIGHT);
      await submitAnswer(c, 'single-choice-submit');
    },
    incorrect: async (c) => {
      await pickSingleChoice(c, SC_IMG_WRONG);
      await submitAnswer(c, 'single-choice-submit');
    },
  },
  multi_choice: {
    kind: 'multi_choice',
    correct: async (c) => {
      await pickMultiChoice(c, MC_RIGHT);
      await submitAnswer(c, 'multi-choice-submit');
    },
    incorrect: async (c) => {
      await pickMultiChoice(c, MC_WRONG);
      await submitAnswer(c, 'multi-choice-submit');
    },
  },
  quiz: {
    kind: 'quiz',
    correct: async (c) => {
      await pickQuizOption(c, 'Falso');
      await submitAnswer(c, 'quiz-submit');
    },
    incorrect: async (c) => {
      await pickQuizOption(c, 'Verdadeiro');
      await submitAnswer(c, 'quiz-submit');
    },
  },
  match: {
    kind: 'match',
    correct: async (c) => {
      await connectPairs(c, MATCH_RIGHT);
      await submitAnswer(c, 'match-submit');
    },
    incorrect: async (c) => {
      await connectPairs(c, MATCH_WRONG);
      await submitAnswer(c, 'match-submit');
    },
  },
  order: {
    kind: 'order',
    correct: async (c) => {
      await arrangeOrder(c, ORDER_RIGHT);
      await submitAnswer(c, 'order-submit');
    },
    incorrect: async (c) => {
      await arrangeOrder(c, ORDER_WRONG);
      await submitAnswer(c, 'order-submit');
    },
  },
  document_writing: {
    kind: 'document',
    correct: async (c) => {
      await writeReflection(c, LONG_REFLECTION);
      await markDone(c);
    },
    why:
      'o `document` é contrato de CONCLUSÃO, não de correção (Fase 1 confirmou que ele não ' +
      'deriva o tuple de grading). O único caminho graduado é `rubric.mode:"ai-judge"`, que ' +
      'exige a itera-api → tier T3.',
  },
  code: {
    kind: 'code',
    correct: markDone,
    why:
      'CODE_SPEC não traz `checks`, então o `code` cai no contrato de CONCLUSÃO (o próprio ' +
      'componente troca o "Enviar" pelo "Concluir"). As 4 fases do `CodeSnackPhase` e os ' +
      'checks pass/fail são do browser mode (ADR-8) — o Monaco e o iframe de preview não são ' +
      'dirigíveis em jsdom.',
  },

  /* As três variantes GUIADAS do `code`. Ao contrário do `code` aberto, estas
   * SÃO dirigíveis em jsdom: o template é DOM comum e o veredito é local — o
   * Monaco e o round-trip com o iframe não entram no caminho. */
  code_options: {
    kind: 'code',
    correct: async (c) => {
      await fillGuidedBlanks(c, { hook: 'useState', evento: 'onClick' });
      await settleGuided(c);
    },
    incorrect: async (c) => {
      await fillGuidedBlanks(c, { hook: 'useEffect', evento: 'onClick' });
      await settleGuided(c);
    },
  },
  code_dropdown: {
    kind: 'code',
    correct: async (c) => {
      await fillGuidedBlanks(c, { hook: 'useState', evento: 'onClick' });
      await settleGuided(c);
    },
    incorrect: async (c) => {
      await fillGuidedBlanks(c, { hook: 'useState', evento: 'onChange' });
      await settleGuided(c);
    },
  },
  code_text: {
    kind: 'code',
    correct: async (c) => {
      await fillGuidedBlanks(c, { setter: 'setCurtidas', inicial: '0' });
      await settleGuided(c);
    },
    incorrect: async (c) => {
      await fillGuidedBlanks(c, { setter: 'setLikes', inicial: '0' });
      await settleGuided(c);
    },
  },

  sandbox_open: {
    kind: 'chat_sandbox',
    correct: async (c) => {
      await composeSandboxPrompt(c);
      await sendSandboxPrompt(c);
      await rateSandbox(c, 'top');
    },
    why: 'avaliar errado NÃO emite veredito: o sandbox rejeita e pede nova avaliação (ver `sandboxRejeitaAvaliacaoErrada`).',
  },
  sandbox_choices: {
    kind: 'chat_sandbox',
    correct: async (c) => {
      await composeSandboxPrompt(c, 'redação de escola');
      await sendSandboxPrompt(c);
      await rateSandbox(c, 'top');
    },
    why: 'mesmo motivo do `sandbox_open`: avaliar errado é rejeitado, não vira veredito negativo.',
  },
  sandbox_slots: {
    kind: 'chat_sandbox',
    why:
      'a variante de SLOTS monta o prompt preenchendo lacunas com um mecanismo próprio ' +
      '(`SandboxSlotPanel`), coberto por `ChatSandboxActivity.test.tsx`. Dirigi-la aqui ' +
      'duplicaria aquele teste sem provar nada novo sobre o INVARIANTE.',
  },
  sandbox_byoc_live: {
    kind: 'chat_sandbox',
    why:
      'BYOC ao vivo fala com a itera-api de verdade: sem mock de módulo no limite do teste ' +
      'ele não é dirigível, e mockar rede AQUI contaminaria os outros 15 contratos deste ' +
      'arquivo. Vive em `byocLivePhases.test.tsx`, com `vi.mock("@/api/iteraApi")`.',
  },
  chat_sandbox: {
    kind: 'chat_sandbox',
    correct: async (c) => {
      await composeSandboxPrompt(c);
      await sendSandboxPrompt(c);
      await rateSandbox(c, 'top');
    },
    why:
      'dirigido igual ao `sandbox_open` de propósito: o kind novo tem que provar o MESMO ' +
      'invariante que o legado, senão a divisão teria trocado o discriminador e perdido a ' +
      'garantia no caminho.',
  },
  terminal_sandbox: {
    kind: 'terminal_sandbox',
    why:
      'o terminal avança por COMANDO reconhecido, não por submissão — o veredito sai de ' +
      '`useTerminalSandbox` casando o comando digitado com o `unlock` do passo. Está coberto ' +
      'em `TerminalSandboxActivity.test.tsx` e `terminalSuccessMarks.test.ts`.',
  },

  /*
   * `question` é o primeiro contrato com `correct` e SEM `incorrect`, e a
   * assimetria não é dívida — é o kind.
   *
   * Ler `correct` aqui como "acertou" seria ler errado: neste arquivo `correct`
   * quer dizer *"o caminho que faz o kind emitir `onComplete(true)`"*. Para uma
   * `question` isso é simplesmente RESPONDER, e o `true` que ela passa é
   * "concluída", não "certa" — o mesmo valor que a reflexão do `document` passa.
   * Não existe interação que produza `false`, porque não existe resposta errada.
   */
  question: {
    kind: 'question',
    correct: async (c) => {
      await markQuestionOptions(c, ['Manter o adaptador']);
      await submitAnswer(c, 'question-submit');
    },
    why:
      'não há caminho de ERRO: a `question` não corrige nada, então nenhuma interação pode ' +
      'produzir `onComplete(false)`. O booleano que ela emite é "concluída", não "certa" — o ' +
      'kind inteiro existe para não desenhar veredito nenhum.',
  },
  question_multi: {
    kind: 'question',
    correct: async (c) => {
      await markQuestionOptions(c, ['Inbox global', 'Dashboard']);
      await submitAnswer(c, 'question-submit');
    },
    why:
      'mesma razão do `question`: sem resposta certa não existe caminho de erro. Esta variante ' +
      'prova que `mode: multi` ACUMULA as marcas em vez de substituir, com o mesmo veredito.',
  },

  /*
   * As cenas não corrigem: `correct` aqui é "o gesto que abre o gate". Nenhuma
   * tem caminho de erro — não existe gesto errado, só gesto incompleto.
   */
  xray: {
    kind: 'xray',
    why:
      'o gate do raio-X é COBERTURA do palco medida por `getBoundingClientRect`, e o jsdom ' +
      'devolve 0×0 para todo elemento — não há área a varrer. Coberto de ponta a ponta no ' +
      'Storybook (`XrayActivity.stories.tsx`, play function) num navegador real.',
  },
  live_type: {
    kind: 'live_type',
    why:
      'o gate só existe DEPOIS de o fantasma digitar o texto inteiro (~3 s de timers reais) e ' +
      'o texto do aluno ficar parado 700 ms. Coberto no Storybook (`LiveTypeActivity.stories.tsx`) ' +
      'num navegador real; sem caminho de erro porque não existe texto errado.',
  },
  inspect: {
    kind: 'inspect',
    correct: async (c) => {
      await discoverAllTwins(c);
    },
    why:
      'não há caminho de ERRO: apontar uma peça nunca está errado, só incompleto. O `true` é ' +
      '"achou todas", o mesmo "concluída" das outras cenas.',
  },

  /*
   * ── Os kinds de UM COMPORTAMENTO (plano 20260924-activity-type-one-behavior-rule,
   * T9–T14). Cada um é dirigido pela interação do SEU comportamento, e só dela:
   * é isto que prova que o kind não escolhe outra tela pelo formato do spec.
   */
  code_editor_checks: {
    kind: 'code_editor_checks',
    why:
      'o juiz são os `checks` de DOM, que rodam DENTRO do iframe de preview — em jsdom o ' +
      '`submit` esperaria para sempre. Os caminhos de acerto e erro vivem no browser mode ' +
      '(ADR-8), como os do `code` com checks (`CodeSnackActivity.stories.tsx`).',
  },
  code_editor_ungraded: {
    kind: 'code_editor_ungraded',
    correct: markDone,
    why: 'sem juiz não existe caminho de ERRO: o aluno clica "Concluir" e a activity conclui.',
  },
  code_fill_bank: {
    kind: 'code_fill_bank',
    correct: async (c) => {
      await fillGuidedBlanks(c, { hook: 'useState', evento: 'onClick' });
      await settleGuided(c);
    },
    incorrect: async (c) => {
      await fillGuidedBlanks(c, { hook: 'useEffect', evento: 'onClick' });
      await settleGuided(c);
    },
  },
  code_fill_select: {
    kind: 'code_fill_select',
    correct: async (c) => {
      await fillGuidedBlanks(c, { hook: 'useState', evento: 'onClick' });
      await settleGuided(c);
    },
    incorrect: async (c) => {
      await fillGuidedBlanks(c, { hook: 'useState', evento: 'onChange' });
      await settleGuided(c);
    },
  },
  code_fill_type: {
    kind: 'code_fill_type',
    correct: async (c) => {
      await fillGuidedBlanks(c, { setter: 'setCurtidas', inicial: '0' });
      await settleGuided(c);
    },
    incorrect: async (c) => {
      await fillGuidedBlanks(c, { setter: 'setLikes', inicial: '0' });
      await settleGuided(c);
    },
  },
  chat_compose: {
    kind: 'chat_compose',
    correct: async (c) => {
      await composeSandboxPrompt(c);
      await sendSandboxAndSettle(c);
    },
    why: 'um pedido livre não tem envio ERRADO: o passo pede um envio, e o envio conclui.',
  },
  chat_fill_select: {
    kind: 'chat_fill_select',
    correct: async (c) => {
      await fillSandboxSlot(c, { option: 'meu irmão pequeno' });
      await sendSandboxAndSettle(c);
    },
    why:
      'uma lacuna sem contexto não vira veredito negativo: o envio fraco mostra a crítica e ' +
      'o passo continua aberto (`sandbox-compose-weak`), como no `chat_sandbox`.',
  },
  chat_fill_type: {
    kind: 'chat_fill_type',
    correct: async (c) => {
      await fillSandboxSlot(c, { placeholder: 'ex.: meu irmão pequeno', text: 'meu irmão de 8 anos' });
      await sendSandboxAndSettle(c);
    },
    why: 'mesmo motivo do `chat_fill_select`: o envio fraco pede outra tentativa, não emite `false`.',
  },
  chat_pick_context: {
    kind: 'chat_pick_context',
    correct: async (c) => {
      await composeSandboxPrompt(c, 'redação de escola');
      await sendSandboxAndSettle(c);
    },
    why: 'o chip distrator manda um pedido fraco e o passo continua aberto — não há `false`.',
  },
  chat_rate_reply: {
    kind: 'chat_rate_reply',
    correct: async (c) => {
      // A resposta semeada é a `vago` (qualidade `ruim`): avaliar "fraca" acerta.
      await rateSeededReply(c, 'ruim');
    },
    why:
      'avaliar errado NÃO emite veredito: o painel rejeita com crítica e pede nova avaliação, ' +
      'como no `chat_sandbox` (ver `oneBehaviourKinds.test.tsx`).',
  },
  terminal_type_command: {
    kind: 'terminal_type_command',
    why:
      'o terminal avança por comando DIGITADO que casa com o `unlock` do passo; a digitação e o ' +
      'casamento estão em `TerminalSandboxActivity.test.tsx`. O que este kind acrescenta — a ' +
      'entrada fixada em texto livre — está em `oneBehaviourKinds.test.tsx`.',
  },
  terminal_pick_command: {
    kind: 'terminal_pick_command',
    correct: async (c) => {
      await tapTerminalCommand(c, 'git status');
    },
    why: 'um comando errado RODA, imprime a saída e o passo fica travado — não há `false`.',
  },
  terminal_build_command: {
    kind: 'terminal_build_command',
    correct: async (c) => {
      await buildTerminalLine(c, ['git', 'add', 'notas.md']);
    },
    why: 'mesmo motivo do `terminal_pick_command`: a linha errada roda e o passo fica travado.',
  },
  document_read: { kind: 'document_read', why: EXPOSITION },
  document_reflect: {
    kind: 'document_reflect',
    correct: async (c) => {
      await writeReflection(c, LONG_REFLECTION);
      await markDone(c);
    },
    why: 'o juiz é a CONTAGEM de palavras: abaixo do mínimo o envio fica travado, não emite `false`.',
  },
  document_ai_judge: {
    kind: 'document_ai_judge',
    why:
      'o juiz é a IA, e em jsdom não há a porta `api.judge`: o kind mostra o estado explícito ' +
      '"indisponível" (testado em `oneBehaviourKinds.test.tsx`) — nunca a reflexão.',
  },
  byoc_pick_best: {
    kind: 'byoc_pick_best',
    why:
      'o BYOC gera a árvore na itera-api; sem ela o kind mostra `byoc-unavailable`, nunca o card ' +
      'do `concept`. O fluxo de duas etapas vive nas stories do BYOC (`ByocFlow`).',
  },
  byoc_judge_each: {
    kind: 'byoc_judge_each',
    why: 'mesmo motivo do `byoc_pick_best`: sem itera-api o kind mostra `byoc-unavailable`.',
  },
  byoc_build_context: {
    kind: 'byoc_build_context',
    why: 'mesmo motivo do `byoc_pick_best`: sem itera-api o kind mostra `byoc-unavailable`.',
  },
  question_pick_one: {
    kind: 'question_pick_one',
    correct: async (c) => {
      await markQuestionOptions(c, ['Manter o adaptador']);
      await submitAnswer(c, 'question-submit');
    },
    why: 'como a `question`: sem resposta certa, nenhuma interação produz `false`.',
  },
  question_pick_many: {
    kind: 'question_pick_many',
    correct: async (c) => {
      await markQuestionOptions(c, ['Inbox global', 'Dashboard']);
      await submitAnswer(c, 'question-submit');
    },
    why: 'como a `question`: sem resposta certa, nenhuma interação produz `false`.',
  },
  question_write: {
    kind: 'question_write',
    correct: async (c) => {
      await writeQuestionNote(c, 'Eu testaria o contrato de persistência primeiro.');
      await submitAnswer(c, 'question-submit');
    },
    why: 'como a `question`: sem resposta certa, nenhuma interação produz `false`.',
  },
};

function activityFor(key: ContractKey, status?: Activity['status']): Activity {
  const contract = ACTIVITY_CONTRACTS[key];
  return makeActivity(
    contract.kind as ActivityKind,
    contract.spec as Record<string, unknown>,
    status,
    (contract as { rubric?: Record<string, unknown> }).rubric ?? null,
  );
}

function mount(activity: Activity, onComplete: (c: boolean, d?: unknown) => void, reveal = false) {
  const { container } = render(
    <I18nProvider>
      <ActivityRenderer activity={activity} onComplete={onComplete} reveal={reveal} />
    </I18nProvider>,
  );
  return container;
}

const KEYS = Object.keys(ACTIVITY_CONTRACTS) as ContractKey[];

let consoleErrors: string[] = [];

beforeEach(() => {
  consoleErrors = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('V4 — invariante: todo contrato monta, é dirigível, e emite o veredito certo', () => {
  it('todo contrato do registro tem uma interação declarada (nenhuma omissão silenciosa)', () => {
    expect(KEYS.filter((k) => !(k in DRIVES))).toEqual([]);
    expect(Object.keys(DRIVES).filter((k) => !KEYS.includes(k as ContractKey))).toEqual([]);
  });

  it('todo caminho ausente tem motivo escrito — não-coberto nunca é implícito', () => {
    for (const [key, drive] of Object.entries(DRIVES)) {
      if (drive.correct && drive.incorrect) continue;
      expect((drive.why ?? '').length, `${key} não explica o caminho ausente`).toBeGreaterThan(20);
    }
  });

  it.each(KEYS.map((k) => [k, DRIVES[k]] as const))(
    '%s monta e se anuncia com o data-activity-kind certo',
    (key, drive) => {
      mount(activityFor(key), vi.fn());
      const marked = screen.getAllByText((_c, el) => el?.hasAttribute('data-activity-kind') ?? false);
      const kinds = new Set(marked.map((el) => el.getAttribute('data-activity-kind')));
      expect(kinds.has(drive.kind), `${key}: kinds na árvore = ${[...kinds].join(', ')}`).toBe(true);
      expect(consoleErrors).toEqual([]);
    },
  );

  it.each(KEYS.filter((k) => DRIVES[k].correct).map((k) => [k, DRIVES[k]] as const))(
    '%s: a interação de ACERTO emite onComplete(true)',
    async (key, drive) => {
      const onComplete = vi.fn();
      const canvas = mount(activityFor(key), onComplete);
      await drive.correct!(canvas);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete.mock.calls[0][0]).toBe(true);
      expect(consoleErrors).toEqual([]);
    },
    20000,
  );

  it.each(KEYS.filter((k) => DRIVES[k].incorrect).map((k) => [k, DRIVES[k]] as const))(
    '%s: a interação de ERRO emite onComplete(false)',
    async (key, drive) => {
      const onComplete = vi.fn();
      const canvas = mount(activityFor(key), onComplete);
      await drive.incorrect!(canvas);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete.mock.calls[0][0]).toBe(false);
      expect(consoleErrors).toEqual([]);
    },
    20000,
  );

  /**
   * EIXO B da matriz, transversal: uma activity `done` não aceita uma segunda
   * submissão. É o `answerMachine.locked` visto de fora, pelo DOM.
   *
   * ⚠️ ACHADO, registrado em vez de escondido: o sandbox NÃO se comporta como
   * os outros aqui. `SandboxScenarioShell` trata `done` (e
   * `reveal`) como "settled" e RE-ANUNCIA o veredito num `useEffect` de
   * montagem — ou seja, montar um sandbox concluído já chama `onComplete(true)`,
   * sem nenhuma interação. Por isso a asserção é "a interação não acrescenta
   * chamada", medida contra a linha de base da montagem, e não "nunca chamou":
   * escrever a versão forte faria o teste mentir sobre um dos onze kinds.
   */
  it.each(KEYS.filter((k) => DRIVES[k].correct).map((k) => [k, DRIVES[k]] as const))(
    '%s: com status `done`, a interação não consegue emitir um veredito novo',
    async (key, drive) => {
      const onComplete = vi.fn();
      const canvas = mount(activityFor(key, 'done'), onComplete);
      const atMount = onComplete.mock.calls.length;
      await drive.correct!(canvas).catch(() => {
        /* o kind travado pode nem expor o affordance — é exatamente o ponto */
      });
      expect(onComplete.mock.calls.length).toBe(atMount);
      expect(consoleErrors).toEqual([]);
    },
    20000,
  );

  /**
   * O contraste explícito do achado acima: os kinds graduados NÃO emitem nada
   * ao montar `done`. Se algum passar a emitir, este teste é que fica vermelho —
   * o de cima continuaria verde, porque ele mede um delta.
   */
  it.each(
    (['single_choice', 'multi_choice', 'quiz', 'match', 'order'] as ContractKey[]).map((k) => [k] as const),
  )('%s: montar já `done` não emite veredito nenhum por conta própria', (key) => {
    const onComplete = vi.fn();
    mount(activityFor(key, 'done'), onComplete);
    expect(onComplete).not.toHaveBeenCalled();
    expect(consoleErrors).toEqual([]);
  });

  /**
   * EIXO E da matriz: `reveal` expõe o gabarito SEM submissão. Nenhum kind pode
   * emitir veredito só por ter sido revelado — seria gravar um resultado que o
   * aluno não produziu.
   */
  it.each(
    (['single_choice', 'multi_choice', 'match', 'order'] as ContractKey[]).map(
      (k) => [k, DRIVES[k]] as const,
    ),
  )('%s: com `reveal`, o gabarito aparece e NADA é emitido', (key) => {
    const onComplete = vi.fn();
    mount(activityFor(key), onComplete, true);
    expect(onComplete).not.toHaveBeenCalled();
    expect(consoleErrors).toEqual([]);
  });

  /**
   * O sandbox não deixa "passar batido": avaliação errada é REJEITADA com
   * crítica + retry, e nada sobe. É o contraste do caminho de acerto acima.
   */
  it(
    'sandbox: avaliar errado rejeita, pede nova avaliação e NÃO emite veredito',
    async () => {
      const onComplete = vi.fn();
      const canvas = mount(activityFor('sandbox_open'), onComplete);
      await composeSandboxPrompt(canvas);
      await sendSandboxPrompt(canvas);
      await rateSandbox(canvas, 'ruim');
      expect(screen.getByTestId('sandbox-eval-wrong')).toBeInTheDocument();
      expect(screen.getByTestId('sandbox-eval-retry')).toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();
      expect(consoleErrors).toEqual([]);
    },
    20000,
  );
});
