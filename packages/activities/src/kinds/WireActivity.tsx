/**
 * `wire` — a scene-mechanics kind (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`, batch B).
 *
 * Ports `WireBeat` (`itera-cenas-a1f3/_src/src/mechanics/WireBeat.tsx`). Pick a
 * left end, then tap the right end it belongs to — tap-tap, not drag, so the
 * same gesture works with a mouse or a finger. A wrong pair shows `wrong_hint`
 * and never sticks; the beat completes once every left end is wired.
 *
 * ⚠️ Mirrors `@iterahq/activity-spec` read shape locally (`WireSpec` in
 * `../specs.js`) — see the release-gate note at the top of that section.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { Cable } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useActivityI18n } from '../context.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { WireSpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
import { useWrongHint } from './scene/useWrongHint.js';
import { WrongHint } from './scene/WrongHint.js';
import { TOUCH_SURFACE } from '../components/touchSurface.js';

interface Point {
  x: number;
  y: number;
}

export function WireActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as WireSpec;
  const copy = useSceneText(spec);
  const gate = useSceneGate(activity, onComplete);
  const { record, open, solved, step } = gate;
  const reducedMotion = useReducedMotion();

  // A `done` activity opens fully wired: review shows the answer, not an empty board.
  const [wires, setWires] = useState<Record<string, string>>(() =>
    activity.status === 'done' ? Object.fromEntries((spec?.pairs ?? []).map((p) => [p.left_id, p.right_id])) : {},
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [shaking, setShaking] = useState<string | null>(null);
  const { showHint, clearHint, hintProps } = useWrongHint();

  const boardRef = useRef<HTMLDivElement>(null);
  const ends = useRef(new Map<string, HTMLElement>());
  // Anchors are read during render, so the first paint has no ends yet: one
  // re-render after mount picks them up, a new wire re-reads them, and a
  // resize re-reads them — the same triggers `useConnectorPath` uses. Bumping
  // on EVERY render would loop forever.
  const [, forceMeasure] = useState(0);
  useLayoutEffect(() => {
    const measure = () => forceMeasure((n) => n + 1);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [wires]);

  const left = spec?.left ?? [];
  const right = spec?.right ?? [];
  const pairs = spec?.pairs ?? [];
  const answerFor = new Map(pairs.map((p) => [p.left_id, p.right_id]));

  const anchor = (key: string, side: 'left' | 'right'): Point | null => {
    const box = boardRef.current?.getBoundingClientRect();
    const node = ends.current.get(key);
    if (!box || !node) return null;
    const r = node.getBoundingClientRect();
    return { x: (side === 'left' ? r.right : r.left) - box.left, y: r.top + r.height / 2 - box.top };
  };

  const pick = (leftId: string) => {
    if (solved || wires[leftId]) return;
    if (picked !== leftId) step('pick');
    setPicked((current) => (current === leftId ? null : leftId));
  };

  const connect = (rightId: string) => {
    if (!picked || solved) return;
    const leftId = picked;
    if (answerFor.get(leftId) !== rightId) {
      setShaking(rightId);
      window.setTimeout(() => setShaking(null), 500);
      record('wrong_try', { left_id: leftId, right_id: rightId });
      showHint(copy.text(spec?.wrong_hint));
      step('wrong');
      setPicked(null);
      return;
    }
    const next = { ...wires, [leftId]: rightId };
    setWires(next);
    setPicked(null);
    clearHint();
    record('wire_connected', { left_id: leftId, right_id: rightId });
    if (Object.keys(next).length === left.length) open({ pairs: Object.keys(next).length });
    step('connect');
  };

  return (
    <SceneFrame
      kind="wire"
      icon={Cable}
      label={t('activity.wire')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      solved={solved}
    >
      <div
        ref={boardRef}
        className={`relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 sm:gap-8 ${TOUCH_SURFACE}`}
        data-testid="wire-board"
      >
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] tracking-[.3em] uppercase text-muted-foreground mb-1">
            {copy.text(spec?.left_title)}
          </span>
          {left.map((end) => {
            const done = Boolean(wires[end.id]);
            const isPicked = picked === end.id;
            return (
              <button
                key={end.id}
                type="button"
                ref={(node) => {
                  if (node) ends.current.set(`L:${end.id}`, node);
                }}
                data-testid={`wire-left-${end.id}`}
                data-wired={done ? 'true' : 'false'}
                disabled={solved || done}
                onClick={() => pick(end.id)}
                aria-pressed={isPicked}
                className={`text-left rounded-xl border px-3 sm:px-4 py-3 transition-colors ${done ? 'border-evergreen/60 bg-evergreen/10' : isPicked ? 'border-evergreen bg-evergreen/15' : 'border-border bg-card hover:border-foreground/30'}`}
              >
                <span className="block break-words text-[15px]">{copy.text(end.label)}</span>
                {end.sub && <span className="block text-xs text-muted-foreground">{copy.text(end.sub)}</span>}
              </button>
            );
          })}
        </div>
        <div className="w-4 sm:w-16" />
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] tracking-[.3em] uppercase text-muted-foreground mb-1">
            {copy.text(spec?.right_title)}
          </span>
          {right.map((end) => {
            const done = Object.values(wires).includes(end.id);
            return (
              <motion.button
                key={end.id}
                type="button"
                ref={(node) => {
                  if (node) ends.current.set(`R:${end.id}`, node);
                }}
                data-testid={`wire-right-${end.id}`}
                animate={shaking === end.id && !reducedMotion ? { x: [0, -6, 6, -4, 4, 0] } : {}}
                onClick={() => connect(end.id)}
                disabled={solved}
                className={`text-left rounded-xl border px-3 sm:px-4 py-3 transition-colors ${done ? 'border-evergreen/60 bg-evergreen/10' : picked ? 'border-evergreen/40 bg-card hover:bg-evergreen/10' : 'border-border bg-card'}`}
              >
                <span className="block break-words text-[15px]">{copy.text(end.label)}</span>
                {end.sub && <span className="block text-xs text-muted-foreground">{copy.text(end.sub)}</span>}
              </motion.button>
            );
          })}
        </div>
        <svg className="pointer-events-none absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
          <AnimatePresence>
            {Object.entries(wires).map(([leftId, rightId]) => {
              const a = anchor(`L:${leftId}`, 'left');
              const b = anchor(`R:${rightId}`, 'right');
              if (!a || !b) return null;
              const bend = Math.max(30, (b.x - a.x) / 2);
              return (
                <motion.path
                  key={leftId}
                  d={`M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`}
                  fill="none"
                  stroke="#3FD17F"
                  strokeWidth={3}
                  strokeLinecap="round"
                  initial={reducedMotion ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.35 }}
                />
              );
            })}
          </AnimatePresence>
        </svg>
      </div>
      {!solved && <WrongHint {...hintProps} />}
    </SceneFrame>
  );
}
