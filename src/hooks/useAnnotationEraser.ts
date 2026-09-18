import { useCallback, useEffect, useRef } from 'react';
import { annotationAtPoint } from '@/utils/liveAnnotationHitTest';
import type { AnnotationStroke } from '@/types/liveAnnotation';

/**
 * A borracha do professor.
 *
 * ## Ela também anda no orçamento
 *
 * Apagar arrastando por cima de vários traços dispararia uma mensagem por traço
 * encostado, a 60 Hz de `pointermove`. Sobre o teto de 100 msgs/s do projeto —
 * multiplicado pelo tamanho da sala — isso DESCONECTA a turma para economizar
 * segundos de um traço que ia sumir sozinho. Então o que sai no fio é um LOTE de
 * ids no mesmo intervalo do desenho e do cursor: apagar não abre orçamento novo,
 * ele cabe no que já existe.
 *
 * A fila de ids é a mesma coisa que a lista de "já apagados": um traço na fila
 * sai do teste de acerto na hora, então arrastar por cima dele de novo não o
 * enfileira duas vezes, mesmo antes de o lote sair.
 */
export function useAnnotationEraser(opts: {
  /** Borracha escolhida na barra. Fora disso a superfície nem escuta ponteiro. */
  active: boolean;
  /** De `stageCursorPlan(roomSize)` — o mesmo orçamento do cursor e do desenho. */
  intervalMs: number;
  strokes: readonly AnnotationStroke[];
  erase: (strokeIds: string[]) => void;
}) {
  const { active, intervalMs } = opts;
  const strokesRef = useRef(opts.strokes);
  strokesRef.current = opts.strokes;
  const eraseRef = useRef(opts.erase);
  eraseRef.current = opts.erase;

  const pendingRef = useRef<string[]>([]);
  const downRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    const ids = pendingRef.current;
    if (ids.length === 0) return;
    pendingRef.current = [];
    eraseRef.current(ids);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const end = useCallback(() => {
    if (!downRef.current) return;
    downRef.current = false;
    stopTimer();
    flush();
  }, [flush, stopTimer]);

  // Soltar a borracha (ou desmontar) com lote na fila tem que ENTREGAR o lote:
  // sem isto o traço some só na tela do professor e continua na da turma.
  useEffect(() => {
    if (active) return;
    end();
  }, [active, end]);
  useEffect(() => () => end(), [end]);

  const hit = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const queued = pendingRef.current;
    const alive =
      queued.length === 0
        ? strokesRef.current
        : strokesRef.current.filter((s) => !queued.includes(s.id));
    const found = annotationAtPoint(alive, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    if (found) queued.push(found.id);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!active || !Number.isFinite(intervalMs)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    downRef.current = true;
    hit(e);
    stopTimer();
    timerRef.current = window.setInterval(flush, intervalMs);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!downRef.current) return;
    hit(e);
  };

  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}
