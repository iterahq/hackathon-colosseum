import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * TENTATIVA ABANDONADA — a atividade que o aluno abriu e largou.
 *
 * Plano `20260803-itera-learning-control-plane-prototipo` (LCPWCI), Fase 1,
 * aprovada por Tainan TG 2026-08-04. Migration 0040.
 *
 * Antes disto, um aluno que abria uma atividade e ia embora sem responder não
 * produzia LINHA NENHUMA em lugar nenhum — nem `activity_results` (só na
 * liquidação), nem `progress` (só ao passar), nem `activity_traces` (uma linha
 * por tentativa liquidada desde a 0034). Este arquivo tranca quatro
 * propriedades, e três delas são sobre o que o abandono NÃO pode fazer:
 *
 *  1. **Ele existe.** Uma linha, com a origem certa, com as MESMAS duas
 *     anotações que uma tentativa liquidada carrega (0037 e 0038) — sem elas o
 *     abandono é inanalisável ao lado do resto.
 *  2. **Ele é idempotente.** O beacon pode disparar duas vezes (desmontagem e
 *     `pagehide` no mesmo suspiro) e a entrada da fila é reenviada até pousar.
 *     Segunda escrita da MESMA tentativa: sem erro, sem segunda linha.
 *  3. **Ele nunca vira uma tentativa.** Nada de `activity_results`, nada de
 *     `progress`, nada de XP — um abandono contado como erro destruiria toda
 *     métrica de acerto (o defeito D2 pelo avesso).
 *  4. **Ele nunca se disfarça de tentativa liquidada.** Se a coluna `outcome`
 *     não existe, a linha NÃO é escrita. Menos dado, nunca dado falso.
 */

/** Toda linha entregue a `.insert()` / `.upsert()`, por tabela. */
const inserts: Record<string, Array<Record<string, unknown>>> = {};
const upserts: Record<string, Array<{ payload: Record<string, unknown>; opts?: unknown }>> = {};

/** Deixa um teste fazer uma escrita falhar do jeito que o PostgREST falha. */
let errorFor: ((table: string, payload: Record<string, unknown>) => { message: string } | null) | null =
  null;

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: (table: string) => ({
      upsert: (payload: Record<string, unknown>, opts?: unknown) => {
        (upserts[table] ??= []).push({ payload, opts });
        return Promise.resolve({ error: errorFor?.(table, payload) ?? null });
      },
      insert: (payload: Record<string, unknown>) => {
        (inserts[table] ??= []).push(payload);
        return Promise.resolve({ error: errorFor?.(table, payload) ?? null });
      },
    }),
  }),
}));
vi.mock('@/services/iteraUser', () => ({
  getIteraUserId: vi.fn().mockResolvedValue('itera-user-1'),
}));
const awardActivityXp = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/gamification.service', () => ({
  awardActivityXp: (...args: unknown[]) => awardActivityXp(...args),
}));

import { persistActivityAbandonment } from '@/services/progress.service';
import { sendOutboxEntry } from '@/hooks/useAnswerOutbox';
import {
  abandonmentVerdict,
  attemptOriginKey,
  MIN_ABANDONMENT_VISIBLE_MS,
} from '@/utils/abandonment';
import {
  buildAbandonmentTrace,
  traceWriteRungs,
  TRACE_SCHEMA_VERSION,
} from '@/utils/learningTrace';
import {
  clearOutbox,
  enqueueWrite,
  readOutbox,
  revokeQueuedAbandonment,
} from '@/utils/answerOutbox';

const OPENED_AT = Date.parse('2026-08-04T12:00:00.000Z');
const LEFT_AT = OPENED_AT + 45_000;
const DWELL = { elapsedMs: 45_000, visibleMs: 40_000 };
const SNAPSHOT = { spec: { prompt: 'Quanto sobe o nível?' }, locale: 'pt' };
const CONTEXT = {
  schema: 1,
  template: 'single_choice' as const,
  family: 'selection' as const,
  mental_structures: ['estado'],
  metaphor: 'tanques_valvulas',
  difficulty: 2,
  objective: 'ler nível a partir de vazão',
  authored: true,
};

const traces = () => upserts['activity_traces'] ?? [];

const abandon = (overrides: Record<string, unknown> = {}) =>
  persistActivityAbandonment('act-1', {
    startedAt: OPENED_AT,
    leftAt: LEFT_AT,
    duration: DWELL,
    reason: 'left_activity',
    specSnapshot: SNAPSHOT,
    pedagogicalContext: CONTEXT,
    ...overrides,
  });

