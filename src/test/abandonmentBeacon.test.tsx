import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * O BEACON — quando o abandono é disparado, e por qual transporte.
 *
 * Plano `20260803-itera-learning-control-plane-prototipo` (LCPWCI), Fase 1.
 *
 * A regra pura já está trancada em `abandonedAttempt.test.ts`. Aqui o assunto é
 * a metade suja: eventos de navegador que disparam duas vezes, teardown de
 * página onde `fetch` não tem garantia nenhuma, e a corrida em que o aluno
 * volta e responde.
 *
 * ⚠️ A PROVA DE IDEMPOTÊNCIA É EM TRÊS CAMADAS, e este arquivo cobre a
 * primeira. As outras duas estão em `abandonedAttempt.test.ts`:
 *   1. **em processo** (aqui) — uma origem só é registrada uma vez, mesmo com
 *      `pagehide` e desmontagem disparando em sequência;
 *   2. **na fila** — um alvo `abandonment:<activityId>`, o mais recente vence;
 *   3. **no banco** — upsert `do nothing` contra
 *      `uq_activity_traces_attempt (user_id, activity_id, started_at)`.
 * Uma chave só, checada três vezes.
 */

const enqueueWrite = vi.fn();
const revokeQueuedAbandonment = vi.fn();
const writeOrQueue = vi.fn().mockResolvedValue(true);

vi.mock('@/utils/answerOutbox', () => ({
  enqueueWrite: (...args: unknown[]) => enqueueWrite(...args),
  revokeQueuedAbandonment: (...args: unknown[]) => revokeQueuedAbandonment(...args),
}));
vi.mock('@/hooks/useAnswerOutbox', () => ({
  writeOrQueue: (...args: unknown[]) => writeOrQueue(...args),
}));

import { useAbandonmentBeacon, type AbandonmentTarget } from '@/hooks/useAbandonmentBeacon';
import { MIN_ABANDONMENT_VISIBLE_MS } from '@/utils/abandonment';

const OPENED_AT = Date.parse('2026-08-04T12:00:00.000Z');
const DWELL = { elapsedMs: 45_000, visibleMs: 40_000 };

function target(overrides: Partial<AbandonmentTarget> = {}): AbandonmentTarget {
  return {
    activityId: 'act-1',
    startedAt: OPENED_AT,
    read: () => DWELL,
    specSnapshot: { spec: { prompt: 'x' }, locale: 'pt' },
    pedagogicalContext: {
      schema: 1,
      template: 'single_choice',
      family: 'selection',
      mental_structures: ['estado'],
      metaphor: 'tanques_valvulas',
      difficulty: 2,
      objective: 'x',
      authored: true,
    },
    ...overrides,
  };
}

/** Todo abandono despachado por qualquer transporte, na ordem. */
const dispatched = () => [
  ...enqueueWrite.mock.calls.map((c) => c[0]),
  ...writeOrQueue.mock.calls.map((c) => c[0]),
];

beforeEach(() => {
  enqueueWrite.mockClear();
  revokeQueuedAbandonment.mockClear();
  writeOrQueue.mockClear();
});

describe('o beacon dispara quando a superfície some', () => {
  it('a desmontagem do player registra o abandono', () => {
    const { unmount } = renderHook(() => useAbandonmentBeacon(target()));
    expect(dispatched()).toHaveLength(0);

    unmount();

    expect(dispatched()).toHaveLength(1);
    expect(dispatched()[0]).toMatchObject({
      kind: 'abandonment',
      activityId: 'act-1',
      startedAt: OPENED_AT,
      reason: 'left_activity',
    });
  });

  it('trocar de atividade sem responder registra a que ficou para trás', () => {
    const { rerender } = renderHook(({ t }) => useAbandonmentBeacon(t), {
      initialProps: { t: target() },
    });

    rerender({ t: target({ activityId: 'act-2', startedAt: OPENED_AT + 60_000 }) });

    expect(dispatched()).toHaveLength(1);
    expect(dispatched()[0]).toMatchObject({ activityId: 'act-1', startedAt: OPENED_AT });
  });

  it('`pagehide` registra o abandono sem esperar a desmontagem', () => {
    renderHook(() => useAbandonmentBeacon(target()));

    window.dispatchEvent(new Event('pagehide'));

    expect(dispatched()).toHaveLength(1);
    expect(dispatched()[0]).toMatchObject({ reason: 'page_teardown' });
  });

  it('re-renderizar não dispara nada — só a superfície sumindo dispara', () => {
    const { rerender } = renderHook(({ t }) => useAbandonmentBeacon(t), {
      initialProps: { t: target() },
    });
    rerender({ t: target() });
    rerender({ t: target() });
    expect(dispatched()).toHaveLength(0);
  });
});

describe('🚚 o transporte muda conforme o que está morrendo', () => {
  it('no teardown vai SÓ pela fila durável — localStorage é síncrono', () => {
    // `sendBeacon` não serve: ele não seta HEADERS, e todo write aqui vai pro
    // PostgREST autenticado por `Authorization: Bearer <JWT>` + `apikey`. Um
    // beacon só alcançaria um endpoint ANÔNIMO, que este repo não tem e que
    // seria pagar telemetria com o modelo de segurança.
    renderHook(() => useAbandonmentBeacon(target()));

    window.dispatchEvent(new Event('pagehide'));

    expect(enqueueWrite).toHaveBeenCalledTimes(1);
    // ⚠️ E NÃO tenta escrever direto em paralelo. Uma escrita em voo é
    // exatamente o que deixaria o abandono POUSAR para uma página que voltou do
    // bfcache e respondeu na mesma origem — e aí o trace da resposta colidiria
    // com ele e seria descartado. Só na fila, o abandono continua revogável.
    expect(writeOrQueue).not.toHaveBeenCalled();
  });

  it('com o documento vivo vai pelo caminho normal (escrita direta, fila no erro)', () => {
    const { unmount } = renderHook(() => useAbandonmentBeacon(target()));
    unmount();
    expect(writeOrQueue).toHaveBeenCalledTimes(1);
    expect(enqueueWrite).not.toHaveBeenCalled();
  });
});

