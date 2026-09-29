/**
 * `dial` — a scene-mechanics kind (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`, batch A).
 *
 * Ports `DialBeat` (`itera-cenas-a1f3/_src/src/mechanics/DialBeat.tsx`). One
 * knob, one CSS property: dragging the slider restyles `target_id` live —
 * `${property}: ${value}${unit}` on the page element — and the beat settles
 * once the value has held inside `target` for a moment. No submit; silent;
 * the learner cannot fail (a value outside `target` simply keeps the slider
 * live).
 *
 * ⚠️ Mirrors `@iterahq/activity-spec` read shape locally (`DialSpec` in
 * `../specs.js`) — the spec is not released yet; see the note at the top of
 * that section in `specs.ts`.
 */
import type { CSSProperties } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Sliders } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { DialSpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { SceneBrowserBar } from './scene/SceneBrowserBar.js';
import { ScenePageElement } from './scene/ScenePageElement.js';
import { SCENE_PAGE_BACKGROUND } from './scene/sceneTheme.js';
import { useGestureSettle } from './scene/useGestureSettle.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
import { cssPropertyToReact } from './scene/cssPropertyToReact.js';

export function DialActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as DialSpec;
  const copy = useSceneText(spec);
  const elements = spec?.page?.elements ?? [];
  const target = elements.find((el) => el.id === spec?.target_id) ?? elements[0];
  const gate = useSceneGate(activity, onComplete);
  const { record, open, solved } = gate;
  const [value, setValue] = useState(spec?.start ?? 0);

  const inRange = value >= (spec?.target?.[0] ?? 0) && value <= (spec?.target?.[1] ?? 0);
  useGestureSettle(inRange && !solved, useCallback(() => open({ value }), [open, value]));

  const style = useMemo<CSSProperties>(
    () => ({ [cssPropertyToReact(spec?.property ?? 'font-size')]: `${value}${spec?.unit ?? ''}` }) as CSSProperties,
    [spec?.property, spec?.unit, value],
  );

  if (!target) return null;

  return (
    <SceneFrame
      kind="dial"
      icon={Sliders}
      label={t('activity.dial')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      stamp={copy.stamp}
      solved={solved}
    >
      <div
        className="rounded-xl overflow-hidden border border-black/10"
        style={{ background: SCENE_PAGE_BACKGROUND }}
        data-testid="dial-stage"
      >
        <SceneBrowserBar url={copy.url} />
        <div className="flex flex-col gap-4 p-7 min-h-[160px] items-start">
          {elements.map((el) =>
            el.id === target.id ? (
              <span key={el.id} style={style}>
                <ScenePageElement element={el} />
              </span>
            ) : (
              <ScenePageElement key={el.id} element={el} />
            ),
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          role="slider"
          aria-label={t('activity.dial')}
          data-testid="dial-slider"
          min={spec?.min}
          max={spec?.max}
          step={spec?.step ?? 1}
          value={value}
          disabled={solved}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            setValue(next);
            record('value_set', { value: next });
          }}
          className="flex-1 accent-evergreen"
        />
        <span className="font-mono text-sm text-muted-foreground w-16 text-right" data-testid="dial-value">
          {value}
          {spec?.unit}
        </span>
      </div>
    </SceneFrame>
  );
}

