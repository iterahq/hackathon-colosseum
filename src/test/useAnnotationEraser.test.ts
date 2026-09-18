import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnnotationEraser } from '@/hooks/useAnnotationEraser';
import type { AnnotationStroke } from '@/types/liveAnnotation';

/**
 * A borracha dentro do orçamento.
 *
 * Um traço encostado é uma mensagem se o envio for imediato, e arrastar por cima
 * de vários a 60 Hz de `pointermove` estoura o teto de 100 msgs/s do projeto —
 * cujo estouro DESCONECTA a turma. O que este arquivo trava é que o que sai no
 * fio é UM lote por intervalo, com os ids dentro.
 */

const INTERVAL = 200;

const stroke = (id: string, y: number): AnnotationStroke => ({
  id,
  color: 'menta',
  points: [0.25, y, 0.75, y],
  fromW: 400,
  fromH: 200,
  done: false,
  seq: 1,
  touchedAt: 0,
});

const pointer = (x: number, y: number) =>
  ({
    pointerId: 1,
    clientX: x,
    clientY: y,
    currentTarget: {
      setPointerCapture: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 200 }),
    },
  }) as unknown as React.PointerEvent<HTMLElement>;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function mount(strokes: readonly AnnotationStroke[], erase: (ids: string[]) => void) {
  return renderHook(() =>
    useAnnotationEraser({ active: true, intervalMs: INTERVAL, strokes, erase })
  );
}

describe('useAnnotationEraser', () => {
  it('junta os traços encostados num lote só por intervalo', () => {
    const erase = vi.fn();
    const { result } = mount([stroke('a', 0.25), stroke('b', 0.75)], erase);

    act(() => {
      result.current.onPointerDown(pointer(200, 50));
      result.current.onPointerMove(pointer(200, 150));
    });
    expect(erase).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(INTERVAL));
    expect(erase).toHaveBeenCalledTimes(1);
    expect(erase.mock.calls[0][0].sort()).toEqual(['a', 'b']);
  });

  it('passar duas vezes pelo mesmo traço não o enfileira duas vezes', () => {
    const erase = vi.fn();
    const { result } = mount([stroke('a', 0.25)], erase);

    act(() => {
      result.current.onPointerDown(pointer(150, 50));
      result.current.onPointerMove(pointer(250, 50));
    });
    act(() => vi.advanceTimersByTime(INTERVAL));
    expect(erase.mock.calls[0][0]).toEqual(['a']);
  });

  // Sem isto o traço some só na tela do professor e continua na da turma.
  it('soltar a borracha entrega o lote pendente na hora', () => {
    const erase = vi.fn();
    const { result } = mount([stroke('a', 0.25)], erase);

    act(() => {
      result.current.onPointerDown(pointer(200, 50));
      result.current.onPointerUp();
    });
    expect(erase).toHaveBeenCalledWith(['a']);
  });

  it('arrastar longe de qualquer traço não manda mensagem nenhuma', () => {
    const erase = vi.fn();
    const { result } = mount([stroke('a', 0.25)], erase);

    act(() => {
      result.current.onPointerDown(pointer(200, 190));
      result.current.onPointerMove(pointer(210, 190));
      result.current.onPointerUp();
    });
    act(() => vi.advanceTimersByTime(INTERVAL * 3));
    expect(erase).not.toHaveBeenCalled();
  });

  it('mover sem ter encostado a borracha não apaga nada', () => {
    const erase = vi.fn();
    const { result } = mount([stroke('a', 0.25)], erase);

    act(() => result.current.onPointerMove(pointer(200, 50)));
    act(() => vi.advanceTimersByTime(INTERVAL * 3));
    expect(erase).not.toHaveBeenCalled();
  });
});