describe('🔁 idempotência em processo: o beacon PODE disparar duas vezes', () => {
  it('`pagehide` seguido de desmontagem produz UM abandono, não dois', () => {
    // É literalmente o que fechar uma aba faz.
    const { unmount } = renderHook(() => useAbandonmentBeacon(target()));

    window.dispatchEvent(new Event('pagehide'));
    unmount();

    expect(dispatched()).toHaveLength(1);
  });

  it('`pagehide` repetido (mobile dispara solto) produz UM abandono', () => {
    renderHook(() => useAbandonmentBeacon(target()));

    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pagehide'));

    expect(dispatched()).toHaveLength(1);
  });

  it('a segunda chamada devolve o veredito `already_recorded`, não um erro', () => {
    const { result } = renderHook(() => useAbandonmentBeacon(target()));

    expect(result.current.fire('page_teardown')).toBe('record');
    expect(result.current.fire('left_activity')).toBe('already_recorded');
    expect(dispatched()).toHaveLength(1);
  });

  it('mas UMA NOVA ABERTURA da mesma atividade é uma nova observação', () => {
    // A chave é (atividade, origem). Abrir de novo dá uma origem nova, e a
    // segunda visita é um segundo fato sobre o aluno — não uma duplicata.
    const { rerender, unmount } = renderHook(({ t }) => useAbandonmentBeacon(t), {
      initialProps: { t: target() },
    });
    window.dispatchEvent(new Event('pagehide'));

    rerender({ t: target({ startedAt: OPENED_AT + 600_000 }) });
    unmount();

    expect(dispatched()).toHaveLength(2);
    expect(dispatched().map((e) => e.startedAt)).toEqual([OPENED_AT, OPENED_AT + 600_000]);
  });
});

describe('🔒 uma tentativa respondida nunca vira abandono', () => {
  it('responder desarma o beacon para aquela origem', () => {
    const { result, unmount } = renderHook(() => useAbandonmentBeacon(target()));

    result.current.markSettled('act-1');
    unmount();

    expect(dispatched()).toHaveLength(0);
  });

  it('responder revoga também o abandono já ENFILEIRADO (a volta do bfcache)', () => {
    const { result } = renderHook(() => useAbandonmentBeacon(target()));

    window.dispatchEvent(new Event('pagehide')); // enfileirou
    result.current.markSettled('act-1');

    expect(enqueueWrite).toHaveBeenCalledTimes(1);
    expect(revokeQueuedAbandonment).toHaveBeenCalledWith('act-1');
  });

  it('desarmar uma atividade não desarma a seguinte', () => {
    const { result, rerender, unmount } = renderHook(({ t }) => useAbandonmentBeacon(t), {
      initialProps: { t: target() },
    });
    result.current.markSettled('act-1');

    rerender({ t: target({ activityId: 'act-2', startedAt: OPENED_AT + 60_000 }) });
    unmount();

    expect(dispatched()).toHaveLength(1);
    expect(dispatched()[0]).toMatchObject({ activityId: 'act-2' });
  });
});

describe('o beacon respeita os filtros da regra', () => {
  it('permanência curta demais não vira abandono', () => {
    const { unmount } = renderHook(() =>
      useAbandonmentBeacon(
        target({ read: () => ({ elapsedMs: 900_000, visibleMs: MIN_ABANDONMENT_VISIBLE_MS - 1 }) })
      )
    );
    unmount();
    expect(dispatched()).toHaveLength(0);
  });

  it('reler uma atividade já concluída não vira abandono', () => {
    const { unmount } = renderHook(() => useAbandonmentBeacon(target({ reviewing: true })));
    unmount();
    expect(dispatched()).toHaveLength(0);
  });

  it('sem atividade na tela não há o que abandonar', () => {
    const { unmount } = renderHook(() => useAbandonmentBeacon(null));
    window.dispatchEvent(new Event('pagehide'));
    unmount();
    expect(dispatched()).toHaveLength(0);
  });

  it('o listener de `pagehide` sai junto com o hook', () => {
    const { unmount } = renderHook(() => useAbandonmentBeacon(target()));
    unmount();
    enqueueWrite.mockClear();
    writeOrQueue.mockClear();

    window.dispatchEvent(new Event('pagehide'));

    expect(dispatched()).toHaveLength(0);
  });
});

describe('a linha de abandono carrega o que a torna analisável', () => {
  it('leva as MESMAS duas anotações de uma tentativa liquidada', () => {
    const { unmount } = renderHook(() => useAbandonmentBeacon(target()));
    unmount();
    expect(dispatched()[0]).toMatchObject({
      specSnapshot: { spec: { prompt: 'x' }, locale: 'pt' },
      pedagogicalContext: { mental_structures: ['estado'], metaphor: 'tanques_valvulas' },
    });
  });

  it('leva a permanência medida, que é o único lugar onde ela pode viver', () => {
    // Não há linha de `activity_results` para um abandono, de propósito.
    const { unmount } = renderHook(() => useAbandonmentBeacon(target()));
    unmount();
    expect(dispatched()[0]).toMatchObject({ duration: DWELL });
  });
});
