/**
 * O CONVIDADO GERA TRACE E NÃO GERA CRÉDITO.
 *
 * Tainan, por voz em 2026-08-05T16:44Z: *"Sim, convidado gera trace de
 * aprendizagem, mas fica fora da análise — só analytics interna. Então dá pra
 * dar replay, mas não vai pra analytics."*
 *
 * ## O defeito que este arquivo fecha
 *
 * Não foi uma decisão errada: foi uma COMPOSIÇÃO de duas decisões certas.
 *
 *   · 2026-07-28 19:47Z — ADR-6. O convidado não escreve `progress`,
 *     `activity_results` nem XP. Motivo sólido: uma demo de vendas não pode
 *     deixar linhas de progresso no conteúdo de uma turma pagante. Implementado
 *     como um `if (guest) {}` VAZIO no único call-site que tinha convidado.
 *   · 2026-07-31 20:01Z — a escrita do trace nasceu DENTRO de
 *     `persistActivityProgress`, que é o lugar certo (é o funil por onde passam
 *     a aula ao vivo e todo erro do self-paced).
 *
 * O resultado da soma é que pular a chamada pulava a sequência junto. O trace
 * herdou uma exclusão escrita sobre linhas de progresso, e ninguém decidiu
 * isso. Custo medido: **36 respostas de convidado depois do deploy, 0 traces**,
 * irrecuperáveis — exatamente o *"você nunca vai conseguir voltar no tempo e
 * coletar esses dados"* que a migration 0034 existe para responder.
 *
 * ## As três propriedades sob teste
 *
 *  1. o convidado ESCREVE o trace, com a mesma forma do trace de um aluno;
 *  2. o convidado NÃO escreve `progress`, `activity_results` nem XP — e isso
 *     é estrutural, não uma lembrança do chamador (ADR-6 continua de pé);
 *  3. a identidade é CONFERIDA: uma sessão que não é mais a do convidado não
 *     grava nada, em vez de gravar no usuário errado.
 *
 * A (3) não é paranoia. A sessão Supabase do convidado mora no MESMO slot de
 * `localStorage` de um login comum (`GuestLiveRoute` aplica com `setSession`),
 * então "o usuário logado mudou entre a resposta e a escrita" é uma sequência
 * de eventos real num notebook de demo — e atribuir a sequência de um visitante
 * a quem logou depois é precisamente a contaminação que o ADR-4 existe para
 * impedir.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const inserts: Record<string, Array<Record<string, unknown>>> = {};
const upserts: Record<string, Array<{ payload: Record<string, unknown>; opts?: unknown }>> = {};

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: (table: string) => ({
      upsert: (payload: Record<string, unknown>, opts?: unknown) => {
        (upserts[table] ??= []).push({ payload, opts });
        return Promise.resolve({ error: null });
      },
      insert: (payload: Record<string, unknown>) => {
        (inserts[table] ??= []).push(payload);
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

/** Quem a SESSÃO diz ser, agora — não quem o chamador achava que era. */
let currentUserId: string | null = 'guest-user-1';
vi.mock('@/services/iteraUser', () => ({
  getIteraUserId: () => Promise.resolve(currentUserId),
}));

const awardActivityXp = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/gamification.service', () => ({
  awardActivityXp: (...args: unknown[]) => awardActivityXp(...args),
}));

const { persistGuestActivityTrace } = await import('@/services/progress.service');
const { TRACE_SCHEMA_VERSION } = await import('@/utils/learningTrace');

const DURATION = { elapsedMs: 8_000, visibleMs: 6_000 };
const SETTLED_AT = Date.parse('2026-08-05T16:44:00.000Z');
const OPENED_AT = new Date(SETTLED_AT - DURATION.elapsedMs).toISOString();

const traces = () => upserts['activity_traces'] ?? [];

/** Uma tentativa settlada por um convidado, do jeito que a aula ao vivo manda. */
function guestAttempt(over: Record<string, unknown> = {}) {
  return persistGuestActivityTrace('act-1', {
    guestUserId: 'guest-user-1',
    passed: true,
    duration: DURATION,
    settledAt: SETTLED_AT,
    ...over,
  } as Parameters<typeof persistGuestActivityTrace>[1]);
}

beforeEach(() => {
  for (const k of Object.keys(inserts)) delete inserts[k];
  for (const k of Object.keys(upserts)) delete upserts[k];
  awardActivityXp.mockClear();
  currentUserId = 'guest-user-1';
});

