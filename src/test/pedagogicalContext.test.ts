import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * FASE 1 do plano `20260803-itera-learning-control-plane-prototipo` (LCPWCI) —
 * o CONTEXTO PEDAGÓGICO viaja na linha do trace (migration 0038).
 * Superfície fixada pela Q `b819fa14` (Tainan TG 2026-08-03, opção A: *"só o
 * Itera Player"*).
 *
 * A propriedade sob teste não é "a coluna é escrita". São três:
 *
 *   ⛓️ 1. A TAG NÃO PODE SER RE-DERIVADA DEPOIS. A gramática é viva por
 *         DECISÃO — o ADR-5 diz que estrutura entra e sai por poder preditivo
 *         medido. Uma tentativa etiquetada por join se re-etiqueta sozinha toda
 *         vez que a gramática muda, e aí a ablação da Fase 4 mede a própria
 *         contabilidade em vez do aluno. O teste marcado 🔒 abaixo edita a tag
 *         DEPOIS da tentativa e exige que a linha já escrita não se mexa.
 *
 *   📦 2. NADA AUTORADO É DESCARTADO. O ADR-2 exige evento bruto guardado de
 *         forma generosa, pra que mudança de gramática vire job de
 *         reprocessamento e não migração de cliente. Na prática: chave que este
 *         build não reconhece sobrevive verbatim em `extra` — inclusive uma
 *         chave ESCRITA ERRADO, que é o caso em que descartar doeria mais.
 *
 *   🪜 3. A ANOTAÇÃO NOVA NUNCA CUSTA A ANTIGA, E NENHUMA DAS DUAS CUSTA A
 *         SEQUÊNCIA. Mergear NÃO aplica migration neste repo (um humano roda
 *         `db/scripts/apply-migrations.sh`), então "build no ar, coluna
 *         ausente" é estado normal de rollout — e agora são DUAS migrations
 *         decorando a mesma linha (0037 e 0038), aplicáveis em momentos
 *         diferentes.
 */

/** Every row handed to `.insert()` / `.upsert()`, keyed by table. */
const inserts: Record<string, Array<Record<string, unknown>>> = {};
const upserts: Record<string, Array<{ payload: Record<string, unknown>; opts?: unknown }>> = {};

/** Lets a test make one write fail the way PostgREST does for an unknown column. */
let errorFor:
  | ((table: string, payload: Record<string, unknown>) => { message: string } | null)
  | null = null;

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: (table: string) => ({
      upsert: (payload: Record<string, unknown>, opts?: unknown) => {
        // Structured-clone: the assertions are about what the DATABASE received,
        // and a live reference would follow later mutations of the caller's
        // object — which is precisely the bug the 🔒 test is about.
        (upserts[table] ??= []).push({ payload: structuredClone(payload), opts });
        return Promise.resolve({ error: errorFor?.(table, payload) ?? null });
      },
      insert: (payload: Record<string, unknown>) => {
        (inserts[table] ??= []).push(structuredClone(payload));
        return Promise.resolve({ error: errorFor?.(table, payload) ?? null });
      },
    }),
  }),
}));
vi.mock('@/services/iteraUser', () => ({
  getIteraUserId: vi.fn().mockResolvedValue('itera-user-1'),
}));
vi.mock('@/services/gamification.service', () => ({
  awardActivityXp: vi.fn().mockResolvedValue(undefined),
}));

import { persistActivityProgress } from '@/services/progress.service';
import { sendOutboxEntry } from '@/hooks/useAnswerOutbox';
import { buildSpecSnapshot, flattenTraceEvents, TRACE_SCHEMA_VERSION } from '@/utils/learningTrace';
import {
  buildPedagogicalContext,
  readPedagogicalContext,
  unknownGrammarTerms,
  GRAMMAR_V0_MENTAL_STRUCTURES,
  GRAMMAR_V0_METAPHORS,
  PEDAGOGICAL_CONTEXT_SCHEMA,
  type PedagogicalContext,
} from '@/utils/pedagogicalContext';
import {
  enqueueWrite,
  readOutbox,
  clearOutbox,
  MAX_QUEUED_PEDAGOGICAL_CONTEXT_CHARS,
} from '@/utils/answerOutbox';

const DURATION = { elapsedMs: 8_000, visibleMs: 6_000 };
const SETTLED_AT = Date.parse('2026-08-04T12:00:00.000Z');

