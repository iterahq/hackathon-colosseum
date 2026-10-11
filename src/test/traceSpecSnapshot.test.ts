import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * FASE 0 do plano `20260803-itera-replay-de-sessao-de-atividade` — o enunciado
 * que o aluno leu vai na linha do trace (migration 0037).
 * Decidido por Tainan, TG 2026-08-04 (Q1, opção A).
 *
 * A propriedade sob teste não é "a coluna é escrita". É esta:
 *
 *   ⛓️ O QUE A LINHA GUARDA NÃO PODE MUDAR DEPOIS.
 *
 * `itera.activities.spec` é jsonb MUTÁVEL sem versão nem hash, e o trigger
 * `activity_defs_sync_instances` (migration 0024) reescreve TODA instância
 * quando uma definição é editada, sem olhar se já existem tentativas. Um replay
 * que re-renderizasse o spec vivo mostraria a redação de HOJE, no idioma de
 * QUEM ASSISTE — e pareceria certo. O segundo teste deste arquivo é o que
 * prova que isso não acontece: ele EDITA o spec depois da tentativa e exige que
 * a linha já escrita não se mexa.
 *
 * Os outros dois eixos:
 *
 *  · COMPATIBILIDADE PRA TRÁS — uma linha sem snapshot continua válida, e a
 *    ausência é NULL/omissão, nunca `{}`. Toda tentativa anterior à 0037 é
 *    assim pra sempre; um leitor tem que conseguir distinguir "não capturado"
 *    de "enunciado vazio".
 *  · A JANELA DE DEPLOY — o merge NÃO aplica migration neste repo (um humano
 *    roda `db/scripts/apply-migrations.sh`), então "build no ar, coluna
 *    ausente" é estado normal de rollout. Nesse caso o PostgREST rejeita o
 *    statement inteiro, e o que não pode acontecer é a sequência ir junto com
 *    a anotação dela.
 */

/** Every row handed to `.insert()` / `.upsert()`, keyed by table. */
const inserts: Record<string, Array<Record<string, unknown>>> = {};
const upserts: Record<string, Array<{ payload: Record<string, unknown>; opts?: unknown }>> = {};

/** Lets a test make one table's write fail the way PostgREST does. */
let errorFor: ((table: string, payload: Record<string, unknown>) => { message: string } | null) | null =
  null;

