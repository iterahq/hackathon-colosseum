/**
 * `timeline` — a scene-mechanics kind (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`, batch A).
 *
 * Ports `TimelineBeat` (`itera-cenas-a1f3/_src/src/mechanics/TimelineBeat.tsx`).
 * A scrubber steps through `steps[]`; each step shows a frame — a `page` or a
 * block of `code` lines, never both — plus a caption. Ungraded, like `xray` /
 * `inspect`: there is nothing to get wrong, and the beat completes once every
 * step has been visited at least once.
 *
 * ⚠️ Mirrors `@iterahq/activity-spec` read shape locally (`TimelineSpec` in
 * `../specs.js`) — see the release-gate note at the top of that section.
 */
import { useCallback, useRef, useState } from 'react';
import { History } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import { localizedText } from '../internal/localizedText.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { SceneLocalizedText, TimelineSpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { SceneBrowserBar } from './scene/SceneBrowserBar.js';
import { ScenePageElement } from './scene/ScenePageElement.js';
import { SCENE_CODE_BACKGROUND, SCENE_PAGE_BACKGROUND } from './scene/sceneTheme.js';
import { useSceneGate } from './scene/useSceneGate.js';

export function TimelineActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t, locale } = useActivityI18n();
  const spec = activity.spec as unknown as TimelineSpec;
  const steps = spec?.steps ?? [];
  const gate = useSceneGate(activity, onComplete);
  const { record, open, solved } = gate;
  const [index, setIndex] = useState(0);
  // A ref, not state: `open()` calls the host's `onComplete`, which must not run
  // inside a state updater (React runs those during render, so the parent would
  // set state while this child renders).
  const visitedRef = useRef<Set<number>>(new Set([0]));

  const goTo = useCallback(
    (next: number) => {
      setIndex(next);
      if (solved) return;
      record('step_visited', { index: next });
      const visited = visitedRef.current;
      if (visited.has(next)) return;
      visited.add(next);
      if (visited.size === steps.length) open({ steps: visited.size });
    },
    [open, record, solved, steps.length],
  );

  const step = steps[index];
  const text = (value: SceneLocalizedText | undefined) => localizedText(value ?? '', locale);

  return (
    <SceneFrame
      kind="timeline"
      icon={History}
      label={t('activity.timeline')}
      guideName={spec?.guide ? text(spec.guide.name) : undefined}
      prompt={text(spec?.prompt)}
      reaction={text(spec?.reaction)}
      stamp={text(spec?.stamp)}
      solved={solved}
    >
      <div className="flex flex-col gap-3" data-testid="timeline-stage">
        {step?.frame.type === 'page' ? (
          <div
            className="rounded-xl overflow-hidden border border-black/10 min-h-[160px]"
            style={{ background: SCENE_PAGE_BACKGROUND }}
          >
            <SceneBrowserBar url="site" />
            <div className="flex flex-col gap-3 p-6">
              {step.frame.page.elements.map((el) => (
                <ScenePageElement key={el.id} element={el} />
              ))}
            </div>
          </div>
        ) : (
          <div
            className="rounded-xl border border-white/10 p-5 flex flex-col gap-1.5 min-h-[160px] justify-center"
            style={{ background: SCENE_CODE_BACKGROUND }}
          >
            {step?.frame.type === 'code' &&
              step.frame.lines.map((line, i) => (
                <span key={i} className="font-mono text-[13px] text-white/80" style={{ whiteSpace: 'pre' }}>
                  {line}
                </span>
              ))}
          </div>
        )}
        <p className="text-sm text-muted-foreground" data-testid="timeline-note">
          <span className="font-semibold text-foreground">{step && text(step.label)}</span> — {step && text(step.note)}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{text(spec?.axis)}</span>
          <input
            type="range"
            aria-label={text(spec?.axis)}
            data-testid="timeline-scrubber"
            min={0}
            max={Math.max(0, steps.length - 1)}
            step={1}
            value={index}
            onChange={(event) => goTo(Number(event.currentTarget.value))}
            className="flex-1 accent-evergreen"
          />
          <span className="font-mono text-xs text-muted-foreground w-14 text-right" data-testid="timeline-index">
            {index + 1}/{steps.length}
          </span>
        </div>
      </div>
    </SceneFrame>
  );
}