const traces = () => upserts['activity_traces'] ?? [];

/** An activity tagged the way the v5 matrix says a matrix activity must be. */
function taggedActivity(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'single_choice' as const,
    spec: {
      prompt: 'O que acontece com o nível quando a válvula abre?',
      pedagogy: {
        mental_structures: ['estado'],
        metaphor: 'tanques_valvulas',
        difficulty: 2,
        objective: 'Distinguir nível de vazão',
        ...overrides,
      },
    },
  };
}

beforeEach(() => {
  for (const k of Object.keys(inserts)) delete inserts[k];
  for (const k of Object.keys(upserts)) delete upserts[k];
  errorFor = null;
  clearOutbox();
});

describe('buildPedagogicalContext — os seis campos que o plano exige', () => {
  it('normalises the authored block into the shape the column documents', () => {
    expect(buildPedagogicalContext(taggedActivity())).toEqual({
      schema: PEDAGOGICAL_CONTEXT_SCHEMA,
      template: 'single_choice',
      family: 'selection',
      mental_structures: ['estado'],
      metaphor: 'tanques_valvulas',
      difficulty: 2,
      objective: 'Distinguir nível de vazão',
      authored: true,
    });
  });

  it('is TOTAL — an untagged activity still records template and family', () => {
    // Nenhuma atividade do catálogo tem bloco `pedagogy` no dia em que isto
    // shipa. Devolver null aqui apagaria justamente os dois campos que tornam a
    // tentativa RE-ETIQUETÁVEL depois, por reprocessamento.
    expect(buildPedagogicalContext({ kind: 'order', spec: { items: [] } })).toEqual({
      schema: PEDAGOGICAL_CONTEXT_SCHEMA,
      template: 'order',
      family: 'arrangement',
      mental_structures: [],
      metaphor: null,
      difficulty: null,
      objective: null,
      authored: false,
    });
  });

  it('separates "untagged" from "tagged with nothing" via `authored`', () => {
    // Os dois têm os mesmos cinco campos vazios. Sem o booleano, uma auditoria
    // não consegue distinguir catálogo sem tag de bloco autorado vazio — e as
    // duas pedem ações opostas.
    const none = buildPedagogicalContext({ kind: 'concept', spec: {} });
    const empty = buildPedagogicalContext({ kind: 'concept', spec: { pedagogy: {} } });
    expect(none.authored).toBe(false);
    expect(empty.authored).toBe(true);
    expect(none.mental_structures).toEqual(empty.mental_structures);
  });

  it('accepts the spelling the PLAN uses, not only the one the column uses', () => {
    // O plano escreve `mentalStructure[]`; a coluna e todo SQL escrevem
    // `mental_structures`. Um autor que copiar o nome do plano não pode produzir
    // uma lista vazia em silêncio — vazio é indistinguível de "sem tag".
    const ctx = buildPedagogicalContext({
      kind: 'single_choice',
      spec: { pedagogy: { mentalStructure: ['fluxo', 'feedback'] } },
    });
    expect(ctx.mental_structures).toEqual(['fluxo', 'feedback']);
  });

  it('wraps a bare term, trims, de-dupes and drops non-strings', () => {
    const ctx = buildPedagogicalContext({
      kind: 'single_choice',
      spec: { pedagogy: { mental_structures: '  estado  ' } },
    });
    expect(ctx.mental_structures).toEqual(['estado']);

    const messy = buildPedagogicalContext({
      kind: 'single_choice',
      spec: { pedagogy: { mental_structures: ['fluxo', 'fluxo', '', null, 7, ' fluxo '] } },
    });
    expect(messy.mental_structures).toEqual(['fluxo']);
  });

  it('📦 keeps EVERY unrecognised authored key, verbatim, under `extra`', () => {
    // Este é o ADR-2 em forma de teste. Os campos do manifesto da v5 (`role`,
    // `varied_attribute`, `held_constant[]`) ainda não existem neste build e
    // MESMO ASSIM estão sendo coletados hoje — adotá-los depois é reprocessar
    // linha que já temos, não esperar dado novo.
    const ctx = buildPedagogicalContext(
      taggedActivity({
        role: 'contraste',
        varied_attribute: 'regime',
        held_constant: ['metafora', 'template'],
      })
    );
    expect(ctx.extra).toEqual({
      role: 'contraste',
      varied_attribute: 'regime',
      held_constant: ['metafora', 'template'],
    });
  });

  it('📦 a MISSPELLED known key survives in `extra` instead of vanishing', () => {
    // O caso em que descartar doeria mais: o autor quis dizer `metaphor` e
    // escreveu `metafora`. Perder isso seria perder a intenção sem deixar
    // rastro; guardá-lo torna o conserto um UPDATE offline.
    const ctx = buildPedagogicalContext({
      kind: 'single_choice',
      spec: { pedagogy: { metafora: 'fila' } },
    });
    expect(ctx.metaphor).toBeNull();
    expect(ctx.extra).toEqual({ metafora: 'fila' });
  });

  it('omits `extra` entirely when there is nothing extra', () => {
    expect(buildPedagogicalContext(taggedActivity())).not.toHaveProperty('extra');
  });

  it('keeps `difficulty` as authored — number OR label, never coerced', () => {
    expect(buildPedagogicalContext(taggedActivity({ difficulty: 3 })).difficulty).toBe(3);
    expect(buildPedagogicalContext(taggedActivity({ difficulty: 'alta' })).difficulty).toBe('alta');
    // Um número que não é número não vira 0 nem "NaN": vira null, que é a
    // única coisa verdadeira que dá pra dizer.
    expect(buildPedagogicalContext(taggedActivity({ difficulty: Number.NaN })).difficulty).toBeNull();
    expect(buildPedagogicalContext(taggedActivity({ difficulty: {} })).difficulty).toBeNull();
  });

  it('snapshots the FAMILY instead of leaving it to be re-derived', () => {
    // `ACTIVITY_FAMILY` é mapa vivo (o header do módulo chama cada linha de
    // "hipótese"). Re-derivar na leitura re-atribuiria o vocabulário de ação de
    // uma tentativa histórica a uma família que não existia quando ela ocorreu.
    expect(buildPedagogicalContext({ kind: 'match', spec: {} }).family).toBe('arrangement');
    expect(buildPedagogicalContext({ kind: 'code', spec: {} }).family).toBe('editor');
    expect(buildPedagogicalContext({ kind: 'document', spec: {} }).family).toBe('reading');
  });

  it('tolerates a null/absent spec instead of throwing on the write path', () => {
    expect(buildPedagogicalContext({ kind: 'video', spec: null }).authored).toBe(false);
    expect(buildPedagogicalContext({ kind: 'video' }).template).toBe('video');
  });

  it('never restates `activity_id` — it is already a column on the row', () => {
    expect(buildPedagogicalContext(taggedActivity())).not.toHaveProperty('activity_id');
  });
});

