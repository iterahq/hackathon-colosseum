import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * O BATIMENTO QUE IMPEDE A AULA DE FECHAR SOZINHA.
 *
 * O reaper do banco encerra uma sessão `live` sem sinal de vida há 30 minutos.
 * Os sinais que ele conhecia — resposta de aluno e entrada na sala — não cobrem
 * o professor explicando, e em 10/08 uma aula real morreu no meio por isso.
 *
 * O que este arquivo protege é o CONTRATO do batimento, não o intervalo exato:
 * ele só bate em aula viva, e para de bater quando a tela sai. Um batimento que
 * continua depois do unmount escreveria em sessão encerrada por outra aba.
 */

const touchClassSessionHeartbeat = vi.fn();
vi.mock('@/services/liveClass.service', () => ({
  touchClassSessionHeartbeat: (id: string) => touchClassSessionHeartbeat(id),
}));

import { useClassHeartbeat } from '@/hooks/useClassHeartbeat';

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  touchClassSessionHeartbeat.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('useClassHeartbeat', () => {
  it('bate várias vezes dentro da janela de ociosidade do reaper', () => {
    renderHook(() => useClassHeartbeat('sess-1', true));

    // Meia hora é o prazo do reaper: se a aula sobrevive a ela, sobrevive.
    vi.advanceTimersByTime(30 * 60 * 1000);

    expect(touchClassSessionHeartbeat.mock.calls.length).toBeGreaterThan(1);
    expect(touchClassSessionHeartbeat).toHaveBeenCalledWith('sess-1');
  });

  it('não bate em aula que não está no ar', () => {
    renderHook(() => useClassHeartbeat('sess-1', false));
    vi.advanceTimersByTime(HOUR);
    expect(touchClassSessionHeartbeat).not.toHaveBeenCalled();
  });

  it('para de bater quando o console sai da tela', () => {
    const { unmount } = renderHook(() => useClassHeartbeat('sess-1', true));
    vi.advanceTimersByTime(HOUR);
    const before = touchClassSessionHeartbeat.mock.calls.length;

    unmount();
    vi.advanceTimersByTime(HOUR);

    expect(touchClassSessionHeartbeat.mock.calls.length).toBe(before);
  });
});
