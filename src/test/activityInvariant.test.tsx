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
 * só é chamado em 2 dos 11 kinds (`code`, `sandbox_scenario`) — drift signal #3 /
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
import {
  arrangeOrder,
  composeSandboxPrompt,
  connectPairs,
  markDone,
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

  sandbox_open: {
    kind: 'sandbox_scenario',
    correct: async (c) => {
      await composeSandboxPrompt(c);
      await sendSandboxPrompt(c);
      await rateSandbox(c, 'top');
    },
    why: 'avaliar errado NÃO emite veredito: o sandbox rejeita e pede nova avaliação (ver `sandboxRejeitaAvaliacaoErrada`).',
  },
  sandbox_choices: {
    kind: 'sandbox_scenario',
    correct: async (c) => {
      await composeSandboxPrompt(c, 'redação de escola');
      await sendSandboxPrompt(c);
      await rateSandbox(c, 'top');
    },
    why: 'mesmo motivo do `sandbox_open`: avaliar errado é rejeitado, não vira veredito negativo.',
  },
  sandbox_slots: {
    kind: 'sandbox_scenario',
    why:
      'a variante de SLOTS monta o prompt preenchendo lacunas com um mecanismo próprio ' +
      '(`SandboxSlotPanel`), coberto por `SandboxScenarioActivity.test.tsx`. Dirigi-la aqui ' +
      'duplicaria aquele teste sem provar nada novo sobre o INVARIANTE.',
  },
  sandbox_byoc_live: {
    kind: 'sandbox_scenario',
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
   * ⚠️ ACHADO, registrado em vez de escondido: o `sandbox_scenario` NÃO se
   * comporta como os outros aqui. `SandboxScenarioShell` trata `done` (e
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

  /**
   * A PREMISSA DO `sameScreen` NA MATRIZ, MEDIDA.
   *
   * `activityMatrixCoverage.test.ts` marca 7 células de `chat_sandbox` como
   * `sameScreen` da story do `sandbox_scenario`, afirmando que uma story nova
   * seria "a mesma árvore renderizada por um `kind` diferente". Isso é o que
   * autoriza não duplicar as stories — e era a única parte do guard que ninguém
   * verificava: se `chat_sandbox` ganhar um componente próprio, as 7 células
   * passariam a apontar para a tela de OUTRO kind e o guard seguiria verde.
   *
   * Aqui a afirmação vira medição. O `data-activity-kind` é normalizado de
   * propósito: ele DEVE diferir (é a row se anunciando pelo seu próprio kind, o
   * bug que este lote consertou); o resto da árvore é que não pode.
   */
  it('chat_sandbox renderiza a MESMA árvore do sandbox_scenario (premissa do `sameScreen`)', () => {
    const treeOf = (key: ContractKey) => {
      const canvas = mount(activityFor(key), vi.fn());
      const html = canvas.innerHTML;
      expect(html.length, `arvore vazia para ${key}`).toBeGreaterThan(500);
      cleanup();
      return html.replace(/data-activity-kind="(chat_sandbox|sandbox_scenario)"/g, 'kind="KIND"');
    };
    expect(treeOf('chat_sandbox')).toBe(treeOf('sandbox_open'));
    expect(consoleErrors).toEqual([]);
  });
});