describe('unknownGrammarTerms — sinaliza a deriva, jamais descarta', () => {
  it('says nothing about the v0 vocabulary', () => {
    const ctx = buildPedagogicalContext(
      taggedActivity({ mental_structures: [...GRAMMAR_V0_MENTAL_STRUCTURES], metaphor: GRAMMAR_V0_METAPHORS[2] })
    );
    expect(unknownGrammarTerms(ctx)).toEqual({ mental_structures: [], metaphor: null });
  });

  it('folds accents, case and separators — a hat is not a new structure', () => {
    const ctx = buildPedagogicalContext(
      taggedActivity({ mental_structures: ['Dependência', 'ESTADO'], metaphor: 'Tanques Válvulas' })
    );
    expect(unknownGrammarTerms(ctx)).toEqual({ mental_structures: [], metaphor: null });
  });

  it('flags a genuinely unknown term — and the context still CARRIES it', () => {
    const ctx = buildPedagogicalContext(
      taggedActivity({ mental_structures: ['estado', 'estdo'], metaphor: 'cidade' })
    );
    // Sinalizado…
    expect(unknownGrammarTerms(ctx)).toEqual({ mental_structures: ['estdo'], metaphor: 'cidade' });
    // …e ainda assim gravado. Um cliente que filtrasse aqui tornaria invisível
    // a primeira tentativa da primeira atividade de uma estrutura NOVA — que é
    // exatamente como o ADR-5 espera que a gramática cresça.
    expect(ctx.mental_structures).toEqual(['estado', 'estdo']);
    expect(ctx.metaphor).toBe('cidade');
  });
});

