/**
 * Property-based tests over SEQUENCES OF ACTIONS on the pure sandbox reducers
 * (`@iterahq/activity-spec/runtime`).
 *
 * Plano: 20260728-itera-activity-testing — Fase 5, forma restrita (ADR-11 §3).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE `fast-check` AQUI E SÓ AQUI
 * ────────────────────────────────────────────────────────────────────────────
 * O ADR-11 fecha três coisas, e este arquivo respeita as três:
 *
 *  1. NÃO gerar `spec` a partir dos schemas Zod. `@fast-check/zod` não existe e
 *     `zod-fast-check` é stale / de compatibilidade não confirmada com o nosso
 *     `zod@3.25`; espelhar 11 schemas à mão produziria falso-vermelho (gerar
 *     spec que o schema rejeitaria) ou falso-verde (parar de gerar o que ele
 *     aceita). Os cenários abaixo vêm INTEIROS das fixtures de contrato que já
 *     existem e que o guard `activityContractFixtures.test.ts` já valida com
 *     `safeParseActivitySpec` (ADR-13). Nada é fabricado aqui.
 *
 *  2. NÃO usar property-based sobre `answerMachine`. O espaço de entrada dela é
 *     5 booleanos = 32 combinações, já ENUMERADAS exaustivamente na Fase 1
 *     (#183). Enumeração prova; fuzzing amostra.
 *
 *  3. Property-based ganha de verdade sobre SEQUÊNCIAS de ações nos reducers do
 *     sandbox — espaço não enumerável, e sem nenhuma dependência de Zod. É este
 *     arquivo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE ARQUIVO NÃO COBRE (declarado de propósito)
 * ────────────────────────────────────────────────────────────────────────────
 *  - Nada de React/render. Os reducers são puros; se o componente não ligar o
 *    botão ao estado, estas properties passam verdes (isso é T1, Fase 3).
 *  - Só o sandbox DETERMINÍSTICO. O contrato `sandbox_byoc_live` é
 *    `validated: false` e nem sequer é um `Scenario` do runtime (não tem
 *    `initialState`/`steps`) — ele é reconhecido por `isByocLive()` e vive num
 *    hook diferente (`useSandboxScenarioLive`). O filtro abaixo o exclui por
 *    construção, via `validated === true`.
 *  - `isSuccess` monótono é provado SOBRE ESTAS FIXTURES, não como garantia
 *    universal do runtime — ver o comentário da property P5.
 */
import { afterAll, describe, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  check,
  chooseOption,
  collectNeeds,
  composeUserText,
  evaluate,
  initialModel,
  isSuccess,
  resetInputs,
  sendPrompt,
  setSlot,
  t,
  type ChatModel,
  type Locale,
  type Quality,
  type Scenario,
} from '@iterahq/activity-spec/runtime';
import { ACTIVITY_CONTRACTS } from '@/stories/contractFixtures';

/* ------------------------------------------------------------------ *
 * Orçamento de CI — ADR-9 (o tier novo não pode virar o custo do PR).
 * ------------------------------------------------------------------ *
 * Baseline da Fase 0: job `build-test` = 3m01s, dos quais `npm test` = 2m18s.
 * O teto acordado para o job bloqueante é ~4m30s, então este arquivo tem que
 * ficar no RUÍDO (segundos), não no orçamento.
 *
 * NUM_RUNS = 200 por property × 3 cenários × 8 properties = 4.800 sequências.
 * MEDIDO neste repo, arquivo isolado (3 rodadas): `tests` 641ms / 655ms / 913ms,
 * wall 2.7s–3.2s — e desse wall, ~2s é startup do vitest (transform + import +
 * environment jsdom) que o `npm test` completo já paga de qualquer jeito.
 * Contra os 2m18s de `npm test` no CI, o trabalho das properties é <1s: ruído
 * dentro da variação natural de 2m45s–3m24s do job `build-test`.
 *
 * Por que 200 e não outro número — medido, não chutado:
 *   -  200 → `tests` ~0,7s
 *   - 5000 (25×) → `tests` ~21s   ⇐ já visível no job, e sem achado novo:
 *     as 8 properties passam idênticas nos dois níveis.
 * O custo cresce com NUM_RUNS, então o teto prático aqui é ~1000. 200 fica
 * acima do default 100 do fast-check (as sequências são baratas: zero I/O,
 * zero render, tudo objeto puro) e bem abaixo do ponto em que aparece no
 * orçamento. Se este arquivo começar a aparecer no wall-clock do `build-test`,
 * BAIXE este número — não crie um job novo (ADR-9).
 *
 * SEED fixo: uma falha no CI é reproduzível localmente com o mesmo comando,
 * sem caçar o seed no log. Trade-off assumido: com seed fixo o conjunto de
 * casos não muda entre runs, então estas properties são um GATE ESTÁVEL, não
 * um fuzzer contínuo. Para explorar mais, rode localmente com outro seed:
 *   npx vitest run src/test/sandboxRuntime.properties.test.ts -t <nome>
 * trocando FC_PARAMS.seed.
 */
