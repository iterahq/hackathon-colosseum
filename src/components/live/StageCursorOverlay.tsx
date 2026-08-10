import { useEffect, useRef } from 'react';
import { stageCursorPlacement } from '@/utils/stageCursorPlacement';
import type { StageCursor } from '@/types/liveClass';

/**
 * The mirrored pointer of the person on stage, drawn inside the read-only code
 * pane. Absolutely positioned against the pane, so the parent must be
 * `relative` and the `data-stage-cursor-mirror` marker (see utils/stageCursorDom).
 *
 * ## Bigger than a real pointer, on purpose
 *
 * This is a pointer being read from across a room, off a projector, by people
 * who are not the one moving it. `SIZE_PX` is ~2× the OS default arrow (a
 * system cursor is roughly 12×19 CSS px) and carries the author's name, because
 * a bare arrow on a screen that already has the viewer's own arrow is
 * ambiguous exactly when it matters.
 *
 * Placement is in PIXELS of the EMITTER's pane, never percent of this one — see
 * `utils/stageCursorPlacement` for why percent lands on the wrong line.
 *
 * ## Interpolation is what buys the low rate
 *
 * The wire rate is 5 Hz at best and 2 Hz in a big room (see
 * `utils/stageCursorRate`) — rendered raw that is a pointer that teleports.
 * Smoothing between samples moves the fluency problem out of the network and
 * into the renderer, which is where it is free. The tween runs on rAF against a
 * ref'd transform, so a 5 Hz stream does not cause 5 React re-renders a second,
 * and a 60 fps tween causes none at all.
 */
const SIZE_PX = 28;
/** Time constant of the smoothing, as a fraction of the inter-sample gap. */
const TAU_RATIO = 0.45;

/**
 * Duas cores porque os dois ponteiros aparecem AO MESMO TEMPO no mesmo painel
 * (K1): o aluno no palco e o professor apontando nele. `streak` é clay-leaning
 * (`--streak: 30 65% 66%`), então o do professor não pode ser clay — seria a
 * mesma seta. `ink` é o neutro da marca e é literalmente a cara de um cursor de
 * sistema, que é o que um ponteiro emprestado deve parecer.
 */
const VARIANTS = {
  learner: { arrow: 'text-streak', label: 'bg-streak text-obsidiana' },
  instructor: { arrow: 'text-ink', label: 'bg-ink text-obsidiana' },
} as const;

export function StageCursorOverlay({
  cursor,
  authorName,
  intervalMs,
  variant = 'learner',
}: {
  cursor: StageCursor | null;
  authorName: string;
  /** Expected gap between samples — tunes the tween, not the transport. */
  intervalMs: number;
  variant?: keyof typeof VARIANTS;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const tauRef = useRef(120);
  tauRef.current = Math.max(40, (Number.isFinite(intervalMs) ? intervalMs : 200) * TAU_RATIO);

  const visible = Boolean(cursor?.visible);
  const x = cursor?.x ?? 0;
  const y = cursor?.y ?? 0;
  const paneW = cursor?.paneW;
  const paneH = cursor?.paneH;
  // Read through a ref inside the tween: the pane resizes mid-class, and a
  // closure captured when the rAF loop started would keep the old size forever.
  const paneRef = useRef({ paneW, paneH });
  paneRef.current = { paneW, paneH };

  useEffect(() => {
    if (!visible) {
      targetRef.current = null;
      posRef.current = null;
      return;
    }
    targetRef.current = { x, y };
    // A cursor that just appeared has no history to tween from — snapping avoids
    // a ghost sliding in from the corner every time someone takes the stage.
    if (posRef.current === null) posRef.current = { x, y };
  }, [visible, x, y]);

  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(100, now - last);
      last = now;
      const target = targetRef.current;
      const pos = posRef.current;
      const el = elRef.current;
      if (!target || !pos || !el) return;
      const alpha = 1 - Math.exp(-dt / tauRef.current);
      pos.x += (target.x - pos.x) * alpha;
      pos.y += (target.y - pos.y) * alpha;
      const { paneW: w, paneH: h } = paneRef.current;
      Object.assign(el.style, stageCursorPlacement(pos.x, pos.y, w, h));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  if (!cursor || !visible) return null;

  return (
    <div
      ref={elRef}
      data-testid="stage-cursor"
      data-stage-cursor-author={cursor.userId}
      data-stage-cursor-variant={variant}
      // Above Monaco's own layers, inert to the mouse: this is a picture of
      // someone else's pointer, it must never eat a click on the mirror.
      className="pointer-events-none absolute z-30 will-change-transform"
      // The first paint has to agree with the tween, or the pointer appears at the
      // percent spot for one frame and jumps.
      style={{
        ...stageCursorPlacement(x, y, paneW, paneH),
        width: SIZE_PX,
        height: SIZE_PX,
      }}
    >
      <svg
        width={SIZE_PX}
        height={SIZE_PX}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))' }}
      >
        <path
          d="M4 2.5 19 12l-6.6 1.3L9.6 20 4 2.5Z"
          fill="currentColor"
          className={VARIANTS[variant].arrow}
          stroke="#0a0a0a"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      <span
        data-testid="stage-cursor-label"
        className={`absolute left-5 top-5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight shadow ${VARIANTS[variant].label}`}
      >
        {authorName}
      </span>
    </div>
  );
}