describe('readPedagogicalContext — total e tolerante, como o readTrace', () => {
  it('reports a row written by a NEWER build instead of rejecting it', () => {
    const stored = readPedagogicalContext({
      schema: PEDAGOGICAL_CONTEXT_SCHEMA + 5,
      template: 'kind_que_ainda_nao_existe',
      family: 'familia_nova',
      mental_structures: ['coordenacao'],
      authored: true,
      extra: { role: 'matched' },
    });
    expect(stored?.from_future).toBe(true);
    // Aberto na leitura, fechado na escrita: coagir aqui pra um kind conhecido
    // faria o leitor relatar com confiança o template ERRADO de uma tentativa
    // real.
    expect(stored?.template).toBe('kind_que_ainda_nao_existe');
    expect(stored?.extra).toEqual({ role: 'matched' });
  });

  it('degrades a broken field without losing the good ones', () => {
    const stored = readPedagogicalContext({
      schema: 1,
      template: 'quiz',
      family: 'selection',
      mental_structures: 'não é lista',
      metaphor: 'fila',
      authored: true,
    });
    expect(stored?.mental_structures).toEqual([]);
    expect(stored?.metaphor).toBe('fila');
  });

  it('returns null for NULL — "não capturado", nunca "a tag de hoje"', () => {
    expect(readPedagogicalContext(null)).toBeNull();
    expect(readPedagogicalContext(undefined)).toBeNull();
    expect(readPedagogicalContext('{}')).toBeNull();
  });
});

describe('flattenTraceEvents — é AQUI que "todo evento" fica literalmente verdade', () => {
  const row = {
    activity_id: 'act-1',
    schema_version: TRACE_SCHEMA_VERSION,
    started_at: '2026-08-04T12:00:00.000Z',
    actions: [
      { type: 'activity_opened', at_ms: 0 },
      { type: 'option_selected', at_ms: 1_500, payload: { option_id: 'b' } },
      { type: 'attempt_settled', at_ms: 4_000, payload: { passed: false } },
    ],
    actions_truncated: false,
    pedagogical_context: buildPedagogicalContext(taggedActivity()),
  };

  it('hands the context to EVERY event, from one copy on the row', () => {
    const events = flattenTraceEvents(row);
    expect(events).toHaveLength(3);
    for (const event of events) {
      expect(event.pedagogical_context?.metaphor).toBe('tanques_valvulas');
      expect(event.pedagogical_context?.mental_structures).toEqual(['estado']);
      expect(event.activity_id).toBe('act-1');
    }
  });

  it('derives the absolute instant so nobody re-derives it slightly differently', () => {
    expect(flattenTraceEvents(row).map((e) => e.at)).toEqual([
      '2026-08-04T12:00:00.000Z',
      '2026-08-04T12:00:01.500Z',
      '2026-08-04T12:00:04.000Z',
    ]);
  });

  it('passes an unknown action type and its payload through verbatim', () => {
    const events = flattenTraceEvents({
      ...row,
      actions: [{ type: 'gesto_do_futuro', at_ms: 10, payload: { qualquer: 'coisa' } }],
    });
    expect(events[0].type).toBe('gesto_do_futuro');
    expect(events[0].payload).toEqual({ qualquer: 'coisa' });
  });

  it('reports a missing context as NULL rather than inventing one', () => {
    const events = flattenTraceEvents({ ...row, pedagogical_context: null });
    expect(events.every((e) => e.pedagogical_context === null)).toBe(true);
  });

  it('is total: a non-row yields no events instead of throwing', () => {
    expect(flattenTraceEvents(null)).toEqual([]);
    expect(flattenTraceEvents('nope')).toEqual([]);
  });
});