const NUM_RUNS = 200;
const FC_PARAMS = { numRuns: NUM_RUNS, seed: 20260728, verbose: 1 } as const;

const LOCALES: Locale[] = ['pt', 'en'];

/* ------------------------------------------------------------------ *
 * Os cenários sob teste — vêm das fixtures de contrato, não de mock.
 * ------------------------------------------------------------------ */

type NamedScenario = { key: string; scenario: Scenario };

const SANDBOX_SCENARIOS: NamedScenario[] = Object.entries(ACTIVITY_CONTRACTS)
  .filter(([, c]) => c.kind === 'sandbox_scenario' && c.validated)
  .map(([key, c]) => ({ key, scenario: c.spec as unknown as Scenario }));

/* ------------------------------------------------------------------ *
 * O modelo de ações — exatamente as 5 que o hook expõe ao aluno.
 * ------------------------------------------------------------------ */

type Action =
  | { t: 'send' }
  | { t: 'choose'; id: string }
  | { t: 'setSlot'; id: string; value: string }
  | { t: 'evaluate'; rating: Quality }
  | { t: 'reset'; slots: string[]; choices: string[] };

function apply(sc: Scenario, model: ChatModel, action: Action, locale: Locale): ChatModel {
  switch (action.t) {
    case 'send':
      return sendPrompt(sc, model, locale);
    case 'choose':
      return chooseOption(sc, model, action.id);
    case 'setSlot':
      return setSlot(sc, model, action.id, action.value);
    case 'evaluate':
      return evaluate(sc, model, action.rating);
    case 'reset':
      return resetInputs(sc, model, { slots: action.slots, choices: action.choices });
  }
}

/** Ids que o cenário conhece + um id que ele NÃO conhece (estresse de totalidade). */
function idArb(known: string[]): fc.Arbitrary<string> {
  return fc.oneof(
    { weight: 4, arbitrary: known.length ? fc.constantFrom(...known) : fc.constant('__none__') },
    { weight: 1, arbitrary: fc.constantFrom('__unknown__', '', 'constructor', '__proto__') },
  );
}

/**
 * Valores de slot com os extremos que quebram string handling na vida real:
 * vazio, só espaço, unicode/emoji, string longa, e o token de interpolação
 * `{{...}}` que o runtime usa em `interpolate()`.
 */
const slotValueArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.string({ minLength: 0, maxLength: 24 }) },
  { weight: 2, arbitrary: fc.constantFrom('', '   ', '🎯 emoji', 'ação/ç~ã', '{{persona}}', 'a'.repeat(500)) },
  { weight: 2, arbitrary: fc.constantFrom('irmao-pequeno', 'cliente-loja', 'prova-escola') },
);

