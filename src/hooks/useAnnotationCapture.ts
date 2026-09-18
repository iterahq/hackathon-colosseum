import { useCallback, useEffect, useRef } from 'react';
import type { AnnotationColor, AnnotationFrame } from '@/types/liveAnnotation';

/**
 * A mão do professor virando lotes de pontos.
 *
 * ## Captura a 60 Hz, envia a 5
 *
 * O cursor pode se dar ao luxo de AMOSTRAR na taxa em que envia: ponteiro é um
 * ponto, e o ponto de agora é o único que importa. Traço não — jogar fora os
 * pontos entre dois envios transforma a curva num polígono, e a letra manuscrita
 * vira rabisco. Então a captura pega TODO `pointermove` e o envio junta o que
 * caiu no intervalo num lote só.
 *
 * O resultado é a conta que faz a feature caber: **mesma taxa de mensagem do
 * cursor, fidelidade inteira**. O que cresce é o tamanho do payload (uns 20
 * números por lote), e tamanho de payload não é o que a Supabase cobra nem o que
 * derruba a sala — `msgs/s` é.
 *
 * ## Por que os handlers voltam em vez de o hook procurar o painel
 *
 * O `useStageCursorCapture` escuta o `document` porque precisa ver o ponteiro
 * passar por cima do Monaco sem tocar nos internos dele. Aqui é o oposto: a
 * superfície de desenho é uma camada NOSSA, por cima de tudo, e enquanto a caneta
 * está armada ela come o evento — senão arrastar por cima do editor seleciona
 * texto no meio do traço. Medir contra o `currentTarget` também mata o passo de
 * `querySelector` e o risco de medir o painel errado.
 */
export function useAnnotationCapture(opts: {
  /** Caneta armada. Fora disso a superfície é transparente a ponteiro. */
  active: boolean;
  /** De `stageCursorPlan(roomSize)` — o mesmo orçamento do cursor. */
  intervalMs: number;
  color: AnnotationColor;
  send: (frame: Omit<AnnotationFrame, 'userId'>) => void;
}) {
  const { active, intervalMs, color } = opts;
  const sendRef = useRef(opts.send);
  sendRef.current = opts.send;

  const strokeRef = useRef<{ id: string; seq: number; w: number; h: number } | null>(null);
  const bufferRef = useRef<number[]>([]);
  const timerRef = useRef<number | null>(null);

  const flush = useCallback((done: boolean) => {
    const stroke = strokeRef.current;
    if (!stroke) return;
    const points = bufferRef.current;
    bufferRef.current = [];
    // Lote vazio ainda vale a viagem quando é o ÚLTIMO: é ele que carrega o
    // `done`, e é o `done` que faz o relógio do sumiço começar a contar.
    if (points.length === 0 && !done) return;
    stroke.seq += 1;
    sendRef.current({
      strokeId: stroke.id,
      color,
      points,
      fromW: stroke.w,
      fromH: stroke.h,
      seq: stroke.seq,
      done,
    });
  }, [color]);

  const stopTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const end = useCallback(() => {
    if (!strokeRef.current) return;
    stopTimer();
    flush(true);
    strokeRef.current = null;
  }, [flush, stopTimer]);

  // Desarmar a caneta (ou desmontar) no meio do traço tem que FECHAR o traço.
  // Sem isto ele fica `done: false` para sempre na tela da turma, e um traço que
  // nunca termina é um traço que nunca some.
  useEffect(() => {
    if (active) return;
    end();
  }, [active, end]);
  useEffect(() => () => end(), [end]);

  const pointIn = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return {
      x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000,
      y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000,
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!active || !Number.isFinite(intervalMs)) return;
    const p = pointIn(e);
    if (!p) return;
    // `setPointerCapture`: soltar a caneta fora do painel tem que fechar o traço
    // aqui, não virar um `pointerup` perdido em outro elemento.
    e.currentTarget.setPointerCapture(e.pointerId);
    strokeRef.current = { id: crypto.randomUUID(), seq: 0, w: p.w, h: p.h };
    bufferRef.current = [p.x, p.y];
    flush(false);
    stopTimer();
    timerRef.current = window.setInterval(() => flush(false), intervalMs);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!strokeRef.current) return;
    const p = pointIn(e);
    if (!p) return;
    const buf = bufferRef.current;
    // Ponteiro parado não é traço. Sem isto um `pointermove` de sub-pixel enche o
    // lote de pontos idênticos e engrossa o payload à toa.
    if (buf.length >= 2 && buf[buf.length - 2] === p.x && buf[buf.length - 1] === p.y) return;
    buf.push(p.x, p.y);
  };

  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}
