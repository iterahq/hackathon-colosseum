/**
 * `selector` — a scene-mechanics kind (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`, batch A).
 *
 * Ports `SelectorBeat` (`itera-cenas-a1f3/_src/src/mechanics/SelectorBeat.tsx`).
 * Tap a selector chip; the elements it names light up with `rule`. The beat
 * settles the moment a chip's match set equals `targets` EXACTLY — no submit.
 * A chip that matches too much, too little, or the wrong elements just lights
 * up the wrong things and shows `reaction`-style feedback via a hint; the
 * learner cannot fail and may try every chip — also after the gate opens,
 * which fires once. Each element shows as its markup (`<li class="x">`), with
 * an `id` attribute only when a chip selects by it, and the rule being aimed
 * — `selector { property: value; }` — follows the chip picked.
 *
 * Matching is `matchSelector` / `selectorHitsExactly` from
 * `@iterahq/activity-spec/runtime`; the read shape is `SelectorSpec` in
 * `../specs.js`.
 */
import { useCallback, useMemo, useState } from 'react';
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
import { useWrongHint } from './scene/useWrongHint.js';
import { WrongHint } from './scene/WrongHint.js';
import { SceneCssRule } from './scene/SceneCssRule.js';
import { TOUCH_SURFACE } from '../components/touchSurface.js';

/** Stage text: dark on the pastel page, never the app's muted grey. */
const STAGE_INK = '#3B1F2B';

/** `maracuja` → `Maracuja`: an element's id read as the text it shows. */
export function selectorElementLabel(id: string): string {
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Ids a chip selects by (`#saudacao`, `p#saudacao`): those are real `id` attributes on the page. */
export function selectorReferencedIds(options: string[]): Set<string> {
  const ids = new Set<string>();
  for (const option of options) for (const match of option.matchAll(/#([\w-]+)/g)) ids.add(match[1]);
  return ids;
}

export function SelectorActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as SelectorSpec;
  const copy = useSceneText({
    guide: spec?.guide,
    prompt: spec?.prompt,
    reaction: spec?.reaction,
    stamp: spec?.stamp,
    page: { elements: [] },
  });
  const elements = spec?.elements ?? [];
  const gate = useSceneGate(activity, onComplete);
  const { record, open, solved } = gate;
  // A `done` activity opens on the chip that solved it, so the page and the rule show the answer.
  const [picked, setPicked] = useState<string | null>(() =>
    activity.status === 'done'
      ? ((spec?.options ?? []).find((option) => selectorHitsExactly(option, elements, spec?.targets ?? [])) ?? null)
      : null,
  );
  const idAttributes = useMemo(() => selectorReferencedIds(spec?.options ?? []), [spec?.options]);
  const { showHint, clearHint, hintProps } = useWrongHint();

  const matched = picked ? new Set(matchSelector(picked, elements)) : new Set<string>();

  const pick = useCallback(
    (option: string) => {
      setPicked(option);
      record('option_picked', { option });
      if (selectorHitsExactly(option, elements, spec?.targets ?? [])) {
        clearHint();
        open({ option });
        return;
      }
      record('wrong_try', { option });
      showHint(t('activity.selector.wrongHint'));
    },
    [clearHint, elements, open, record, showHint, spec?.targets, t],
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
        style={{ background: SCENE_PAGE_BACKGROUND, color: STAGE_INK }}
        data-testid="selector-stage"
      >
        {elements.map((el) => {
          const lit = matched.has(el.id);
          const attrs = [
            idAttributes.has(el.id) ? ` id="${el.id}"` : '',
            el.classes.length > 0 ? ` class="${el.classes.join(' ')}"` : '',
          ].join('');
          return (
            <span
              key={el.id}
              data-testid={`selector-element-${el.id}`}
              data-lit={lit ? 'true' : 'false'}
              className={`rounded-md px-3 py-1.5 text-sm border bg-white ${lit ? 'border-[#DB2777]/60' : 'border-black/15'}`}
              style={lit ? { [cssPropertyToReact(spec.rule.property)]: spec.rule.value } : undefined}
            >
              <span className="font-mono text-xs font-semibold opacity-80">
                &lt;{el.tag}
                {attrs}&gt;
              </span>{' '}
              <span className="font-medium">{selectorElementLabel(el.id)}</span>
            </span>
          );
        })}
      </div>
      <div className={`flex flex-wrap gap-2 ${TOUCH_SURFACE}`} role="group" aria-label={t('activity.selector')}>
        {(spec?.options ?? []).map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`selector-option-${option}`}
            onClick={() => pick(option)}
            aria-pressed={picked === option}
            className={`coarse:relative coarse:before:absolute coarse:before:-inset-y-1.5 coarse:before:-inset-x-0.5 rounded-full border px-4 py-1.5 text-sm font-mono transition-colors ${
              picked === option
                ? 'border-evergreen bg-evergreen-soft text-evergreen-hi'
                : 'border-border hover:bg-muted'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <SceneCssRule
        selector={picked}
        property={spec?.rule?.property ?? ''}
        value={spec?.rule?.value ?? ''}
        testId="selector-rule"
      />
      {!solved && <WrongHint {...hintProps} />}
    </SceneFrame>
  );
}