function actionArb(sc: Scenario): fc.Arbitrary<Action> {
  const slotIds = (sc.slots ?? []).map((s) => s.id);
  const choiceIds = (sc.choices ?? []).map((c) => c.id);
  return fc.oneof(
    { weight: 4, arbitrary: fc.constant<Action>({ t: 'send' }) },
    { weight: 3, arbitrary: idArb(choiceIds).map((id) => ({ t: 'choose', id }) as Action) },
    {
      weight: 3,
      arbitrary: fc
        .tuple(idArb(slotIds), slotValueArb)
        .map(([id, value]) => ({ t: 'setSlot', id, value }) as Action),
    },
    {
      weight: 4,
      arbitrary: fc
        .constantFrom<Quality[]>('ruim', 'top')
        .map((rating) => ({ t: 'evaluate', rating }) as Action),
    },
    {
      weight: 2,
      arbitrary: fc
        .tuple(fc.subarray(slotIds), fc.subarray(choiceIds))
        .map(([slots, choices]) => ({ t: 'reset', slots, choices }) as Action),
    },
  );
}

/** Sequências curtas: o cenário mais longo tem 2 passos, 12 ações passeiam bem além do fim. */
function sequenceArb(sc: Scenario): fc.Arbitrary<Action[]> {
  return fc.array(actionArb(sc), { minLength: 0, maxLength: 12 });
}

const localeArb = fc.constantFrom(...LOCALES);

/* ------------------------------------------------------------------ *
 * Helpers de asserção.
 * ------------------------------------------------------------------ */

/** Snapshot estrutural para provar que os reducers não MUTAM a entrada. */
function snapshot(m: ChatModel): string {
  return JSON.stringify({
    slots: m.slots,
    messages: m.messages,
    ranPromptCount: m.ranPromptCount,
    choicesMade: [...m.choicesMade].sort(),
    lastResultKey: m.lastResultKey,
    runs: m.runs,
    completedSteps: [...m.completedSteps].sort(),
    evaluations: m.evaluations,
  });
}

/** O `stepIdx` do hook, re-derivado aqui (useSandboxScenario.ts:44-45). */
function stepIdxOf(sc: Scenario, m: ChatModel): number {
  const current = sc.steps.find((s) => !m.completedSteps.has(s.id)) ?? null;
  return current ? sc.steps.indexOf(current) : sc.steps.length;
}

/** Roda uma sequência e devolve TODOS os modelos intermediários (incluindo o inicial). */
function trace(sc: Scenario, actions: Action[], locale: Locale): ChatModel[] {
  const models = [initialModel(sc, locale)];
  for (const a of actions) models.push(apply(sc, models[models.length - 1], a, locale));
  return models;
}

/* ------------------------------------------------------------------ *
 * As properties.
 * ------------------------------------------------------------------ */

