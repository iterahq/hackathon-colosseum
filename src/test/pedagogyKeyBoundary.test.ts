import { describe, it, expect } from 'vitest';
import { ACTIVITY_KINDS, safeParseActivitySpec, type ActivityKind } from '@iterahq/activity-spec';
import { buildPedagogicalContext } from '@/utils/pedagogicalContext';

/**
 * `spec.pedagogy` TEM QUE ATRAVESSAR A FRONTEIRA DE VALIDAÇÃO DE SPEC.
 *
 * Plano `20260803-itera-learning-control-plane-prototipo` (LCPWCI), Fase 1 +
 * Tier 1 da matriz da v5.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE NÃO É REDUNDANTE COM
 * `pedagogicalContext.test.ts`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Aquele arquivo prova que `buildPedagogicalContext` LÊ o bloco autorado. Este
 * prova que o bloco **chega até ele** — que é uma propriedade de OUTRO módulo,
 * de outro repo, e que hoje só se sustenta por um acidente feliz.
 *
 * A cadeia real, medida em produção em 2026-08-07:
 *
 *   `itera.activities.spec` (com o bloco `pedagogy` autorado)
 *        ↓ `ActivityRenderer` → `validateActivitySpec` → `safeParseActivitySpec`
 *          ⚠️ FAIL-CLOSED desde a fronteira dos 12 kinds: spec que não passa
 *             NÃO renderiza — vira o card de spec inválido.
 *        ↓ `buildPedagogicalContext(current)`
 *        ↓ `itera.activity_traces.pedagogical_context`
 *
 * `pedagogy` é uma chave que NENHUM schema por kind declara. Ela sobrevive hoje
 * porque o default do Zod `z.object` é **strip** — chave desconhecida é
 * ignorada, não rejeitada — **e porque ninguém consome a saída do parse**: o
 * `itera-mcp` grava o `spec` cru que recebeu, e esta fronteira usa o parse só
 * como predicado. A matriz da Fase 4 inteira depende dessa coincidência entre
 * dois repos, não de um contrato.
 *
 * ⚠️ **DOIS modos de falha, os dois silenciosos, e os dois já aprovados como
 * mudança** (kinds `strict` + o MCP passando a gravar o valor parseado):
 *
 *   1. **Aperto para `.strict()`** → a chave passa a ser REJEITADA. Como a
 *      fronteira deste repo é **fail-closed**, isso não "degrada a anotação":
 *      as 8 atividades do Tier 1 param de RENDERIZAR, e o aluno vê o card de
 *      "spec inválido" numa atividade que ninguém editou.
 *   2. **O MCP passar a gravar `parsed.data`** → a chave é DELETADA na próxima
 *      escrita, sem erro e sem log. A atividade renderiza igual; o trace passa
 *      a nascer `authored: false`, e a perda só aparece meses depois, na
 *      análise.
 *
 * Este arquivo cobre os dois: o `it.each` abaixo é o alarme de (1); o teste de
 * caracterização marcado 🩹 é o alarme de (2).
 *
 * A correção certa para ambos é a mesma e está rastreada em
 * **iterahq/activity-spec#24**: declarar `pedagogy` como chave opcional
 * legítima no pacote — com o CONTEÚDO dela deliberadamente aberto, porque o
 * ADR-2 exige que campo de gramática inventado no futuro sobreviva verbatim.
 * Se um destes testes ficar vermelho num PR que aperta schema, a ação NÃO é
 * apagar o teste.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O BLOCO É INERTE PARA O RENDERER — E ISSO É O PONTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Nenhum componente lê `spec.pedagogy`. Ele existe só para ser capturado no
 * instante da tentativa (ADR-13). Por isso ele nunca pode ser motivo de
 * REJEIÇÃO de um spec: uma etiqueta de instrumento derrubando a tela do aluno
 * inverte a prioridade inteira do produto.
 */

/**
 * O bloco `pedagogy` de `T-E-1`, VERBATIM como foi autorado em produção
 * (célula `T-E` da matriz v5, Tier 1). Copiado do dado real de propósito: um
 * fixture inventado testaria a forma que eu imagino, não a que existe.
 */
const T_E_1_PEDAGOGY = {
  mental_structures: ['estado'],
  metaphor: 'tanques_valvulas',
  difficulty: 'intro',
  objective: 'Prever o estado (nível) após N passos, sem rodar',
  // os cinco campos de manifesto do item 11 da Verification:
  structure: 'estado',
  role: 'matched',
  varied_attribute: null,
  held_constant: ['vazoes', 'tempo', 'topologia', 'primitivas'],
  cell: 'T-E',
  matrix_id: 'T-E-1',
  mechanic: 'previsao',
  regime: 'continuo',
  grammar_version: 'v0',
  matrix_version: 'v5',
  tier: 1,
  plan: '20260803-itera-learning-control-plane-prototipo',
} as const;

/**
 * Um spec MÍNIMO e VÁLIDO por kind, para os kinds que a matriz usa hoje.
 *
 * Deliberadamente só estes dois: o teste tem que falhar por causa da chave
 * `pedagogy`, nunca por um fixture que envelheceu contra outro schema. Kind
 * novo entrando na matriz entra aqui junto.
 */
const MINIMAL_VALID_SPEC: Partial<Record<ActivityKind, Record<string, unknown>>> = {
  single_choice: {
    instruction: { text: { pt: 'enunciado' } },
    options: [
      { id: 'a', label: { pt: 'A' } },
      { id: 'b', label: { pt: 'B' } },
    ],
    correct_option_id: 'a',
  },
  order: {
    instruction: { text: { pt: 'enunciado' } },
    items: [
      { id: 'a', label: { pt: 'A' } },
      { id: 'b', label: { pt: 'B' } },
    ],
    correct_order: ['a', 'b'],
  },
};

