/**
 * `arrange` — a scene-mechanics kind (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`, batch A).
 *
 * Ports the SCENE `OrderBeat` (`itera-cenas-a1f3/_src/src/mechanics/OrderBeat.tsx`
 * — not the existing `order` kind). Reorder `items[]` until they match
 * `correct[]`; the beat settles on the right order by itself, no submit. That
 * is what makes it a different kind from `order`, whose grading and
 * completion both happen on an explicit submit.
 *
 * Reordering here is button-driven (move up / move down) rather than a
 * pointer drag, for the same reason `OrderActivity` offers both: a keyboard
 * and a touch user need a way in that does not depend on drag-and-drop
 * geometry, and a settle-on-match kind has no submit moment to also expose a
 * drag affordance around.
 *
 * Only a learner's move settles it: a `start` that already equals `correct`
 * waits for a gesture. A `done` activity opens in the correct order.
 *
 * ⚠️ Mirrors `@iterahq/activity-spec` read shape locally (`ArrangeSpec` in
 * `../specs.js`) — see the release-gate note at the top of that section.
 */
import { useCallback, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ListOrdered } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import { localizedText } from '../internal/localizedText.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { ArrangeSpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { useGestureSettle } from './scene/useGestureSettle.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { TOUCH_SURFACE } from '../components/touchSurface.js';

export function ArrangeActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t, locale } = useActivityI18n();
  const spec = activity.spec as unknown as ArrangeSpec;
  const itemsById = useMemo(() => new Map((spec?.items ?? []).map((item) => [item.id, item])), [spec?.items]);
  const gate = useSceneGate(activity, onComplete);
  const { record, open, solved, step } = gate;
  const [order, setOrder] = useState<string[]>(() =>
    (activity.status === 'done' ? spec?.correct : spec?.start) ?? [],
  );
  const [moved, setMoved] = useState(false);

  const isCorrect = order.length > 0 && order.every((id, i) => id === spec?.correct?.[i]);
  useGestureSettle(isCorrect && moved && !solved, useCallback(() => open({ order }), [open, order]));

  const move = useCallback(
    (index: number, delta: number) => {
      if (solved) return;
      const target = index + delta;
      if (target < 0 || target >= order.length) return;
      const next = [...order];
      [next[index], next[target]] = [next[target], next[index]];
      setOrder(next);
      setMoved(true);
      record('order_changed', { order: next });
      // The completing move is sounded by the gate, not twice.
      if (!next.every((id, i) => id === spec?.correct?.[i])) step('drop');
    },
    [order, record, solved, step, spec?.correct],
  );

  const codeStyle = spec?.item_style === 'code';

  return (
    <SceneFrame
      kind="arrange"
      icon={ListOrdered}
      label={t('activity.arrange')}
      guideName={undefined}
      prompt={localizedText(spec?.prompt ?? '', locale)}
      reaction={localizedText(spec?.reaction ?? '', locale)}
      solved={solved}
    >
      <ol className={`flex flex-col gap-2 ${TOUCH_SURFACE}`} data-testid="arrange-stage">
        {order.map((id, index) => {
          const item = itemsById.get(id);
          if (!item) return null;
          return (
            <li
              key={id}
              data-testid={`arrange-item-${id}`}
              className={`flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 ${
                codeStyle ? 'font-mono text-sm bg-[#0E0D0B] text-white/90 border-white/10' : 'bg-card'
              }`}
            >
              <span className="flex flex-col">
                <span>{localizedText(item.label, locale)}</span>
                {item.sub ? (
                  <span className="text-xs text-muted-foreground" data-testid={`arrange-sub-${id}`}>
                    {localizedText(item.sub, locale)}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={t('activity.moveUp')}
                  data-testid={`arrange-up-${id}`}
                  onClick={() => move(index, -1)}
                  disabled={solved || index === 0}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-30 coarse:relative coarse:before:absolute coarse:before:-inset-y-[7px] coarse:before:-left-3 coarse:before:-right-0.5"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label={t('activity.moveDown')}
                  data-testid={`arrange-down-${id}`}
                  onClick={() => move(index, 1)}
                  disabled={solved || index === order.length - 1}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-30 coarse:relative coarse:before:absolute coarse:before:-inset-y-[7px] coarse:before:-left-0.5 coarse:before:-right-3"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </SceneFrame>
  );
}
