import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStageCursorCapture } from '@/hooks/useStageCursorCapture';
import type { StageCursorFrame } from '@/types/liveClass';
import { CODE_CARET_EVENT } from '@/utils/stageCursorDom';
import {
  stageCursorPlan,
  STAGE_CURSOR_BUDGET_MSGS_PER_SEC,
  REALTIME_CEILING_MSGS_PER_SEC,
} from '@/utils/stageCursorRate';

/**
 * MEASUREMENT, not arithmetic.
 *
 * `stageCursorRate.test.ts` proves the plan's numbers are internally consistent.
 * This file proves the emitter actually obeys them: it drives real
 * `pointermove` events at ~120 Hz through the real hook on a real (jsdom) DOM
 * with REAL timers, and counts what would have hit the wire.
 *
 * That distinction matters because there is no safety net underneath. Measured
 * on `@supabase/realtime-js@2.108.2` (the version this repo installs), the
 * `eventsPerSecond` client throttle the plan hoped for has **zero occurrences
 * anywhere under `@supabase/`** — it was removed after v2.8.x. If the hook's
 * own throttle regresses, nothing else catches it, and the failure mode is a
 * disconnected classroom rather than a slow one.
 *
 * Billed messages are `sends × (roomSize + 1)`, per Supabase's rule that a
 * broadcast costs "one message sent plus one message per subscribed client that
 * receives it".
 */

const PANE_W = 400;
const PANE_H = 360;
/** Long enough that a 2 Hz plan still gets several samples inside the window. */
const WINDOW_MS = 2000;
/** Faster than any plan, so the throttle — not the input — is what is measured. */
const INPUT_HZ = 120;

let pane: HTMLDivElement;

beforeEach(() => {
  pane = document.createElement('div');
  pane.setAttribute('data-stage-cursor-source', '');
  pane.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: PANE_W, bottom: PANE_H, width: PANE_W, height: PANE_H, x: 0, y: 0 }) as DOMRect;
  document.body.appendChild(pane);
});

afterEach(() => {
  pane.remove();
});

function movePointer(clientX: number, clientY: number) {
  pane.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY, bubbles: true }));
}

/**
 * Drives continuous in-pane movement for `ms` and reports what reached `send`.
 *
 * `hz` is measured from the gaps BETWEEN sends, not `count / elapsed`. The
 * emitter is leading-edge (the first move after a pause goes out immediately,
 * so the class never waits a beat for the cursor to appear), and in a short
 * window that one free frame inflates `count / elapsed` by a whole `1/window`.
 * The steady-state gap is what actually sits on the wire during the minutes a
 * learner spends on stage, so that is what is measured — and `count` is bounded
 * separately, which is the assertion that would catch a genuine over-emission.
 */
async function measure(intervalMs: number, ms = WINDOW_MS) {
  const frames: StageCursorFrame[] = [];
  const stamps: number[] = [];
  const hook = renderHook(() =>
    useStageCursorCapture({
      active: true,
      intervalMs,
      send: (f) => {
        frames.push(f);
        // Only the streamed frames set the rate. The one-off `visible: false`
        // edges (leaving the pane, unmounting) are deliberately NOT throttled,
        // so counting them would measure the retraction, not the stream.
        if (f.visible) stamps.push(performance.now());
      },
    })
  );
  const startedAt = performance.now();
  await new Promise<void>((resolve) => {
    let i = 0;
    const id = setInterval(() => {
      i++;
      // A moving target: the hook drops frames whose rounded position did not
      // change, so a static pointer would measure zero and prove nothing.
      movePointer(10 + (i % 300), 10 + ((i * 7) % 300));
      if (performance.now() - startedAt >= ms) {
        clearInterval(id);
        resolve();
      }
    }, 1000 / INPUT_HZ);
  });
  const elapsedSec = (performance.now() - startedAt) / 1000;
  hook.unmount();
  const gaps = stamps.slice(1).map((t, i) => t - stamps[i]);
  const meanGapMs = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : Infinity;
  return { frames, elapsedSec, sends: stamps.length, meanGapMs, hz: 1000 / meanGapMs };
}