describe.each(SANDBOX_SCENARIOS)('sandbox runtime properties · $key', ({ scenario }) => {
  const stepIds = scenario.steps.map((s) => s.id);

  /**
   * Guarda de VACUIDADE. P3 e P5 falam sobre modelos `won`; se as sequências
   * geradas nunca chegassem a vencer, as duas passariam verdes sem testar nada
   * — o modo de falha silencioso clássico de property-based. Este contador é
   * alimentado por P3 e conferido no `afterAll`: se o gerador (ou o cenário)
   * mudar a ponto de nunca mais vencer, o arquivo fica VERMELHO em vez de
   * virar decoração.
   */
  let wonStatesSeen = 0;
  afterAll(() => {
    expect(wonStatesSeen).toBeGreaterThan(0);
  });

  /**
   * P1 — TOTALIDADE. Nenhuma sequência de ações lança, e todo modelo alcançável
   * satisfaz os invariantes estruturais do `ChatModel`.
   *
   * É o análogo, no nível do runtime, do invariante do Tainan ("metadata
   * confiável ⇒ nunca falha"): dado um spec que passa no Zod do kind, NENHUMA
   * sequência de ações do aluno derruba a máquina. Cobre ids desconhecidos,
   * slots inexistentes, `evaluate` antes de qualquer `send`, e `reset` de
   * coisas que nunca foram setadas.
   *
   * NÃO cobre: spec inválido (é o eixo F da matriz, coberto por outro tier) —
   * aqui os cenários são, por construção, os já validados.
   */
  test.prop([sequenceArb(scenario), localeArb], FC_PARAMS)(
    'P1 — nenhuma sequência de ações lança, e todo modelo alcançável é bem-formado',
    (actions, locale) => {
      const models = trace(scenario, actions, locale);
      for (const m of models) {
        // `runs` e `ranPromptCount` contam a MESMA coisa e nunca divergem.
        expect(m.runs.length).toBe(m.ranPromptCount);
        // Toda avaliação aponta para um run que existe, e há no máximo uma por run.
        const indices = m.evaluations.map((e) => e.runIndex);
        expect(new Set(indices).size).toBe(indices.length);
        for (const e of m.evaluations) {
          expect(e.runIndex).toBeGreaterThanOrEqual(0);
          expect(e.runIndex).toBeLessThan(m.runs.length);
        }
        // Toda mensagem tem texto string (o `interpolate` do runtime nunca vaza undefined).
        for (const msg of m.messages) expect(typeof msg.text).toBe('string');
        // `lastResultKey`, quando existe, é uma chave real de `cannedResults`
        // ou o fallback do resolver.
        if (m.lastResultKey !== null) {
          const known = Object.keys(scenario.initialState.cannedResults);
          expect([...known, scenario.initialState.resultResolver.fallback]).toContain(m.lastResultKey);
        }
      }
    },
  );

  /**
   * P2 — PUREZA. Nenhum reducer muta o modelo que recebe.
   *
   * Não é decorativo: `useSandboxScenario` faz `setModel(fn())` com o `model`
   * do render corrente capturado no closure. Se um reducer mutasse a entrada,
   * o React não veria mudança de identidade em algum caminho e o bug seria
   * invisível em teste de componente.
   */
  test.prop([sequenceArb(scenario), localeArb], FC_PARAMS)(
    'P2 — os reducers são puros: nunca mutam o modelo de entrada',
    (actions, locale) => {
      let model = initialModel(scenario, locale);
      for (const a of actions) {
        const before = snapshot(model);
        const next = apply(scenario, model, a, locale);
        expect(snapshot(model)).toBe(before);
        model = next;
      }
    },
  );

  /**
   * P3 — `evaluate` NUNCA transiciona para FORA de `won` (ADR-11 §3, nomeada).
   *
   * Para todo modelo alcançável já vencedor, avaliar de novo — com QUALQUER
   * rating, inclusive o errado — mantém `isSuccess` verdadeiro.
   *
   * Por que vale: `evaluate` reescreve a `Evaluation` do último run
   * (`filter(e => e.runIndex !== runIndex)` + push), então um `success` que
   * dependesse de `evaluated { correct: true }` DIRETAMENTE poderia flipar.
   * Nos 3 cenários reais o `success` é `stepCompleted`, e `completedSteps` só
   * cresce (`withSteps` faz `add`, nunca `delete`) — daí a garantia. Ver P5
   * para a fronteira exata dessa garantia.
   */
  test.prop([sequenceArb(scenario), localeArb, fc.constantFrom<Quality[]>('ruim', 'top')], FC_PARAMS)(
    'P3 — evaluate nunca transiciona para fora de `won`',
    (actions, locale, rating) => {
      for (const m of trace(scenario, actions, locale)) {
        if (!isSuccess(scenario, m)) continue;
        wonStatesSeen += 1;
        expect(isSuccess(scenario, evaluate(scenario, m, rating))).toBe(true);
      }
    },
  );

  /**
   * P4 — `resetInputs` é IDEMPOTENTE (ADR-11 §3, nomeada).
   *
   * `reset(reset(m, ids), ids)` é estruturalmente igual a `reset(m, ids)`, para
   * qualquer modelo alcançável e qualquer subconjunto de slots/choices.
   *
   * Não é trivial: `resetInputs` termina em `withSteps()`, que RE-AVALIA o
   * unlock de todo passo e pode ADICIONAR passos concluídos. Como o predicado
   * `stepCompleted` lê `completedSteps`, uma segunda passada poderia, em tese,
   * destravar um passo a mais (cascata para trás na ordem de `sc.steps`) e
   * quebrar a idempotência. A property prova que isso não acontece nos
   * cenários reais.
   */
  test.prop([sequenceArb(scenario), localeArb], FC_PARAMS)(
    'P4 — resetInputs é idempotente',
    (actions, locale) => {
      const slotIds = (scenario.slots ?? []).map((s) => s.id);
      const choiceIds = (scenario.choices ?? []).map((c) => c.id);
      const ids = { slots: slotIds, choices: choiceIds };
      for (const m of trace(scenario, actions, locale)) {
        const once = resetInputs(scenario, m, ids);
        const twice = resetInputs(scenario, once, ids);
        expect(snapshot(twice)).toBe(snapshot(once));
      }
    },
  );

  /**
   * P5 — `isSuccess` é MONÓTONO: uma vez `won`, nenhuma ação o desfaz.
   *
   * ⚠️ FRONTEIRA — leia antes de generalizar. Isto é provado SOBRE AS FIXTURES
   * REAIS, e vale nelas porque os três cenários definem
   * `success = { stepCompleted: { id } }`, e `completedSteps` é monótono por
   * construção (`withSteps` só faz `add`).
   *
   * NÃO é uma garantia universal do runtime: um cenário cujo `success` usasse
   * `slotFilled` seria desfeito por `resetInputs`, e um que usasse
   * `evaluated { correct: true }` seria desfeito por um `evaluate` com o rating
   * errado. O runtime não impede nem um nem outro. Ver o teste-fronteira
   * "documenta a fronteira" abaixo, que prova essa não-garantia explicitamente
   * usando o predicado `check` sobre as MESMAS fixtures — sem inventar spec.
   */
  test.prop([sequenceArb(scenario), localeArb], FC_PARAMS)(
    'P5 — isSuccess é monótono (uma vez `won`, nunca volta)',
    (actions, locale) => {
      let seenWon = false;
      for (const m of trace(scenario, actions, locale)) {
        const won = isSuccess(scenario, m);
        if (seenWon) expect(won).toBe(true);
        seenWon = seenWon || won;
      }
    },
  );

  /**
   * P6 — O índice de passo fica SEMPRE dentro dos limites.
   *
   * `stepIdx` é o que o hook usa para renderizar "passo N de M"; um índice fora
   * de faixa é um crash de UI. Junto: `completedSteps` nunca contém id que não
   * seja de um passo do cenário (ids desconhecidos entram por `choose`/`setSlot`
   * na sequência gerada, e não podem contaminar o conjunto de passos).
   */
  test.prop([sequenceArb(scenario), localeArb], FC_PARAMS)(
    'P6 — stepIdx ∈ [0, steps.length] e completedSteps ⊆ ids dos passos',
    (actions, locale) => {
      for (const m of trace(scenario, actions, locale)) {
        const idx = stepIdxOf(scenario, m);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(scenario.steps.length);
        for (const id of m.completedSteps) expect(stepIds).toContain(id);
        expect(m.completedSteps.size).toBeLessThanOrEqual(scenario.steps.length);
      }
    },
  );

  /**
   * P7 — `composeUserText` é TOTAL sobre modelos alcançáveis.
   *
   * Sempre devolve string, sempre começa pelo `basePrompt` do cenário (é o
   * `parts[0]` do runtime), e todo slot preenchido de tipo `text` aparece no
   * texto composto — que é literalmente o que o aluno vê no composer.
   *
   * NÃO cobre: slots `select`, cujo valor entra como rótulo entre parênteses
   * (`optionLabels`), não como o valor cru — asserir "inclui o valor" ali seria
   * falso. A property distingue os dois casos em vez de enfraquecer para
   * "é string".
   */
  test.prop([sequenceArb(scenario), localeArb], FC_PARAMS)(
    'P7 — composeUserText é total e sempre começa pelo basePrompt',
    (actions, locale) => {
      const base = t(scenario.initialState.basePrompt, locale);
      for (const m of trace(scenario, actions, locale)) {
        const text = composeUserText(scenario, m, locale);
        expect(typeof text).toBe('string');
        expect(text.startsWith(base)).toBe(true);
        for (const slot of scenario.slots ?? []) {
          const v = m.slots[slot.id];
          if (!v || slot.kind === 'select') continue;
          expect(text).toContain(v);
        }
      }
    },
  );

  /**
   * P8 — `collectNeeds` é TOTAL e coerente com o cenário.
   *
   * Para todo passo, `collectNeeds(step.unlock)` devolve um `StepNeeds`
   * bem-formado cujos slots/choices referenciados EXISTEM no cenário. É o que o
   * hook usa para decidir o que expor ao aluno (`exposedSlotIds` /
   * `exposedChoiceIds` quando não há `expose` explícito): um id fantasma aqui
   * vira um passo impossível de completar na UI.
   *
   * Roda dentro da property (e não como teste de exemplo) porque `collectNeeds`
   * é chamado a cada render, sobre o passo corrente, que depende da sequência.
   */
  test.prop([sequenceArb(scenario), localeArb], FC_PARAMS)(
    'P8 — collectNeeds é total e só referencia slots/choices que existem',
    (actions, locale) => {
      const slotIds = (scenario.slots ?? []).map((s) => s.id);
      const choiceIds = (scenario.choices ?? []).map((c) => c.id);
      for (const m of trace(scenario, actions, locale)) {
        const current = scenario.steps.find((s) => !m.completedSteps.has(s.id));
        if (!current) continue;
        const needs = collectNeeds(current.unlock);
        expect(typeof needs.send).toBe('boolean');
        expect(typeof needs.evaluate).toBe('boolean');
        for (const id of needs.slots) expect(slotIds).toContain(id);
        for (const id of needs.choices) expect(choiceIds).toContain(id);
      }
    },
  );
});