describe('persistActivityProgress → o contexto na linha do trace', () => {
  it('writes the tag beside the sequence', async () => {
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
      pedagogicalContext: buildPedagogicalContext(taggedActivity()),
    });

    expect(traces()).toHaveLength(1);
    expect(traces()[0].payload.pedagogical_context).toMatchObject({
      template: 'single_choice',
      family: 'selection',
      mental_structures: ['estado'],
      metaphor: 'tanques_valvulas',
      objective: 'Distinguir nível de vazão',
    });
  });

  it('OMITS the column when there is no context — never writes `{}`', async () => {
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
    });
    expect(traces()[0].payload).not.toHaveProperty('pedagogical_context');
  });

  it('🔒 a LATER edit to the activity tagging cannot reach the row already written', async () => {
    // O teste que justifica a fase inteira. O trigger `activity_defs_sync_instances`
    // (0024) reescreve `spec` em toda instância quando uma definição muda — e a
    // tag pedagógica é, por decisão (ADR-5), a coisa que MAIS muda.
    const activity = taggedActivity();
    await persistActivityProgress('act-1', {
      passed: false,
      duration: DURATION,
      settledAt: SETTLED_AT,
      pedagogicalContext: buildPedagogicalContext(activity),
    });

    // …a gramática v1 chega e a atividade é re-etiquetada.
    (activity.spec.pedagogy as Record<string, unknown>).mental_structures = ['coordenacao'];
    (activity.spec.pedagogy as Record<string, unknown>).metaphor = 'cidade';

    const written = traces()[0].payload.pedagogical_context as PedagogicalContext;
    expect(written.mental_structures).toEqual(['estado']);
    expect(written.metaphor).toBe('tanques_valvulas');
  });

  it('never lets the context cost the SEQUENCE (0038 not applied yet)', async () => {
    // Janela de rollout: o build está no ar e a coluna não existe. O PostgREST
    // rejeita o statement inteiro.
    //
    // ⚠️ Rejeita `outcome` (0040) junto, porque `apply-migrations.sh` aplica em
    // ORDEM e PARA no primeiro arquivo que falha: um schema sem a 0038 também
    // não tem a 0040.
    errorFor = (table, payload) =>
      table === 'activity_traces' && ('pedagogical_context' in payload || 'outcome' in payload)
        ? { message: `column "pedagogical_context" of relation "activity_traces" does not exist` }
        : null;

    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
      pedagogicalContext: buildPedagogicalContext(taggedActivity()),
    });

    // (contexto+outcome) → (contexto) → pelado. O degrau do meio existe porque
    // cada degrau larga o valor de UMA migration, e a 0040 é a mais nova.
    expect(traces()).toHaveLength(3);
    const landed = traces()[2].payload;
    expect(landed).not.toHaveProperty('pedagogical_context');
    // A sequência sobreviveu inteira, que é o ponto.
    expect(landed.actions).toHaveLength(2);
    expect(landed.schema_version).toBe(TRACE_SCHEMA_VERSION);
  });

  it('🪜 dropping the NEW annotation does not drop the OLD one', async () => {
    // 0037 aplicada, 0038 não — o estado normal no dia do merge. A escada tem
    // que devolver o enunciado, não voltar direto pro envelope pelado.
    errorFor = (table, payload) =>
      table === 'activity_traces' && ('pedagogical_context' in payload || 'outcome' in payload)
        ? { message: 'column "pedagogical_context" does not exist' }
        : null;

    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
      specSnapshot: buildSpecSnapshot({ prompt: 'Qual a capital?' }, 'pt'),
      pedagogicalContext: buildPedagogicalContext(taggedActivity()),
    });

    // (tudo) → (snapshot+contexto) → (snapshot). O enunciado, que a 0037 já
    // sabe guardar, volta — nenhuma migration paga o rollout da outra.
    expect(traces()).toHaveLength(3);
    const landed = traces()[2].payload;
    expect(landed).not.toHaveProperty('pedagogical_context');
    expect(landed).not.toHaveProperty('outcome');
    expect(landed.spec_snapshot).toEqual({ prompt: 'Qual a capital?' });
    expect(landed.spec_locale).toBe('pt');
  });

  it('🪜 walks all the way down to the bare envelope when NEITHER applied', async () => {
    errorFor = (table, payload) =>
      table === 'activity_traces' &&
      ('pedagogical_context' in payload || 'spec_snapshot' in payload || 'outcome' in payload)
        ? { message: 'unknown column' }
        : null;

    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
      specSnapshot: buildSpecSnapshot({ prompt: 'x' }, 'pt'),
      pedagogicalContext: buildPedagogicalContext(taggedActivity()),
    });

    // Quatro degraus desde a 0040, um por migration decorativa mais o pelado.
    expect(traces()).toHaveLength(4);
    const landed = traces()[3].payload;
    expect(landed).not.toHaveProperty('pedagogical_context');
    expect(landed).not.toHaveProperty('spec_snapshot');
    expect(landed).not.toHaveProperty('outcome');
    expect(landed.actions).toHaveLength(2);
  });

  it('costs exactly ONE statement when the ladder is not needed', async () => {
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
      specSnapshot: buildSpecSnapshot({ prompt: 'x' }, 'pt'),
      pedagogicalContext: buildPedagogicalContext(taggedActivity()),
    });
    expect(traces()).toHaveLength(1);
  });

  it('every rung is the same idempotent upsert — a ladder cannot duplicate a sequence', async () => {
    errorFor = () => ({ message: 'always fails' });
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
      specSnapshot: buildSpecSnapshot({ prompt: 'x' }, 'pt'),
      pedagogicalContext: buildPedagogicalContext(taggedActivity()),
    });
    for (const attempt of traces()) {
      expect(attempt.opts).toEqual({
        onConflict: 'user_id,activity_id,started_at',
        ignoreDuplicates: true,
      });
      // Mesma âncora em todos os degraus ⇒ o índice único transforma o segundo
      // acerto em no-op.
      expect(attempt.payload.started_at).toBe(new Date(SETTLED_AT - DURATION.elapsedMs).toISOString());
    }
  });

  it('a failed context write never costs the ATTEMPT row', async () => {
    errorFor = (table) => (table === 'activity_traces' ? { message: 'boom' } : null);
    const ok = await persistActivityProgress('act-1', {
      passed: false,
      duration: DURATION,
      settledAt: SETTLED_AT,
      pedagogicalContext: buildPedagogicalContext(taggedActivity()),
    });
    expect(ok).toBe(true);
    expect(inserts['activity_results']).toHaveLength(1);
  });
});