describe('useStageCursorCapture — measured emission rate', () => {
  // 5 = today's rooms; 15 = a class that grew; 20 = the size the fixed-5 Hz
  // proposal would have allowed and that would have blown the ceiling.
  const rooms = [5, 15, 20];

  it.each(rooms)(
    'room of %i: measured rate matches the plan and stays inside the budget',
    async (room) => {
      const plan = stageCursorPlan(room);
      const { sends, elapsedSec, meanGapMs, hz } = await measure(plan.intervalMs);
      const billedPerSec = hz * (room + 1);

      // Reported so the numbers live in the CI log, not only in a PR body.
      console.log(
        `[stage-cursor] room=${room} plan=${plan.hz}Hz/${plan.intervalMs}ms → ` +
          `measured ${hz.toFixed(2)}Hz (mean gap ${meanGapMs.toFixed(0)}ms, ${sends} sends in ` +
          `${elapsedSec.toFixed(2)}s) → billed ${billedPerSec.toFixed(1)} msgs/s ` +
          `(${((billedPerSec / REALTIME_CEILING_MSGS_PER_SEC) * 100).toFixed(0)}% of the Free ceiling)`
      );

      // ±15 % on the plan's own target (plan V6).
      expect(hz).toBeLessThanOrEqual(plan.hz * 1.15);
      expect(hz).toBeGreaterThanOrEqual(plan.hz * 0.85);
      expect(billedPerSec).toBeLessThanOrEqual(STAGE_CURSOR_BUDGET_MSGS_PER_SEC * 1.15);
      expect(billedPerSec).toBeLessThan(REALTIME_CEILING_MSGS_PER_SEC);

      // The absolute count is bounded too: one leading frame plus one per
      // interval. This is the assertion that fails if the throttle ever leaks.
      expect(sends).toBeLessThanOrEqual(
        Math.ceil((elapsedSec * 1000) / plan.intervalMs) + 1
      );
    },
    20_000
  );

  it('does NOT rely on any SDK-side throttle — 120 Hz of input becomes ~5 Hz of output', async () => {
    const plan = stageCursorPlan(5);
    const { sends, elapsedSec } = await measure(plan.intervalMs);
    const unthrottled = INPUT_HZ * elapsedSec;
    // Two orders of magnitude of suppression is the whole feature.
    expect(sends).toBeLessThan(unthrottled / 10);
  }, 20_000);
});

describe('useStageCursorCapture — what is NOT sent', () => {
  it('sends nothing at all when this client is not the stage source', async () => {
    const frames: StageCursorFrame[] = [];
    const hook = renderHook(() =>
      useStageCursorCapture({ active: false, intervalMs: 200, send: (f) => frames.push(f) })
    );
    for (let i = 0; i < 50; i++) movePointer(20 + i, 30 + i);
    await new Promise((r) => setTimeout(r, 300));
    hook.unmount();
    expect(frames).toHaveLength(0);
  });

  it('sends nothing when the plan disabled the mirror (Infinity interval)', async () => {
    const frames: StageCursorFrame[] = [];
    const hook = renderHook(() =>
      useStageCursorCapture({ active: true, intervalMs: Infinity, send: (f) => frames.push(f) })
    );
    for (let i = 0; i < 50; i++) movePointer(20 + i, 30 + i);
    await new Promise((r) => setTimeout(r, 300));
    hook.unmount();
    expect(frames).toHaveLength(0);
  });

  it('costs nothing while the pointer rests — the rate is a ceiling, not a heartbeat', async () => {
    const frames: StageCursorFrame[] = [];
    const hook = renderHook(() =>
      useStageCursorCapture({ active: true, intervalMs: 100, send: (f) => frames.push(f) })
    );
    for (let i = 0; i < 40; i++) movePointer(120, 120);
    await new Promise((r) => setTimeout(r, 500));
    hook.unmount();
    // One frame for the position it moved to; nothing for the 39 that repeated it.
    expect(frames.filter((f) => f.visible).length).toBeLessThanOrEqual(1);
  });

  it('leaving the pane retracts the cursor IMMEDIATELY and then goes quiet', async () => {
    const frames: StageCursorFrame[] = [];
    const hook = renderHook(() =>
      useStageCursorCapture({ active: true, intervalMs: 500, send: (f) => frames.push(f) })
    );
    movePointer(100, 100);
    await new Promise((r) => setTimeout(r, 60));
    expect(frames.at(-1)?.visible).toBe(true);

    // Out of the pane (the nav bar, the preview iframe, anywhere else).
    movePointer(PANE_W + 200, 40);
    // NOT waiting out the 500ms throttle: privacy edges are not throttled.
    expect(frames.at(-1)?.visible).toBe(false);

    const afterLeave = frames.length;
    for (let i = 0; i < 30; i++) movePointer(PANE_W + 200 + i, 40 + i);
    await new Promise((r) => setTimeout(r, 300));
    hook.unmount();
    // Everything outside the exercise stays outside — no stream, and no second
    // redundant retraction.
    expect(frames.length).toBe(afterLeave);
  });

  it('retracts the cursor when this client comes OFF the stage', async () => {
    const frames: StageCursorFrame[] = [];
    const hook = renderHook(
      ({ active }: { active: boolean }) =>
        useStageCursorCapture({ active, intervalMs: 100, send: (f) => frames.push(f) }),
      { initialProps: { active: true } }
    );
    movePointer(100, 100);
    await new Promise((r) => setTimeout(r, 60));
    frames.length = 0;
    hook.rerender({ active: false });
    // Zero size on a retract frame is deliberate: the receiver only carries a
    // POSITIVE size through, so a zero reads as "no size" instead of pinning the
    // pointer to the top-left corner.
    expect(frames).toEqual([{ x: 0, y: 0, paneW: 0, paneH: 0, visible: false, caret: null }]);
    hook.unmount();
  });
});