describe('✅ o convidado GERA o trace', () => {
  it('escreve exatamente UMA linha em activity_traces', async () => {
    await expect(guestAttempt()).resolves.toBe(true);
    expect(traces()).toHaveLength(1);
  });

  it('a linha tem a MESMA forma da de um aluno — versionada e escopada', async () => {
    await guestAttempt();
    expect(traces()[0].payload).toMatchObject({
      schema_version: TRACE_SCHEMA_VERSION,
      user_id: 'guest-user-1',
      activity_id: 'act-1',
      actions_truncated: false,
    });
  });

  it('ancorada no SETTLE do convidado, nunca na hora da escrita', async () => {
    await guestAttempt();
    // Se a âncora fosse `Date.now()`, esta asserção seria insatisfazível — e a
    // idempotência do índice único (user, activity, started_at) morreria junto.
    expect(traces()[0].payload.started_at).toBe(OPENED_AT);
  });

  it('registra o veredito real, acerto OU erro', async () => {
    await guestAttempt({ passed: false });
    expect(traces()[0].payload.actions).toEqual([
      { type: 'activity_opened', at_ms: 0 },
      { type: 'attempt_settled', at_ms: 8_000, payload: { passed: false } },
    ]);
  });

  it('é idempotente por construção — upsert com ignoreDuplicates na chave da tentativa', async () => {
    await guestAttempt();
    expect(traces()[0].opts).toMatchObject({
      onConflict: 'user_id,activity_id,started_at',
      ignoreDuplicates: true,
    });
  });

  it('sem âncora não inventa uma: sem trace em vez de trace mentiroso', async () => {
    // Mesma regra do caminho do aluno. `settledAt: null` é "não sei quando",
    // e um `started_at` fabricado descreveria a rede, não o convidado.
    await expect(guestAttempt({ settledAt: null })).resolves.toBe(false);
    expect(traces()).toEqual([]);
  });
});

describe('🔴 e NÃO gera crédito — ADR-6 continua de pé', () => {
  it('não escreve progress', async () => {
    await guestAttempt();
    expect(upserts['progress']).toBeUndefined();
    expect(inserts['progress']).toBeUndefined();
  });

  it('não escreve activity_results — o log de tentativas fica limpo de demo', async () => {
    await guestAttempt();
    // É esta tabela que toda taxa de acerto do produto lê. Um visitante de
    // vendas aqui é um número encenado vestido de medido.
    expect(inserts['activity_results']).toBeUndefined();
    expect(upserts['activity_results']).toBeUndefined();
  });

  it('não dá XP, nem quando acerta', async () => {
    await guestAttempt({ passed: true });
    expect(awardActivityXp).not.toHaveBeenCalled();
  });

  it('activity_traces é a ÚNICA tabela tocada, em acerto e em erro', async () => {
    await guestAttempt({ passed: true });
    await guestAttempt({ passed: false, settledAt: SETTLED_AT + 60_000 });
    // A asserção que pega o que as três acima não pegariam: uma tabela NOVA
    // aparecendo neste caminho quebra aqui sem ninguém precisar prevê-la.
    const touched = [...new Set([...Object.keys(inserts), ...Object.keys(upserts)])];
    expect(touched).toEqual(['activity_traces']);
  });
});

describe('🔒 a identidade é conferida antes de escrever', () => {
  it('sessão de OUTRO usuário: não grava nada e devolve false', async () => {
    // O notebook da demo: o convidado responde, a rede engasga, e quando a
    // escrita acontece quem está logado é um aluno de verdade. Gravar aqui
    // atribuiria a sequência do visitante a ele — contaminação silenciosa e
    // indetectável depois.
    currentUserId = 'aluno-de-verdade';
    await expect(guestAttempt()).resolves.toBe(false);
    expect(traces()).toEqual([]);
  });

  it('sem sessão nenhuma: não grava nada', async () => {
    currentUserId = null;
    await expect(guestAttempt()).resolves.toBe(false);
    expect(traces()).toEqual([]);
  });

  it('guestUserId ausente é recusa, não "escreve em quem estiver logado"', async () => {
    await expect(
      persistGuestActivityTrace('act-1', {
        guestUserId: '',
        passed: true,
        duration: DURATION,
        settledAt: SETTLED_AT,
      })
    ).resolves.toBe(false);
    expect(traces()).toEqual([]);
  });
});