const MATRIX_KINDS = Object.keys(MINIMAL_VALID_SPEC) as ActivityKind[];

describe('spec.pedagogy atravessa a fronteira de validação', () => {
  it.each(MATRIX_KINDS)(
    'kind "%s": um spec válido continua válido COM o bloco pedagogy',
    (kind) => {
      const base = MINIMAL_VALID_SPEC[kind]!;

      // Pré-condição: o fixture é válido SEM o bloco. Se isto quebrar, o
      // fixture envelheceu — conserte o fixture, não a asserção abaixo.
      expect(safeParseActivitySpec(kind, base).success).toBe(true);

      const withPedagogy = { ...base, pedagogy: T_E_1_PEDAGOGY };
      const parsed = safeParseActivitySpec(kind, withPedagogy);

      expect(
        parsed.success,
        `\`pedagogy\` passou a ser REJEITADA para o kind "${kind}". A fronteira de ` +
          'spec é fail-closed, então isto NÃO degrada a anotação — derruba a ' +
          'renderização das atividades da matriz do Tier 1. Declare `pedagogy` ' +
          'como chave opcional em @iterahq/activity-spec em vez de apagar este teste.'
      ).toBe(true);
    }
  );

  /**
   * ⚠️ TESTE DE CARACTERIZAÇÃO — ele fixa um DEFEITO, não um contrato desejado.
   *
   * `pedagogy` não é declarada por schema nenhum, então o Zod a **descarta** na
   * saída do parse. Hoje isso é inofensivo em dois lugares e só em dois:
   *
   *   - o `itera-mcp` grava o `spec` **cru** que recebeu, não o valor parseado;
   *   - a fronteira deste repo usa o parse só como PREDICADO (passa/não passa) e
   *     renderiza a partir do `spec` original.
   *
   * Ou seja: o bloco sobrevive porque **ninguém consome a saída do parse**. Isso
   * é uma coincidência de implementação em dois repos, não uma garantia — e
   * Tainan já aprovou mudar exatamente ela (kinds `strict` + o MCP passando a
   * gravar o valor parseado). No dia em que qualquer um dos dois lados passar a
   * usar a saída, `spec.pedagogy` é **deletada na próxima escrita, sem erro**.
   *
   * Este teste passa HOJE porque descreve o mundo como ele é. Quando `pedagogy`
   * virar campo DECLARADO no `@iterahq/activity-spec` — que é a correção certa,
   * rastreada em iterahq/activity-spec#24 — ele fica **vermelho**, e a ação
   * correta é apagá-lo com a nota de que o buraco fechou. Um teste vermelho é a
   * notificação; o silêncio de hoje é o problema.
   */
  it('🩹 HOJE a saída do parse PERDE o bloco — por isso ele precisa ser declarado', () => {
    const parsed = safeParseActivitySpec('single_choice', {
      ...MINIMAL_VALID_SPEC.single_choice,
      pedagogy: T_E_1_PEDAGOGY,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(
      parsed.data,
      'Se isto ficou vermelho, `pedagogy` passou a ser declarada no pacote — ' +
        'apague este teste de caracterização (o buraco fechou) e mantenha os outros.'
    ).not.toHaveProperty('pedagogy');
  });

  it('todo kind da matriz está coberto pelo enum canônico', () => {
    // Um kind renomeado no pacote não pode passar despercebido aqui.
    for (const kind of MATRIX_KINDS) {
      expect(ACTIVITY_KINDS).toContain(kind);
    }
  });

  it('o bloco chega inteiro no contexto: metáfora, estrutura e manifesto', () => {
    const context = buildPedagogicalContext({
      kind: 'single_choice',
      spec: { ...MINIMAL_VALID_SPEC.single_choice, pedagogy: T_E_1_PEDAGOGY },
    });

    // O que a Fase 4 consulta por nome.
    expect(context.authored).toBe(true);
    expect(context.metaphor).toBe('tanques_valvulas');
    expect(context.mental_structures).toEqual(['estado']);
    expect(context.difficulty).toBe('intro');

    // Os cinco campos de manifesto do item 11 sobrevivem em `extra` — sem que
    // este build precise conhecê-los (a costura do ADR-2).
    expect(context.extra).toMatchObject({
      structure: 'estado',
      role: 'matched',
      varied_attribute: null,
      held_constant: ['vazoes', 'tempo', 'topologia', 'primitivas'],
      matrix_id: 'T-E-1',
    });
  });

  it('`metaphor` NULL só acontece quando não há bloco — nunca por perda no caminho', () => {
    // A causa-raiz medida em 2026-08-07: 78 traces anotados, `metaphor` NULL em
    // TODOS os 78. Não havia defeito de pipeline — as 4 únicas atividades do
    // catálogo com bloco `pedagogy` simplesmente não declaravam a chave. Este
    // teste fixa a distinção para que a próxima investigação não a refaça.
    const semBloco = buildPedagogicalContext({
      kind: 'single_choice',
      spec: MINIMAL_VALID_SPEC.single_choice,
    });
    expect(semBloco.authored).toBe(false);
    expect(semBloco.metaphor).toBeNull();

    const blocoSemMetafora = buildPedagogicalContext({
      kind: 'single_choice',
      spec: {
        ...MINIMAL_VALID_SPEC.single_choice,
        pedagogy: { mental_structures: ['estado'], objective: 'x' },
      },
    });
    // `authored: true` + `metaphor: null` = "olhamos, o bloco existe, e ele não
    // nomeia metáfora nenhuma". É um buraco de AUTORIA, e a linha diz isso.
    expect(blocoSemMetafora.authored).toBe(true);
    expect(blocoSemMetafora.metaphor).toBeNull();
  });
});
