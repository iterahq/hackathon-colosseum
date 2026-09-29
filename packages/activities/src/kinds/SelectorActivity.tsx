/**
 * `selector` — a scene-mechanics kind (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`, batch A).
 *
 * Ports `SelectorBeat` (`itera-cenas-a1f3/_src/src/mechanics/SelectorBeat.tsx`).
 * Tap a selector chip; the elements it names light up with `rule`. The beat
 * settles the moment a chip's match set equals `targets` EXACTLY — no submit.
 * A chip that matches too much, too little, or the wrong elements just lights
 * up the wrong things and shows `reaction`-style feedback via a hint; the
 * learner cannot fail and may try every chip.
 *
 * Matching is `matchSelector` / `selectorHitsExactly` from
 * `@iterahq/activity-spec/runtime`; the read shape is `SelectorSpec` in
 * `../specs.js`.
 */
import { useCallback, useState } from 'react';
import { matchSelector, selectorHitsExactly } from '@iterahq/activity-spec/runtime';
import { MousePointerSquareDashed } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { SelectorSpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { SCENE_PAGE_BACKGROUND } from './scene/sceneTheme.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
import { cssPropertyToReact } from './scene/cssPropertyToReact.js';
import { WrongHint } from './scene/WrongHint.js';

export function SelectorActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as SelectorSpec;
  const copy = useSceneText({
    guide: undefined,
    prompt: spec?.prompt,
    reaction: spec?.reaction,
    stamp: spec?.stamp,
    page: { elements: [] },
  });
  const elements = spec?.elements ?? [];
  const gate = useSceneGate(activity, onComplete);
  const { record, open, solved } = gate;
  const [picked, setPicked] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const matched = picked ? new Set(matchSelector(picked, elements)) : new Set<string>();

  const pick = useCallback(
    (option: string) => {
      if (solved) return;
      setPicked(option);
      record('option_picked', { option });
      if (selectorHitsExactly(option, elements, spec?.targets ?? [])) {
        setHint(null);
        open({ option });
        return;
      }
      record('wrong_try', { option });
      setHint(t('activity.selector.wrongHint'));
    },
    [elements, open, record, solved, spec?.targets, t],
  );

  return (
    <SceneFrame
      kind="selector"
      icon={MousePointerSquareDashed}
      label={t('activity.selector')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      stamp={copy.stamp}
      solved={solved}
    >
      <div
        className="rounded-xl p-6 flex flex-wrap gap-3"
        style={{ background: SCENE_PAGE_BACKGROUND }}
        data-testid="selector-stage"
      >
        {elements.map((el) => {
          const lit = matched.has(el.id);
          return (
            <span
              key={el.id}
              data-testid={`selector-element-${el.id}`}
              data-lit={lit ? 'true' : 'false'}
              className="rounded-md px-3 py-1.5 text-sm font-mono border border-black/10 bg-white/60"
              style={lit ? { [cssPropertyToReact(spec.rule.property)]: spec.rule.value } : undefined}
            >
              &lt;{el.tag}{el.classes.length > 0 ? ` class="${el.classes.join(' ')}"` : ''}&gt; #{el.id}
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('activity.selector')}>
        {(spec?.options ?? []).map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`selector-option-${option}`}
            onClick={() => pick(option)}
            disabled={solved}
            aria-pressed={picked === option}
            className={`rounded-full border px-4 py-1.5 text-sm font-mono transition-colors ${
              picked === option
                ? 'border-evergreen bg-evergreen-soft text-evergreen-hi'
                : 'border-border hover:bg-muted'
            } disabled:opacity-60`}
          >
            {option}
          </button>
        ))}
      </div>
      {!solved && <WrongHint text={hint} />}
    </SceneFrame>
  );
}