beforeEach(() => {
  for (const k of Object.keys(inserts)) delete inserts[k];
  for (const k of Object.keys(upserts)) delete upserts[k];
  errorFor = null;
  awardActivityXp.mockClear();
  clearOutbox();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. A REGRA — pura, sem DOM, sem banco
// ═══════════════════════════════════════════════════════════════════════════

describe('a regra: o que conta como abandono', () => {
  const base = {
    startedAt: OPENED_AT,
    duration: DWELL,
    settled: false,
    alreadyRecorded: false,
    reviewing: false,
  };

  it('grava quando a atividade abriu, foi olhada e ninguém respondeu', () => {
    expect(abandonmentVerdict(base)).toBe('record');
  });

  it('uma tentativa LIQUIDADA nunca é um abandono — e isso vence tudo', () => {
    // Ordem importa: uma resposta rápida (abaixo do piso de permanência) tem
    // que sair como `settled`, jamais como `too_brief`. Um acerto de dois
    // segundos é uma resposta, não uma desistência.
    expect(
      abandonmentVerdict({ ...base, settled: true, duration: { elapsedMs: 900, visibleMs: 900 } })
    ).toBe('settled');
  });

  it('abaixo do piso de permanência VISÍVEL não é abandono, é abertura acidental', () => {
    expect(
      abandonmentVerdict({
        ...base,
        duration: { elapsedMs: 600_000, visibleMs: MIN_ABANDONMENT_VISIBLE_MS - 1 },
      })
    ).toBe('too_brief');
  });

  it('o piso é sobre tempo VISÍVEL, não sobre relógio de parede', () => {
    // Dez minutos com a aba escondida e um segundo à vista: o aluno nunca olhou
    // para isto. Registrar como "largou" seria uma afirmação sobre alguém que
    // não viu a coisa.
    expect(
      abandonmentVerdict({ ...base, duration: { elapsedMs: 600_000, visibleMs: 1_000 } })
    ).toBe('too_brief');
  });

  it('sem origem não há abandono — a atividade nunca abriu', () => {
    expect(abandonmentVerdict({ ...base, startedAt: null })).toBe('not_opened');
  });

  it('reler algo já concluído não é largar uma tentativa', () => {
    expect(abandonmentVerdict({ ...base, reviewing: true })).toBe('reviewing');
  });

  it('a mesma origem só é registrada uma vez', () => {
    expect(abandonmentVerdict({ ...base, alreadyRecorded: true })).toBe('already_recorded');
  });

  it('a identidade da tentativa é (atividade, origem) — a mesma do índice único', () => {
    expect(attemptOriginKey('act-1', OPENED_AT)).toBe(attemptOriginKey('act-1', OPENED_AT));
    expect(attemptOriginKey('act-1', OPENED_AT)).not.toBe(attemptOriginKey('act-1', OPENED_AT + 1));
    expect(attemptOriginKey('act-1', OPENED_AT)).not.toBe(attemptOriginKey('act-2', OPENED_AT));
  });
});

describe('o envelope do abandono', () => {
  it('ancora na ABERTURA, direto — não por subtração a partir de um settle', () => {
    const trace = buildAbandonmentTrace({
      startedAt: OPENED_AT,
      leftAt: LEFT_AT,
      duration: DWELL,
      reason: 'left_activity',
    });
    expect(trace?.started_at).toBe(new Date(OPENED_AT).toISOString());
  });

  it('termina em `attempt_abandoned`, com o motivo e a permanência no payload', () => {
    const trace = buildAbandonmentTrace({
      startedAt: OPENED_AT,
      leftAt: LEFT_AT,
      duration: DWELL,
      reason: 'page_teardown',
    });
    expect(trace?.actions).toEqual([
      { type: 'activity_opened', at_ms: 0 },
      {
        type: 'attempt_abandoned',
        at_ms: 45_000,
        // A permanência mora AQUI e só aqui: não existe linha de
        // `activity_results` para um abandono, então este payload é o único
        // lugar onde "quanto tempo ele ficou antes de sair" pode viver.
        payload: { reason: 'page_teardown', elapsed_ms: 45_000, visible_ms: 40_000 },
      },
    ]);
  });

  it('carimba `outcome: abandoned` e NÃO mexe no `schema_version`', () => {
    // Coluna nova + tipo de ação novo são AMBOS aditivos. Uma linha v1 escrita
    // antes da 0040 é lida do mesmo jeito que uma escrita depois.
    const trace = buildAbandonmentTrace({
      startedAt: OPENED_AT,
      leftAt: LEFT_AT,
      duration: DWELL,
      reason: 'left_activity',
    });
    expect(trace?.outcome).toBe('abandoned');
    expect(trace?.schema_version).toBe(TRACE_SCHEMA_VERSION);
  });

  it('sem origem não há trace — offsets sem âncora não são uma sequência', () => {
    expect(
      buildAbandonmentTrace({
        startedAt: null,
        leftAt: LEFT_AT,
        duration: DWELL,
        reason: 'left_activity',
      })
    ).toBeNull();
  });
});

describe('🪜 a escada de degradação', () => {
  const row = { user_id: 'u', activity_id: 'a', schema_version: 1, started_at: 'x', actions: [] };

  it('uma tentativa LIQUIDADA pode largar o `outcome` — NULL ainda se lê como liquidada', () => {
    const rungs = traceWriteRungs({
      row,
      trace: { outcome: 'settled' },
      specSnapshot: SNAPSHOT,
      pedagogicalContext: CONTEXT,
    });
    expect(rungs.map((r) => Object.keys(r).filter((k) => !(k in row)))).toEqual([
      ['spec_snapshot', 'spec_locale', 'pedagogical_context', 'outcome'],
      ['spec_snapshot', 'spec_locale', 'pedagogical_context'],
      ['spec_snapshot', 'spec_locale'],
      [],
    ]);
  });

  it('🔒 um ABANDONO nunca larga o `outcome`: ou diz o que é, ou não é escrito', () => {
    // Este é o degrau que NÃO existe. Uma linha de abandono sem `outcome` não
    // seria "menos decorada" — ela se leria como uma TENTATIVA RESPONDIDA por
    // toda query futura. Registro falso, não registro pobre.
    const rungs = traceWriteRungs({
      row,
      trace: { outcome: 'abandoned' },
      specSnapshot: SNAPSHOT,
      pedagogicalContext: CONTEXT,
    });
    expect(rungs).toHaveLength(1);
    expect(rungs[0]).toHaveProperty('outcome', 'abandoned');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. A ESCRITA
// ═══════════════════════════════════════════════════════════════════════════

describe('persistActivityAbandonment', () => {
  it('escreve UMA linha em activity_traces, com a origem e o veredito', async () => {
    const ok = await abandon();
    expect(ok).toBe(true);
    expect(traces()).toHaveLength(1);
    expect(traces()[0].payload).toMatchObject({
      user_id: 'itera-user-1',
      activity_id: 'act-1',
      schema_version: TRACE_SCHEMA_VERSION,
      started_at: new Date(OPENED_AT).toISOString(),
      outcome: 'abandoned',
    });
  });

  it('carrega as MESMAS duas anotações de uma linha liquidada (0037 + 0038)', async () => {
    // Sem isto o abandono é um número solto: "qual célula da matriz é
    // abandonada com mais frequência" é uma pergunta sobre a TAG.
    await abandon();
    expect(traces()[0].payload).toMatchObject({
      spec_snapshot: SNAPSHOT.spec,
      spec_locale: 'pt',
      pedagogical_context: CONTEXT,
    });
  });

  it('NÃO escreve activity_results, NÃO escreve progress, NÃO dá XP', async () => {
    await abandon();
    // Um abandono gravado como `passed: false` contaria não-tentativa como
    // erro e faria toda métrica de acerto mentir — o D2 pelo avesso.
    expect(inserts['activity_results']).toBeUndefined();
    expect(upserts['progress']).toBeUndefined();
    expect(awardActivityXp).not.toHaveBeenCalled();
  });

  it('🔁 duas beacons para a MESMA tentativa: sem erro, sem segunda linha', async () => {
    // A prova, e ela é em duas metades porque a idempotência é em duas camadas.
    //
    // Metade 1 — a CHAVE. As duas escritas derivam o MESMO `started_at`, porque
    // ele é a origem carimbada na abertura e carregada até aqui, nunca um
    // `now()` na hora da escrita. É isso que faz o índice único
    // `(user_id, activity_id, started_at)` pegar a segunda.
    const first = await abandon();
    const second = await abandon({ leftAt: LEFT_AT + 5_000, reason: 'page_teardown' });

    expect(first).toBe(true);
    expect(second).toBe(true); // idempotente: não é erro, é no-op
    const [a, b] = traces();
    expect(a.payload.started_at).toBe(b.payload.started_at);
    expect(a.payload.activity_id).toBe(b.payload.activity_id);

    // Metade 2 — o CONFLITO. Toda escrita é o mesmo upsert `do nothing` contra
    // aquele índice, então a segunda statement é um no-op no banco: uma linha,
    // não duas. (O stub conta statements; o índice único é quem garante a
    // contagem de LINHAS, e é ele que estas opções acionam.)
    for (const t of traces()) {
      expect(t.opts).toEqual({
        onConflict: 'user_id,activity_id,started_at',
        ignoreDuplicates: true,
      });
    }
  });

  it('🔁 e não sobrescreve a tentativa de verdade se o aluno voltar e responder', async () => {
    // `ignoreDuplicates` é unidirecional a favor do que já está lá: o abandono
    // CEDE, nunca sobrepõe. Nenhum degrau usa `do update` — e não poderia: o
    // GRANT da 0034 é `select, insert`, sem `update`, justamente para que
    // ninguém reescreva o registro de como alguém resolveu algo.
    await abandon();
    expect(traces()[0].opts).toMatchObject({ ignoreDuplicates: true });
    expect(JSON.stringify(traces()[0].opts)).not.toContain('update');
  });

  it('🔒 devolve FALSE e não escreve nada quando a 0040 não foi aplicada', async () => {
    // A janela em que o build está no ar e a coluna ainda não existe: o deploy
    // e o `db-apply` correm em paralelo no merge, um apply que falha para no
    // arquivo dele, e um restore recomeça do zero. Em vez de gravar uma linha
    // que se leria como tentativa RESPONDIDA, o abandono espera na fila durável.
    errorFor = (table, payload) =>
      table === 'activity_traces' && 'outcome' in payload
        ? { message: 'column "outcome" of relation "activity_traces" does not exist' }
        : null;

    const ok = await abandon();
    expect(ok).toBe(false);
    // Uma statement tentada, nenhuma pousada — e NENHUM degrau sem `outcome`.
    expect(traces()).toHaveLength(1);
    expect(traces()[0].payload).toHaveProperty('outcome', 'abandoned');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. A FILA DURÁVEL — o caminho de entrega no teardown da página
// ═══════════════════════════════════════════════════════════════════════════

describe('a fila durável leva o abandono pelo teardown', () => {
  const entry = {
    kind: 'abandonment' as const,
    activityId: 'act-1',
    startedAt: OPENED_AT,
    leftAt: LEFT_AT,
    duration: DWELL,
    reason: 'page_teardown' as const,
    specSnapshot: SNAPSHOT,
    pedagogicalContext: CONTEXT,
  };

  it('uma entrada enfileirada drena numa linha ancorada na ABERTURA, não no dreno', async () => {
    const ok = await sendOutboxEntry(entry);
    expect(ok).toBe(true);
    expect(traces()).toHaveLength(1);
    expect(traces()[0].payload).toMatchObject({
      activity_id: 'act-1',
      started_at: new Date(OPENED_AT).toISOString(),
      outcome: 'abandoned',
    });
  });

  it('o abandono NUNCA despeja da fila a resposta da mesma atividade', async () => {
    // Alvos separados de propósito: telemetria e resposta de aluno não disputam
    // a mesma vaga. A regra da casa é que a telemetria jamais custa o registro
    // que ela decora.
    enqueueWrite({ kind: 'progress', activityId: 'act-1', passed: false, response: 'B' });
    enqueueWrite(entry);
    const queued = readOutbox().map((q) => q.entry.kind);
    expect(queued).toEqual(['progress', 'abandonment']);
  });

  it('só cabe UM abandono por atividade — o mais recente vence', async () => {
    enqueueWrite(entry);
    enqueueWrite({ ...entry, startedAt: OPENED_AT + 90_000 });
    const queued = readOutbox();
    expect(queued).toHaveLength(1);
    expect((queued[0].entry as typeof entry).startedAt).toBe(OPENED_AT + 90_000);
  });

  it('🔁 responder REVOGA o abandono enfileirado — a corrida do bfcache', async () => {
    // O cenário: `pagehide` enfileira um abandono (origem T0); a página volta
    // do bfcache; o aluno responde, ainda em T0. Se o abandono virasse linha, o
    // trace da RESPOSTA colidiria com ele em (user, activity, started_at) e —
    // como todo trace é `ignoreDuplicates` — a sequência da resposta seria
    // descartada em silêncio. Por isso o teardown só ENFILEIRA: enquanto está
    // na fila, dá pra cancelar.
    enqueueWrite(entry);
    enqueueWrite({ kind: 'progress', activityId: 'act-2', passed: true, response: null });
    expect(readOutbox()).toHaveLength(2);

    const revoked = revokeQueuedAbandonment('act-1');

    expect(revoked).toBe(1);
    expect(readOutbox().map((q) => q.entry.kind)).toEqual(['progress']);
  });

  it('revogar uma atividade sem abandono na fila é um no-op', () => {
    enqueueWrite(entry);
    expect(revokeQueuedAbandonment('outra-atividade')).toBe(0);
    expect(readOutbox()).toHaveLength(1);
  });
});
