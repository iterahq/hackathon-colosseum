import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * itera-api 0014 fez `itera.my_subscription` poder devolver MAIS DE UMA linha:
 * quem é membro de um tenant isento e também tem uma assinatura própria vencida
 * recebe as duas. O `.limit(1)` de antes escolhia uma sem ordenar — o aluno da
 * aula gratuita podia ler a linha vencida e ser mandado pro /subscribe conforme
 * a ordem que o Postgres devolvesse.
 */

let rows: Record<string, unknown>[] = [];
let limitCalled = false;

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: () => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        limit: () => {
          limitCalled = true;
          return builder;
        },
        then: (resolve: (v: { data: unknown; error: null }) => void) =>
          resolve({ data: rows, error: null }),
      };
      return builder;
    },
  }),
}));

import { getMyEntitlement } from '@/services/entitlement.service';

beforeEach(() => {
  rows = [];
  limitCalled = false;
});

describe('entitlement com tenant isento', () => {
  it('a linha isenta vence a assinatura vencida, venha em que ordem vier', async () => {
    rows = [
      { status: 'past_due', is_active: false, current_period_end: null },
      { status: 'exempt', is_active: true, current_period_end: null },
    ];
    expect((await getMyEntitlement()).active).toBe(true);

    rows = [...rows].reverse();
    expect((await getMyEntitlement()).active).toBe(true);
  });

  it('nunca corta a leitura em uma linha só', async () => {
    rows = [{ status: 'active', is_active: true, current_period_end: null }];
    await getMyEntitlement();
    expect(limitCalled).toBe(false);
  });

  it('sem nenhuma linha entitled, continua inativo', async () => {
    rows = [
      { status: 'past_due', is_active: false, current_period_end: null },
      { status: 'unpaid', is_active: false, current_period_end: null },
    ];
    const ent = await getMyEntitlement();
    expect(ent.active).toBe(false);
    expect(ent.status).toBe('past_due');
  });

  it('sem linha nenhuma é inativo, não erro', async () => {
    expect(await getMyEntitlement()).toEqual({
      active: false,
      status: null,
      currentPeriodEnd: null,
      seatCount: null,
      cancelAtPeriodEnd: false,
    });
  });
});
