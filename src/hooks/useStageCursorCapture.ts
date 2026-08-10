import { useEffect, useRef } from 'react';
import {
  CODE_CARET_EVENT,
  normalizedPointIn,
  STAGE_CURSOR_SOURCE_SELECTOR,
  type CodeCaretEventDetail,
} from '@/utils/stageCursorDom';
import type { StageCursorCaret, StageCursorFrame } from '@/types/liveClass';

/**
 * Captures the local pointer over the code editor pane and hands it to `send`
 * at most `intervalMs` apart.
 *
 * ## The throttle is ours, and it has to be
 *
 * The plan assumed `@supabase/realtime-js` still shipped an `eventsPerSecond`
 * safety net (ADR-7 asked for that to be MEASURED, not cited). Measured on the
 * version this repo installs, **2.108.2: `eventsPerSecond` does not exist** —
 * zero occurrences anywhere under `@supabase/`. There is no SDK-side throttle
 * to fall back on, so an unthrottled `pointermove` would put ~60 sends/s on the
 * wire, i.e. ~360 billed messages/s in a room of five: 3.6× the project's
 * entire Free-tier ceiling, from one person moving a mouse.
 *
 * ## Only movement, and only inside the pane
 *
 * A frame is sent only when the normalized position actually CHANGED, so a
 * resting pointer costs nothing at all — the rate ceiling is a ceiling, not a
 * heartbeat. Leaving the pane sends exactly one `visible: false` and then goes
 * quiet; that single edge is what makes "the class only sees the pointer while
 * it is over the exercise" true in the transport rather than in the renderer.
 *
 * ## Dois emissores, um capturador (K1)
 *
 * O `selector` existe porque o cursor agora corre nos DOIS sentidos: o aluno no
 * palco emite sobre o painel de origem (o editor dele) e o PROFESSOR emite sobre
 * o painel espelho. São os dois lados do mesmo contrato de `stageCursorDom`, com
 * a mesma geometria, então a única coisa que muda é qual painel medir.
 */
export function useStageCursorCapture(opts: {
  /** This client's work is the one on stage. Everyone else is inert. */
  active: boolean;
  /** From `stageCursorPlan(roomSize)`. `Infinity` (mirror off) disables capture. */
  intervalMs: number;
  /** Painel a medir. Default = o painel de ORIGEM (o editor de quem está no palco). */
  selector?: string;
  /**
   * Emitir também um frame por CLIQUE, fora do throttle.
   *
   * Desligado por default, e não por prudência: o clique do aluno sobre o
   * próprio editor é o caret, e o caret o espelho JÁ desenha (`remoteCaret`) —
   * ligar ali seria pagar mensagem por uma informação que a turma já vê. O do
   * professor não tem esse substituto: ele não digita no editor do aluno.
   */
  clicks?: boolean;
  send: (frame: StageCursorFrame) => void;
}): void {
  const { active, intervalMs, selector = STAGE_CURSOR_SOURCE_SELECTOR, clicks = false } = opts;
  const sendRef = useRef(opts.send);
  sendRef.current = opts.send;

  // Latest local caret, refreshed by the editable Monaco. It rides the throttled
  // pointer frame instead of a stream of its own, so it is free.
  const caretRef = useRef<StageCursorCaret | null>(null);
  useEffect(() => {
    const onCaret = (e: Event) => {
      const d = (e as CustomEvent<CodeCaretEventDetail>).detail;
      if (!d || typeof d.line !== 'number' || typeof d.column !== 'number') return;
      caretRef.current = { line: d.line, column: d.column };
    };
    window.addEventListener(CODE_CARET_EVENT, onCaret);
    return () => window.removeEventListener(CODE_CARET_EVENT, onCaret);
  }, []);

  useEffect(() => {
    if (!active || !Number.isFinite(intervalMs)) return;

    let paneEl: HTMLElement | null = null;
    let lastSentAt = 0;
    let timer: number | null = null;
    let pending: { x: number; y: number; paneW: number; paneH: number } | null = null;
    let lastPoint: { x: number; y: number } | null = null;
    let visible = false;

    const pane = (): HTMLElement | null => {
      if (paneEl && paneEl.isConnected) return paneEl;
      paneEl = document.querySelector<HTMLElement>(selector);
      return paneEl;
    };

    /** Ponto normalizado + tamanho do painel medido, ou null se está fora dele. */
    const at = (e: PointerEvent) => {
      const el = pane();
      return el ? normalizedPointIn(el, e.clientX, e.clientY) : null;
    };

    const emit = (frame: StageCursorFrame) => {
      lastSentAt = Date.now();
      sendRef.current(frame);
    };

    const flush = () => {
      timer = null;
      if (!pending) return;
      const next = pending;
      pending = null;
      lastPoint = next;
      visible = true;
      emit({ ...next, visible: true, caret: caretRef.current });
    };

    const schedule = () => {
      if (timer !== null) return;
      const wait = Math.max(0, intervalMs - (Date.now() - lastSentAt));
      if (wait === 0) {
        flush();
        return;
      }
      timer = window.setTimeout(flush, wait);
    };

    const leave = () => {
      if (!visible) return;
      visible = false;
      pending = null;
      lastPoint = null;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      // The privacy edge is NOT throttled: the class must stop seeing the
      // pointer the instant it leaves the exercise, not up to 500ms later.
      emit({ x: 0, y: 0, paneW: 0, paneH: 0, visible: false, caret: null });
    };

    // Capture phase + document level: the pane's own content is Monaco, whose
    // internals we do not want to reach into, and capture means no descendant
    // can stop us seeing the move.
    const onMove = (e: PointerEvent) => {
      const p = at(e);
      if (!p) {
        leave();
        return;
      }
      if (lastPoint && lastPoint.x === p.x && lastPoint.y === p.y && visible) return;
      pending = p;
      schedule();
    };

    // Fora do throttle, como a borda de privacidade: um clique é raro e é um
    // gesto de "olha AQUI". Atrasá-lo até 500ms desfaz o sentido dele — o
    // professor já estaria falando de outra coisa quando o pulso aparecesse.
    const onDown = (e: PointerEvent) => {
      const p = at(e);
      if (!p) return;
      lastPoint = p;
      visible = true;
      emit({ ...p, visible: true, caret: caretRef.current, click: true });
    };

    document.addEventListener('pointermove', onMove, { capture: true, passive: true });
    if (clicks) document.addEventListener('pointerdown', onDown, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove, { capture: true });
      if (clicks) document.removeEventListener('pointerdown', onDown, { capture: true });
      if (timer !== null) clearTimeout(timer);
      // Coming off the stage (or unmounting) must retract the cursor, or the
      // class is left staring at a pointer frozen where its owner last was.
      if (visible) sendRef.current({ x: 0, y: 0, paneW: 0, paneH: 0, visible: false, caret: null });
    };
  }, [active, intervalMs, selector, clicks]);
}
