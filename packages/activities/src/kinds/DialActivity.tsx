/**
 * `dial` — a scene-mechanics kind (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`, batch A).
 *
 * Ports `DialBeat` (`itera-cenas-a1f3/_src/src/mechanics/DialBeat.tsx`). One
 * knob, one CSS property: dragging the slider restyles `target_id` live —
 * `${property}: ${value}${unit}` on the page element — and the beat settles
 * once the value has held inside `target` for a moment. No submit; silent;
 * the learner cannot fail (a value outside `target` simply keeps the slider
 * live). Only a learner's move settles it: a `start` already inside `target`
 * waits for a gesture. The slider stays live after the gate opens, and the
 * rule it writes — `tag { property: value; }` — is shown under the page.
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
import { SceneCssRule } from './scene/SceneCssRule.js';
import { TOUCH_SURFACE } from '../components/touchSurface.js';

/**
 * Where the slider sits when the activity opens. A `done` activity opens on a
 * value inside `target` — the state the learner left it in — instead of the
 * untouched `start`: `start` itself when it already is, else the step closest
 * to the middle of the range.
 */
export function dialInitialValue(spec: DialSpec | undefined, done: boolean): number {
  const start = spec?.start ?? 0;
  const [low, high] = spec?.target ?? [start, start];
  if (!done || (start >= low && start <= high)) return start;
  const step = spec?.step && spec.step > 0 ? spec.step : 1;
  const base = spec?.min ?? 0;
  const snapped = base + Math.round(((low + high) / 2 - base) / step) * step;
  return Math.min(high, Math.max(low, snapped));
}

export function DialActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as DialSpec;
  const copy = useSceneText(spec);
  const elements = spec?.page?.elements ?? [];
  const target = elements.find((el) => el.id === spec?.target_id) ?? elements[0];
  const gate = useSceneGate(activity, onComplete);
  const { record, open, solved } = gate;
  const [value, setValue] = useState(() => dialInitialValue(spec, activity.status === 'done'));
  const [moved, setMoved] = useState(false);

  const inRange = value >= (spec?.target?.[0] ?? 0) && value <= (spec?.target?.[1] ?? 0);
  useGestureSettle(inRange && moved && !solved, useCallback(() => open({ value }), [open, value]));

  const style = useMemo<CSSProperties>(
    () => ({ [cssPropertyToReact(spec?.property ?? 'font-size')]: `${value}${spec?.unit ?? ''}` }) as CSSProperties,
    [spec?.property, spec?.unit, value],
  );

  if (!target) return null;
  const valueText = `${value}${spec?.unit ?? ''}`;

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
        <div className="flex flex-col gap-4 p-7 min-h-[160px] max-sm:min-h-[112px] max-sm:p-5 short:min-h-[112px] short:p-5 items-start">
          {elements.map((el) =>
            el.id === target.id ? (
              <ScenePageElement key={el.id} element={el} style={style} />
            ) : (
              <ScenePageElement key={el.id} element={el} />
            ),
          )}
        </div>
      </div>
      <div className={`flex items-center gap-3 ${TOUCH_SURFACE}`}>
        <input
          type="range"
          role="slider"
          aria-label={t('activity.dial')}
          data-testid="dial-slider"
          min={spec?.min}
          max={spec?.max}
          step={spec?.step ?? 1}
          value={value}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            setValue(next);
            setMoved(true);
            record('value_set', { value: next });
          }}
          className="flex-1 accent-evergreen"
        />
        <span className="font-mono text-sm text-muted-foreground w-16 text-right" data-testid="dial-value">
          {valueText}
        </span>
      </div>
      {spec?.target_hint ? (
        <p className="text-sm text-muted-foreground -mt-2" data-testid="dial-target-hint">
          {copy.text(spec.target_hint)}
        </p>
      ) : null}
      <SceneCssRule selector={target.tag} property={spec?.property ?? 'font-size'} value={valueText} testId="dial-rule" />
    </SceneFrame>
  );
}

