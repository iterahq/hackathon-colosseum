import { useEffect, useRef } from 'react';
import {
  CODE_CARET_EVENT,
  STAGE_CURSOR_SOURCE_SELECTOR,
  type CodeCaretEventDetail,
} from '@/utils/stageCursorDom';
import type { StageCursorCaret } from '@/types/liveClass';

export interface StageCursorFrame {
  x: number;
  y: number;
  visible: boolean;
  caret: StageCursorCaret | null;
}

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
 */
export function useStageCursorCapture(opts: {
  /** This client's work is the one on stage. Everyone else is inert. */
  active: boolean;
  /** From `stageCursorPlan(roomSize)`. `Infinity` (mirror off) disables capture. */
  intervalMs: number;
  send: (frame: StageCursorFrame) => void;
}): void {
  const { active, intervalMs } = opts;
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
    let pending: { x: number; y: number } | null = null;
    let lastPoint: { x: number; y: number } | null = null;
    let visible = false;

    const pane = (): HTMLElement | null => {
      if (paneEl && paneEl.isConnected) return paneEl;
      paneEl = document.querySelector<HTMLElement>(STAGE_CURSOR_SOURCE_SELECTOR);
      return paneEl;
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
      emit({ x: next.x, y: next.y, visible: true, caret: caretRef.current });
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
      emit({ x: 0, y: 0, visible: false, caret: null });
    };

    // Capture phase + document level: the pane's own content is Monaco, whose
    // internals we do not want to reach into, and capture means no descendant
    // can stop us seeing the move.
    const onMove = (e: PointerEvent) => {
      const el = pane();
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) {
        leave();
        return;
      }
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      // Sub-pixel jitter is not movement. Rounding to the transported precision
      // also makes "did it change" the same question on both sides of the wire.
      const rx = Math.round(x * 1000) / 1000;
      const ry = Math.round(y * 1000) / 1000;
      if (lastPoint && lastPoint.x === rx && lastPoint.y === ry && visible) return;
      pending = { x: rx, y: ry };
      schedule();
    };

    document.addEventListener('pointermove', onMove, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove, { capture: true });
      if (timer !== null) clearTimeout(timer);
      // Coming off the stage (or unmounting) must retract the cursor, or the
      // class is left staring at a pointer frozen where its owner last was.
      if (visible) sendRef.current({ x: 0, y: 0, visible: false, caret: null });
    };
  }, [active, intervalMs]);
}
