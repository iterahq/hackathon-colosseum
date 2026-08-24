import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A leitura durável do placar. O que importa aqui é o que o PostgREST faz de
 * silencioso: ele TRUNCA em `max-rows` sem erro, então uma turma grande devolveria
 * o pódio incompleto que este trabalho está consertando.
 */

let pages: Record<string, unknown>[][];
let ranges: [number, number][];
let failure: { message: string } | null;

function makeQuery() {
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    range: (from: number, to: number) => {
      ranges.push([from, to]);
      const page = pages.shift() ?? [];
      return Promise.resolve(failure ? { data: null, error: failure } : { data: page, error: null });
    },
  };
  return q;
}

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ from: () => makeQuery() }),
}));

import { getSessionScoreboard } from '@/services/classScoreboard.service';

const row = (userId: string, extra: Record<string, unknown> = {}) => ({
  activity_id: 'act-1',
  user_id: userId,
  correct: true,
  elapsed_ms: 1200,
  ...extra,
});

beforeEach(() => {
  pages = [];
  ranges = [];
  failure = null;
});

describe('getSessionScoreboard', () => {
  it('mapeia as colunas do pódio', async () => {
    pages = [[row('ana'), row('bruno', { correct: false, elapsed_ms: null })]];
    expect(await getSessionScoreboard('s1')).toEqual([
      { activityId: 'act-1', userId: 'ana', correct: true, elapsedMs: 1200 },
      { activityId: 'act-1', userId: 'bruno', correct: false },
    ]);
  });

  it('descarta tempo impossível em vez de deixá-lo rankear o pódio', async () => {
    pages = [[row('ana', { elapsed_ms: -1 }), row('bruno', { elapsed_ms: 'rápido' })]];
    const entries = await getSessionScoreboard('s1');
    expect(entries.every((e) => !('elapsedMs' in e))).toBe(true);
  });

  it('ignora linha sem atividade ou sem aluno', async () => {
    pages = [[row('ana'), { activity_id: null, user_id: 'bruno' }, { activity_id: 'act-1' }]];
    expect(await getSessionScoreboard('s1')).toHaveLength(1);
  });

  it('pagina até a última página curta — truncar em silêncio é o bug', async () => {
    pages = [
      Array.from({ length: 500 }, (_, i) => row(`u${i}`)),
      Array.from({ length: 500 }, (_, i) => row(`v${i}`)),
      [row('ultimo')],
    ];
    const entries = await getSessionScoreboard('s1');
    expect(entries).toHaveLength(1001);
    expect(ranges).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });

  it('para na primeira página curta', async () => {
    pages = [[row('ana')]];
    await getSessionScoreboard('s1');
    expect(ranges).toHaveLength(1);
  });

  it('LANÇA quando a leitura falha — ler nada não é ler zero respostas', async () => {
    failure = { message: 'rede' };
    await expect(getSessionScoreboard('s1')).rejects.toBeTruthy();
  });

  it('sem sessão não toca no banco', async () => {
    expect(await getSessionScoreboard('')).toEqual([]);
    expect(ranges).toHaveLength(0);
  });

  describe('corte de "resetar a lição"', () => {
    const CUT = '2026-08-24T12:00:00.000Z';

    it('sem corte, tudo conta — a aula que nunca foi resetada', async () => {
      pages = [[row('ana', { created_at: '2020-01-01T00:00:00.000Z' })]];
      expect(await getSessionScoreboard('s1')).toHaveLength(1);
    });

    it('descarta quem respondeu ANTES do corte e mantém quem respondeu depois', async () => {
      pages = [
        [
          row('ana', { created_at: '2026-08-24T11:59:59.000Z' }),
          row('bruno', { created_at: '2026-08-24T12:00:01.000Z' }),
        ],
      ];
      const entries = await getSessionScoreboard('s1', CUT);
      expect(entries.map((e) => e.userId)).toEqual(['bruno']);
    });

    it('linha sem created_at não conta com corte — não dá pra provar que é nova', async () => {
      pages = [[row('ana')]];
      expect(await getSessionScoreboard('s1', CUT)).toEqual([]);
    });

    it('pagina normalmente com o corte — filtrar não pode encurtar a varredura', async () => {
      pages = [
        Array.from({ length: 500 }, (_, i) => row(`u${i}`, { created_at: '2020-01-01T00:00:00.000Z' })),
        [row('ultimo', { created_at: '2026-08-24T12:00:01.000Z' })],
      ];
      const entries = await getSessionScoreboard('s1', CUT);
      expect(entries.map((e) => e.userId)).toEqual(['ultimo']);
      expect(ranges).toHaveLength(2);
    });
  });
});