describe('a fila durável carrega o contexto — e o apara sem mentir', () => {
  it('carries the tag through the queue instead of re-reading it at drain time', async () => {
    // O dreno pode acontecer horas depois, e nesse intervalo a tag pode ter
    // mudado. Buscá-la aqui daria a gramática de ENTÃO a uma resposta de AGORA.
    const entry = {
      kind: 'progress' as const,
      activityId: 'act-1',
      passed: false,
      response: 'errado',
      duration: DURATION,
      settledAt: SETTLED_AT,
      pedagogicalContext: buildPedagogicalContext(taggedActivity()),
    };
    enqueueWrite(entry);
    const queued = readOutbox()[0].entry;
    expect(queued.kind === 'progress' && queued.pedagogicalContext?.metaphor).toBe(
      'tanques_valvulas'
    );

    await sendOutboxEntry(queued);
    expect(traces()[0].payload.pedagogical_context).toMatchObject({ metaphor: 'tanques_valvulas' });
  });

  it('drops only `extra` when the entry is too big, keeping the six fields', async () => {
    const bloated = buildPedagogicalContext(
      taggedActivity({ notas: 'x'.repeat(MAX_QUEUED_PEDAGOGICAL_CONTEXT_CHARS + 1) })
    );
    enqueueWrite({
      kind: 'progress',
      activityId: 'act-1',
      passed: false,
      response: 'errado',
      duration: DURATION,
      settledAt: SETTLED_AT,
      pedagogicalContext: bloated,
    });

    const queued = readOutbox()[0].entry;
    if (queued.kind !== 'progress') throw new Error('entrada errada');
    expect(queued.pedagogicalContext).toBeDefined();
    expect(queued.pedagogicalContext).not.toHaveProperty('extra');
    // O que a Fase 4 realmente consulta continua ali.
    expect(queued.pedagogicalContext?.mental_structures).toEqual(['estado']);
    expect(queued.pedagogicalContext?.metaphor).toBe('tanques_valvulas');
    // E a RESPOSTA do aluno — a razão de a fila existir — nunca é a que paga.
    expect(queued.response).toBe('errado');
  });

  it('a legacy entry serialised before the field still writes its trace', async () => {
    // Entrada que dormiu na fila desde antes desta versão. Ela volta sem o
    // campo, e isso vira NULL — "não capturado" — em vez de derrubar a escrita.
    await sendOutboxEntry({
      kind: 'progress',
      activityId: 'act-1',
      passed: true,
      response: null,
      duration: DURATION,
      settledAt: SETTLED_AT,
    });
    expect(traces()).toHaveLength(1);
    expect(traces()[0].payload).not.toHaveProperty('pedagogical_context');
  });
});
