import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Leitura que falha NÃO pode se passar por elenco vazio.
 *
 * O upsert grava o jsonb INTEIRO. Se a leitura devolvesse `{}` num erro, a query
 * ficaria `isSuccess` com elenco vazio, o gate perguntaria de novo, e o `save`
 * seguinte apagaria tudo o que o aluno já tinha preenchido — perda de dado
 * silenciosa, disparada por uma queda de rede de dois segundos.
 */

let result: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: () => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => result,
      };
      return builder;
    },
  }),
}));

vi.mock('@/services/iteraUser', () => ({ getIteraUserId: async () => 'u1' }));

import { getMyPersonalization } from '@/services/personalization.service';

beforeEach(() => {
  result = { data: null, error: null };
});

describe('getMyPersonalization', () => {
  it('propaga o erro em vez de fingir elenco vazio', async () => {
    result = { data: null, error: { message: 'network' } };
    await expect(getMyPersonalization()).rejects.toBeTruthy();
  });

  it('sem linha é elenco vazio, não erro — aluno novo é o caso comum', async () => {
    expect(await getMyPersonalization()).toEqual({});
  });

  it('devolve o elenco saneado quando a linha existe', async () => {
    result = { data: { values: { 'eu.nome': '**Ana**', lixo: 'x' } }, error: null };
    expect(await getMyPersonalization()).toEqual({ 'eu.nome': 'Ana' });
  });
});
