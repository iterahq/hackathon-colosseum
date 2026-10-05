/**
 * `press` — a scene-mechanics kind (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`, batch A).
 *
 * Ports `PressBeat` (`itera-cenas-a1f3/_src/src/mechanics/PressBeat.tsx`). The
 * button on the page is dead. Pick the option that wires it correctly — a
 * wrong pick shows `wrong_hint` and the button stays dead — then press it
 * `goal` times to see the effect run: a counter going up, a CSS class
 * toggling, or text appending to a page element. A fixed two-gesture pattern
 * (choose, then press) is still ONE behaviour, not two kinds: the second
 * gesture cannot even start until the first one lands.
 *
 * ⚠️ Mirrors `@iterahq/activity-spec` read shape locally (`PressSpec` in
 * `../specs.js`) — see the release-gate note at the top of that section.
 */
import { useCallback, useState } from 'react';
import { MousePointerClick } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import { localizedText } from '../internal/localizedText.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { PressSpec } from '../specs.js';
import { SceneCodeLine } from './scene/SceneCodeLine.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { ScenePageElement } from './scene/ScenePageElement.js';
import { SCENE_CODE_BACKGROUND, SCENE_PAGE_BACKGROUND } from './scene/sceneTheme.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useWrongHint } from './scene/useWrongHint.js';
import { WrongHint } from './scene/WrongHint.js';
import { TOUCH_SURFACE } from '../components/touchSurface.js';

export function PressActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t, locale } = useActivityI18n();
  const spec = activity.spec as unknown as PressSpec;
  const gate = useSceneGate(activity, onComplete);
  const { record, open, solved } = gate;
  const [wired, setWired] = useState(false);
  const { showHint, clearHint, hintProps } = useWrongHint();
  const [count, setCount] = useState(0);
  const [toggled, setToggled] = useState(false);
  const [appended, setAppended] = useState('');

  const choose = useCallback(
    (optionId: string) => {
      if (solved || wired) return;
      if (optionId === spec?.correct) {
        setWired(true);
        clearHint();
        return;
      }
      record('wrong_try', { option_id: optionId });
      showHint(localizedText(spec?.wrong_hint ?? '', locale));
    },
    [clearHint, locale, record, showHint, solved, spec?.correct, spec?.wrong_hint, wired],
  );

  const press = useCallback(() => {
    if (solved || !wired) return;
    const next = count + 1;
    setCount(next);
    record('pressed', { count: next });
    if (spec?.effect.type === 'toggle_class') setToggled((v) => !v);
    if (spec?.effect.type === 'append_text') setAppended((prev) => `${prev}${localizedText(spec.effect.type === 'append_text' ? spec.effect.text : '', locale)}`);
    if (next >= (spec?.goal ?? 1)) open({ presses: next });
  }, [count, locale, open, record, solved, spec?.effect, spec?.goal, wired]);

  const effect = spec?.effect;
  const target = effect?.type !== 'counter' ? spec?.page?.elements.find((el) => el.id === effect?.target_id) : undefined;

  return (
    <SceneFrame
      kind="press"
      icon={MousePointerClick}
      label={t('activity.press')}
      guideName={spec?.guide ? localizedText(spec.guide.name, locale) : undefined}
      prompt={localizedText(spec?.prompt ?? '', locale)}
      reaction={localizedText(spec?.reaction ?? '', locale)}
      stamp={localizedText(spec?.stamp ?? '', locale)}
      solved={solved}
    >
      <div
        className="rounded-xl border border-white/10 p-5 flex flex-col gap-1.5"
        style={{ background: SCENE_CODE_BACKGROUND }}
        data-testid="press-editor"
      >
        {(spec?.before ?? []).map((line, i) => (
          <span key={i} className="font-mono text-[13px] text-white/60" style={{ whiteSpace: 'pre' }}>
            {line}
          </span>
        ))}
        {wired && spec && (
          <SceneCodeLine element={{ id: 'press-handler', tag: 'span', text: spec.options.find((o) => o.id === spec.correct)?.code ?? '', name: '' }} />
        )}
      </div>
      <div className={`flex flex-col gap-2 ${TOUCH_SURFACE}`} role="radiogroup" aria-label={t('activity.press')}>
        {(spec?.options ?? []).map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={wired && option.id === spec.correct}
            data-testid={`press-option-${option.id}`}
            onClick={() => choose(option.id)}
            disabled={solved || wired}
            className="text-left rounded-lg border border-border px-4 py-2 text-sm font-mono hover:bg-muted disabled:opacity-60"
          >
            {localizedText(option.label, locale)}
          </button>
        ))}
      </div>
      {!solved && <WrongHint {...hintProps} />}
      <div
        className={`rounded-xl overflow-hidden border border-black/10 p-6 flex flex-col items-start gap-3 min-h-[120px] ${TOUCH_SURFACE}`}
        style={{ background: SCENE_PAGE_BACKGROUND }}
        data-testid="press-page"
      >
        {target && (
          <span
            data-testid="press-target"
            data-toggled={effect?.type === 'toggle_class' ? String(toggled) : undefined}
            className={
              effect?.type === 'toggle_class'
                ? [
                    // The author's class name has no stylesheet inside the scene, so the
                    // toggled state carries its own built-in highlight; the class rides
                    // along for hosts that do style it.
                    'inline-block rounded-md px-2 py-1 transition-colors',
                    toggled ? `bg-amber-200 outline outline-2 outline-amber-500 ${effect.class_name}` : '',
                  ]
                    .join(' ')
                    .trim()
                : undefined
            }
          >
            <ScenePageElement element={target} text={effect?.type === 'append_text' ? `${target.text}${appended}` : undefined} />
          </span>
        )}
        <button
          type="button"
          data-testid="press-button"
          onClick={press}
          disabled={solved || !wired}
          className="inline-flex items-center gap-2 rounded-full bg-[#DB2777] px-5 py-2.5 text-sm font-bold text-white shadow-[0_6px_0_#9D174D] disabled:opacity-40"
        >
          {localizedText(spec?.button ?? '', locale)}
        </button>
        {effect?.type === 'counter' && (
          <span className="font-mono text-sm text-muted-foreground" data-testid="press-count">
            {count}
          </span>
        )}
      </div>
    </SceneFrame>
  );
}
