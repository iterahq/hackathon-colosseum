/**
 * `intercept` — a scene-mechanics kind (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`, batch B).
 *
 * Ports `InterceptBeat`
 * (`itera-cenas-a1f3/_src/src/mechanics/InterceptBeat.tsx`). A packet loops
 * through `path` forever; tap the node named by `answer` to catch it. A wrong
 * tap shows `wrong_hint` and the packet keeps looping — the beat completes the
 * instant the right node is tapped, no matter where the packet was.
 *
 * `hopMs` (the labs prototype's loop speed) is fixed rather than authored: the
 * spec has no field for it, and a fixed, generous pace keeps the loop legible
 * for every learner regardless of the author's taste.
 *
 * ⚠️ Mirrors `@iterahq/activity-spec` read shape locally (`InterceptSpec` in
 * `../specs.js`) — see the release-gate note at the top of that section.
 */
import { useEffect, useMemo, useState } from 'react';
import { Radar } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useActivityI18n } from '../context.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { InterceptSpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
import { WrongHint } from './scene/WrongHint.js';

const HOP_MS = 1400;

export function InterceptActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as InterceptSpec;
  const copy = useSceneText(spec);
  const gate = useSceneGate(activity, onComplete);
  const { record, open, solved } = gate;
  const reducedMotion = useReducedMotion();

  const [hop, setHop] = useState(0);
  const [shaking, setShaking] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const path = spec?.path ?? [];
  const byId = useMemo(() => new Map((spec?.nodes ?? []).map((n) => [n.id, n])), [spec?.nodes]);
  const current = path.length > 0 ? path[hop % path.length] : undefined;
  const activeId = solved ? spec?.answer : current;
  const node = activeId ? byId.get(activeId) : undefined;

  useEffect(() => {
    if (solved || path.length === 0 || reducedMotion) return;
    const timer = window.setInterval(() => setHop((h) => h + 1), HOP_MS);
    return () => window.clearInterval(timer);
  }, [solved, path.length, reducedMotion]);

  const tap = (id: string) => {
    if (solved) return;
    if (id !== spec?.answer) {
      setShaking(id);
      window.setTimeout(() => setShaking(null), 500);
      record('wrong_try', { node_id: id });
      setHint(copy.text(spec?.wrong_hint));
      return;
    }
    setHint(null);
    open({ node_id: id });
  };

  return (
    <SceneFrame
      kind="intercept"
      icon={Radar}
      label={t('activity.intercept')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      stamp={copy.stamp}
      solved={solved}
    >
      <div
        className="relative w-full aspect-[4/3] sm:aspect-[16/9] max-h-[440px] rounded-2xl overflow-hidden border border-border bg-[#0B0F14] select-none"
        data-testid="intercept-board"
      >
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {(spec?.edges ?? []).map(([a, b]) => {
            const na = byId.get(a);
            const nb = byId.get(b);
            if (!na || !nb) return null;
            return (
              <line
                key={`${a}-${b}`}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                stroke="rgba(255,255,255,.14)"
                strokeWidth={0.4}
                vectorEffect="non-scaling-stroke"
                strokeDasharray="1 1"
              />
            );
          })}
        </svg>
        {(spec?.nodes ?? []).map((n) => (
          <motion.button
            key={n.id}
            type="button"
            data-testid={`intercept-node-${n.id}`}
            animate={shaking === n.id && !reducedMotion ? { x: [0, -6, 6, -4, 4, 0] } : solved && n.id === spec?.answer ? { scale: 1.08 } : {}}
            onClick={() => tap(n.id)}
            disabled={solved}
            className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 rounded-xl border px-2.5 py-2 min-w-[72px] text-center ${solved && n.id === spec?.answer ? 'border-evergreen bg-evergreen/15' : 'border-white/15 bg-[#141210]/90 hover:border-[#C084FC]'}`}
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
          >
            <span className="text-2xl leading-none">{n.icon}</span>
            <span className="uppercase text-sm leading-none text-white">{copy.text(n.label)}</span>
            {n.sub && <span className="text-[10px] text-white/45 leading-tight">{copy.text(n.sub)}</span>}
          </motion.button>
        ))}
        {node && (
          <motion.div
            animate={{ left: `${node.x}%`, top: `${node.y - 14}%` }}
            transition={{ duration: solved || reducedMotion ? 0.2 : (HOP_MS / 1000) * 0.6, ease: 'easeInOut' }}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          >
            <span
              className="inline-block rounded-full bg-[#C084FC] text-[#0A0908] font-mono text-xs px-3 py-1 whitespace-nowrap"
              data-testid="intercept-packet"
            >
              {spec?.packet_at?.[activeId ?? ''] ?? spec?.packet}
            </span>
          </motion.div>
        )}
      </div>
      {!solved && <WrongHint text={hint} />}
    </SceneFrame>
  );
}