// The completion itself is recorded by the server (`grade` edge function); here it agrees with the player.
vi.mock('@/services/grade.service', () => ({
  submitForGrading: vi.fn(async ({ passed }: { passed: boolean }) => ({
    verdict: passed ? 'pass' : 'fail',
    mode: 'server',
    attempt_id: 'attempt-1',
    answer_hash: 'hash',
    graded_at: '2026-10-11T00:00:00Z',
  })),
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: (table: string) => ({
      upsert: (payload: Record<string, unknown>, opts?: unknown) => {
        // Structured-clone the payload: the assertions below are about what the
        // DATABASE received, and a live reference would follow later mutations
        // of the caller's object — which is precisely the bug under test.
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
import { buildSpecSnapshot, TRACE_SCHEMA_VERSION } from '@/utils/learningTrace';
import {
  enqueueWrite,
  readOutbox,
  clearOutbox,
  MAX_QUEUED_SPEC_SNAPSHOT_CHARS,
} from '@/utils/answerOutbox';

const DURATION = { elapsedMs: 8_000, visibleMs: 6_000 };
const SETTLED_AT = Date.parse('2026-08-04T12:00:00.000Z');

/** The trace rows written so far. */
const traces = () => upserts['activity_traces'] ?? [];

beforeEach(() => {
  for (const k of Object.keys(inserts)) delete inserts[k];
  for (const k of Object.keys(upserts)) delete upserts[k];
  errorFor = null;
  clearOutbox();
});

describe('buildSpecSnapshot — o par é UM fato', () => {
  it('keeps the spec and the locale together', () => {
    expect(buildSpecSnapshot({ prompt: 'Quanto é 2+2?' }, 'pt')).toEqual({
      spec: { prompt: 'Quanto é 2+2?' },
      locale: 'pt',
    });
  });

  it('returns null for an EMPTY spec instead of writing {}', () => {
    // `{}` afirmaria "esta atividade não tinha enunciado". NULL diz "não
    // capturado", que é a única coisa verdadeira quando não há o que guardar.
    expect(buildSpecSnapshot({}, 'pt')).toBeNull();
  });

  it('returns null when there is no spec or no locale to name it by', () => {
    expect(buildSpecSnapshot(null, 'pt')).toBeNull();
    expect(buildSpecSnapshot(undefined, 'pt')).toBeNull();
    expect(buildSpecSnapshot({ prompt: 'x' }, '')).toBeNull();
  });
});

describe('persistActivityProgress → snapshot do enunciado', () => {
  it('writes the spec the learner read, and the locale they read it in', async () => {
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
      specSnapshot: buildSpecSnapshot({ prompt: 'Qual a capital?', options: ['A', 'B'] }, 'pt'),
    });

    expect(traces()).toHaveLength(1);
    expect(traces()[0].payload).toMatchObject({
      user_id: 'itera-user-1',
      activity_id: 'act-1',
      schema_version: TRACE_SCHEMA_VERSION,
      spec_snapshot: { prompt: 'Qual a capital?', options: ['A', 'B'] },
      spec_locale: 'pt',
    });
  });

  it('records the LEARNER locale, not a house default', async () => {
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
      specSnapshot: buildSpecSnapshot({ prompt: 'Which capital?' }, 'en'),
    });
    expect(traces()[0].payload.spec_locale).toBe('en');
  });

  it('🔒 a LATER edit to activities.spec cannot reach the row already written', async () => {
    // Este é o teste que justifica a Fase 0 inteira. O objeto abaixo faz o papel
    // de `itera.activities.spec`; a edição faz o papel do trigger
    // `activity_defs_sync_instances` (0024) propagando a mudança de uma
    // definição pra toda instância — inclusive as que já têm tentativa.
    const liveSpec: Record<string, unknown> = { prompt: 'Redação ORIGINAL', options: ['a', 'b'] };

    await persistActivityProgress('act-1', {
      passed: false,
      duration: DURATION,
      settledAt: SETTLED_AT,
      specSnapshot: buildSpecSnapshot(liveSpec, 'pt'),
    });

    // O curador edita o enunciado depois da tentativa.
    liveSpec.prompt = 'Redação REESCRITA depois da tentativa';
    liveSpec.options = ['a', 'b', 'c'];

    expect(traces()[0].payload.spec_snapshot).toEqual({
      prompt: 'Redação ORIGINAL',
      options: ['a', 'b'],
    });
  });

  it('does not touch schema_version — a new column is not an envelope change', async () => {
    // A regra está escrita no topo de `src/utils/learningTrace.ts`. Se a versão
    // subisse a cada acréscimo, ela pararia de dizer se uma linha ANTIGA é
    // interpretável, que é a única coisa que ela existe pra dizer.
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
      specSnapshot: buildSpecSnapshot({ prompt: 'x' }, 'pt'),
    });
    expect(traces()[0].payload.schema_version).toBe(1);
    expect(TRACE_SCHEMA_VERSION).toBe(1);
  });
});

describe('compatibilidade pra trás — linha sem snapshot continua válida', () => {
  it('omits the columns entirely when no snapshot was captured', async () => {
    // Toda tentativa anterior à 0037 é assim, pra sempre. A linha tem que
    // continuar sendo escrita, e a ausência tem que ser distinguível de um
    // enunciado vazio.
    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
    });

    expect(traces()).toHaveLength(1);
    expect(traces()[0].payload).not.toHaveProperty('spec_snapshot');
    expect(traces()[0].payload).not.toHaveProperty('spec_locale');
    expect(traces()[0].payload.actions).toHaveLength(2);
  });

  it('a legacy outbox entry (serialised before the field existed) still writes its trace', async () => {
    const ok = await sendOutboxEntry({
      kind: 'progress',
      activityId: 'act-old',
      passed: false,
      response: 'o distrator',
      duration: DURATION,
      settledAt: SETTLED_AT,
    });

    expect(ok).toBe(true);
    expect(traces()).toHaveLength(1);
    expect(traces()[0].payload).not.toHaveProperty('spec_snapshot');
  });

  it('an outbox entry that HAS a snapshot carries it through the drain', async () => {
    // O caso offline é onde o snapshot vale mais: a entrada pode drenar horas
    // depois, e nesse intervalo o enunciado pode ter sido editado.
    const ok = await sendOutboxEntry({
      kind: 'progress',
      activityId: 'act-live',
      passed: true,
      response: null,
      duration: DURATION,
      settledAt: SETTLED_AT,
      specSnapshot: { spec: { prompt: 'como estava na aula' }, locale: 'pt' },
    });

    expect(ok).toBe(true);
    expect(traces()[0].payload).toMatchObject({
      spec_snapshot: { prompt: 'como estava na aula' },
      spec_locale: 'pt',
    });
  });
});