describe('useStageCursorCapture — payload', () => {
  it('normalizes to 0..1 against the pane', async () => {
    const frames: StageCursorFrame[] = [];
    const hook = renderHook(() =>
      useStageCursorCapture({ active: true, intervalMs: 50, send: (f) => frames.push(f) })
    );
    movePointer(PANE_W / 4, PANE_H / 2);
    await new Promise((r) => setTimeout(r, 60));
    hook.unmount();
    expect(frames[0].x).toBeCloseTo(0.25, 3);
    expect(frames[0].y).toBeCloseTo(0.5, 3);
  });

  it('carries the local Monaco caret for free, on the frame it already sends', async () => {
    const frames: StageCursorFrame[] = [];
    const hook = renderHook(() =>
      useStageCursorCapture({ active: true, intervalMs: 50, send: (f) => frames.push(f) })
    );
    window.dispatchEvent(new CustomEvent(CODE_CARET_EVENT, { detail: { line: 42, column: 7 } }));
    movePointer(80, 90);
    await new Promise((r) => setTimeout(r, 60));
    hook.unmount();
    // `.at(-1)` would be the retraction unmount emits — the caret rides the
    // VISIBLE frames.
    expect(frames.find((f) => f.visible)?.caret).toEqual({ line: 42, column: 7 });
  });
});

/* ── o segundo emissor: o professor sobre o painel espelho (K1) ────────────────
   Mesmo capturador, mesma geometria, outro painel — e o clique, que só este lado
   liga. O do aluno já viaja como caret, então ligar clique lá seria pagar
   mensagem por informação que o espelho já desenha. */
describe('useStageCursorCapture — o painel é escolhível', () => {
  it('mede o painel ESPELHO quando é ele o pedido, e ignora o de origem', async () => {
    const mirror = document.createElement('div');
    mirror.setAttribute('data-stage-cursor-mirror', '');
    mirror.getBoundingClientRect = () =>
      ({ left: 1000, top: 0, right: 1400, bottom: 360, width: 400, height: 360, x: 1000, y: 0 }) as DOMRect;
    document.body.appendChild(mirror);

    const frames: StageCursorFrame[] = [];
    const hook = renderHook(() =>
      useStageCursorCapture({
        active: true,
        intervalMs: 50,
        selector: '[data-stage-cursor-mirror]',
        send: (f) => frames.push(f),
      })
    );
    // Dentro do painel de ORIGEM, fora do espelho: não é movimento pra este emissor.
    movePointer(100, 100);
    await new Promise((r) => setTimeout(r, 60));
    expect(frames.filter((f) => f.visible)).toHaveLength(0);

    // Metade do espelho, normalizada contra ELE (0.5), não contra o outro painel.
    movePointer(1200, 180);
    await new Promise((r) => setTimeout(r, 60));
    hook.unmount();
    mirror.remove();
    expect(frames.find((f) => f.visible)).toMatchObject({ x: 0.5, y: 0.5, visible: true });
  });

  it('emite o CLIQUE fora do throttle quando pedido', async () => {
    const frames: StageCursorFrame[] = [];
    const hook = renderHook(() =>
      useStageCursorCapture({ active: true, intervalMs: 5000, clicks: true, send: (f) => frames.push(f) })
    );
    // Um throttle de 5s: se o clique passasse por ele, nada sairia.
    pane.dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, clientY: 180, bubbles: true }));
    hook.unmount();
    expect(frames[0]).toMatchObject({ x: 0.5, y: 0.5, visible: true, click: true });
  });

  it('não emite clique nenhum por default', async () => {
    const frames: StageCursorFrame[] = [];
    const hook = renderHook(() =>
      useStageCursorCapture({ active: true, intervalMs: 5000, send: (f) => frames.push(f) })
    );
    pane.dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, clientY: 180, bubbles: true }));
    hook.unmount();
    expect(frames.filter((f) => f.click === true)).toHaveLength(0);
  });
});