/* ------------------------------------------------------------------ *
 * A fronteira de P3/P5 — provada, não afirmada.
 * ------------------------------------------------------------------ *
 * P3 ("evaluate nunca sai de won") e P5 ("isSuccess é monótono") passam sobre
 * as 3 fixtures reais, mas NÃO são invariantes do runtime — são consequências
 * de os 3 cenários definirem `success = { stepCompleted }`, e de `completedSteps`
 * só crescer.
 *
 * Estes dois testes provam a não-garantia usando o predicado `check` exportado
 * pelo runtime, sobre os MESMOS modelos alcançáveis das MESMAS fixtures — nenhum
 * spec é inventado. Se um dia o back-office (ADR-13) autorizar um `success` que
 * dependa de `slotFilled` ou de `evaluated`, P3/P5 param de valer e é AQUI que
 * está escrito o porquê.
 */
describe('fronteira de P3/P5 — o runtime NÃO garante monotonicidade em geral', () => {
  const withSlots = SANDBOX_SCENARIOS.find(({ scenario }) => (scenario.slots ?? []).length > 0);

  test('um `success` baseado em `slotFilled` seria DESFEITO por resetInputs', () => {
    expect(withSlots).toBeDefined();
    const sc = withSlots!.scenario;
    const slotId = sc.slots![0].id;
    const pred = { slotFilled: { slot: slotId } };

    const filled = setSlot(sc, initialModel(sc, 'pt'), slotId, 'um valor qualquer');
    expect(check(filled, pred)).toBe(true);

    const cleared = resetInputs(sc, filled, { slots: [slotId] });
    expect(check(cleared, pred)).toBe(false); // ⇐ não-monótono
  });

  test('um `success` baseado em `evaluated { correct: true }` seria DESFEITO por um evaluate errado', () => {
    const sc = SANDBOX_SCENARIOS[0].scenario;
    const pred = { evaluated: { correct: true } };

    const sent = sendPrompt(sc, initialModel(sc, 'pt'), 'pt');
    const actualQuality = sent.runs[sent.runs.length - 1].quality;
    const wrongQuality: Quality = actualQuality === 'top' ? 'ruim' : 'top';

    const rightRating = evaluate(sc, sent, actualQuality);
    expect(check(rightRating, pred)).toBe(true);

    const thenWrong = evaluate(sc, rightRating, wrongQuality);
    expect(check(thenWrong, pred)).toBe(false); // ⇐ evaluate SAI de "avaliou certo"
  });
});