describe('a janela de deploy (o build pode estar na frente do schema)', () => {
  it('keeps the SEQUENCE when the 0037 columns do not exist yet', async () => {
    // PostgREST rejeita o statement inteiro por causa de uma coluna que o
    // schema no ar não tem. Sem o retry, cada trace se perderia até alguém
    // rodar `db/scripts/apply-migrations.sh` — e há precedente de isso demorar.
    //
    // ⚠️ O stub rejeita `spec_snapshot` E `outcome` (0040) porque
    // `apply-migrations.sh` aplica os arquivos EM ORDEM e PARA no primeiro que
    // falha: um schema sem a 0037 também não tem a 0038 nem a 0040. Simular
    // "0040 aplicada mas 0037 não" seria testar um estado que não existe.
    errorFor = (table, payload) =>
      table === 'activity_traces' && ('spec_snapshot' in payload || 'outcome' in payload)
        ? { message: `column "spec_snapshot" of relation "activity_traces" does not exist` }
        : null;

    const ok = await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
      specSnapshot: buildSpecSnapshot({ prompt: 'x' }, 'pt'),
    });

    expect(ok).toBe(true);
    // Três degraus desde a 0040: (snapshot+outcome) → (snapshot) → pelado.
    const [withSnapshot, , fallback] = traces();
    expect(traces()).toHaveLength(3);
    expect(withSnapshot.payload).toHaveProperty('spec_snapshot');
    expect(fallback.payload).not.toHaveProperty('spec_snapshot');
    expect(fallback.payload).not.toHaveProperty('outcome');
    // A sequência sobrevive intacta — perdeu-se a anotação, nunca o dado.
    expect(fallback.payload.actions).toHaveLength(2);
    expect(fallback.opts).toEqual({
      onConflict: 'user_id,activity_id,started_at',
      ignoreDuplicates: true,
    });
  });

  it('não inventa degrau de snapshot quando não havia snapshot nenhum', async () => {
    errorFor = (table) =>
      table === 'activity_traces' ? { message: 'relation does not exist' } : null;

    await persistActivityProgress('act-1', {
      passed: true,
      duration: DURATION,
      settledAt: SETTLED_AT,
    });

    // Sem snapshot e sem contexto, a escada tem exatamente DOIS degraus: o
    // `outcome` da 0040 e o envelope pelado. Degraus idênticos são pulados —
    // não existe um degrau "sem snapshot" quando não havia snapshot.
    //
    // ⚠️ O segundo degrau é o CUSTO DE ROLLOUT DA 0040, e ele é temporário e
    // conhecido: na janela entre o deploy do build e o `db-apply` pousar a
    // coluna, toda tentativa liquidada paga um upsert rejeitado a mais. As 0037
    // e 0038 fizeram exatamente a mesma troca — só que a janela delas durou
    // dias, e desde 2026-08-04 dura minutos. Aplicada a migration, volta a UM.
    expect(traces()).toHaveLength(2);
    expect(traces()[0].payload).toHaveProperty('outcome', 'settled');
    expect(traces()[1].payload).not.toHaveProperty('outcome');
  });

  it('never lets the snapshot cost the ATTEMPT row', async () => {
    errorFor = (table) =>
      table === 'activity_traces' ? { message: 'relation does not exist' } : null;

    const ok = await persistActivityProgress('act-1', {
      passed: true,
      response: 'A',
      duration: DURATION,
      settledAt: SETTLED_AT,
      specSnapshot: buildSpecSnapshot({ prompt: 'x' }, 'pt'),
    });

    expect(ok).toBe(true);
    expect(inserts['activity_results']).toHaveLength(1);
    expect(inserts['activity_results'][0]).toMatchObject({ passed: true, elapsed_ms: 8_000 });
  });
});

describe('a fila durável não pode estourar por causa do snapshot', () => {
  it('queues an ordinary snapshot untouched', () => {
    enqueueWrite({
      kind: 'progress',
      activityId: 'act-1',
      passed: true,
      response: null,
      specSnapshot: { spec: { prompt: 'normal' }, locale: 'pt' },
    });
    const [queued] = readOutbox();
    expect(queued.entry).toMatchObject({
      specSnapshot: { spec: { prompt: 'normal' }, locale: 'pt' },
    });
  });

  it('DROPS an oversized snapshot rather than truncating it — and keeps the answer', () => {
    // Quota estourada derruba a fila inteira, inclusive as RESPOSTAS que ela
    // existe pra salvar. E meio enunciado renderizaria como se fosse o que o
    // aluno leu, então descartar é a única opção honesta.
    enqueueWrite({
      kind: 'progress',
      activityId: 'act-huge',
      passed: false,
      response: 'a resposta que importa',
      specSnapshot: { spec: { prompt: 'x'.repeat(MAX_QUEUED_SPEC_SNAPSHOT_CHARS + 1) }, locale: 'pt' },
    });

    const [queued] = readOutbox();
    expect(queued.entry).not.toHaveProperty('specSnapshot');
    expect(queued.entry).toMatchObject({
      activityId: 'act-huge',
      response: 'a resposta que importa',
    });
  });
});
