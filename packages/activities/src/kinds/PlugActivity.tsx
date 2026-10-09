/**
 * `plug` — a scene-mechanics kind (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`, batch A).
 *
 * Ports `PlugBeat` (`itera-cenas-a1f3/_src/src/mechanics/PlugBeat.tsx`). ONE
 * page, one `stylesheet[]`: plugged in, every rule applies; pulled out, the
 * page renders as bare HTML (browser defaults: white, Times, black) — the same page, not two authored
 * ReactNodes. The beat only opens after BOTH halves of the gesture, in order:
 * pull, then plug back. No submit; silent; the learner cannot fail.
 *
 * ⚠️ Mirrors `@iterahq/activity-spec` read shape locally (`PlugSpec` in
 * `../specs.js`) — see the release-gate note at the top of that section.
 */
import type { CSSProperties } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Cable } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { PlugSpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { SceneBrowserBar } from './scene/SceneBrowserBar.js';
import { ScenePageElement } from './scene/ScenePageElement.js';
import { SCENE_CODE_COLORS as C, SCENE_PAGE_BACKGROUND, SCENE_RAW_PAGE_BACKGROUND } from './scene/sceneTheme.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
import { cssPropertyToReact } from './scene/cssPropertyToReact.js';
import { TACTILE_CTA } from '../components/tactile.js';
import { TOUCH_SURFACE } from '../components/touchSurface.js';

export function PlugActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as PlugSpec;
  const copy = useSceneText(spec);
  const elements = spec?.page?.elements ?? [];
  const gate = useSceneGate(activity, onComplete);
  const { record, open, solved, step } = gate;
  const [connected, setConnected] = useState(true);
  const [everPulled, setEverPulled] = useState(false);

  const styleFor = useMemo(() => {
    const byTarget = new Map<string, CSSProperties>();
    if (!connected) return byTarget;
    for (const rule of spec?.stylesheet ?? []) {
      const style = byTarget.get(rule.target_id) ?? {};
      (style as Record<string, string>)[cssPropertyToReact(rule.property)] = rule.value;
      byTarget.set(rule.target_id, style);
    }
    return byTarget;
  }, [connected, spec?.stylesheet]);

  const toggle = useCallback(() => {
    if (connected) {
      setConnected(false);
      setEverPulled(true);
      record('cable_toggled', { connected: false });
      step('pick');
      return;
    }
    setConnected(true);
    record('cable_toggled', { connected: true });
    if (everPulled && !solved) open({ cable: spec?.cable_name });
    step('connect');
  }, [connected, everPulled, open, record, solved, spec?.cable_name, step]);

  return (
    <SceneFrame
      kind="plug"
      icon={Cable}
      label={t('activity.plug')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      solved={solved}
    >
      <div className="flex flex-col gap-3">
        <div
          className="rounded-xl overflow-hidden border border-black/10"
          style={{ background: connected ? SCENE_PAGE_BACKGROUND : SCENE_RAW_PAGE_BACKGROUND }}
          data-testid="plug-stage"
          data-connected={connected ? 'true' : 'false'}
        >
          <SceneBrowserBar url={copy.url} />
          <div className="flex flex-col gap-4 p-7 min-h-[160px] max-sm:min-h-[112px] max-sm:p-5 short:min-h-[112px] short:p-5">
            {elements.map((el) => (
              <ScenePageElement key={el.id} element={el} style={styleFor.get(el.id)} raw={!connected} />
            ))}
          </div>
        </div>
        <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0E0D0B]" data-testid="plug-head">
          <div className="flex items-center h-9 bg-[#15130F] border-b border-white/5">
            <span className="h-full px-4 flex items-center gap-2 bg-[#0E0D0B] border-t-2 border-evergreen text-xs text-white/80 font-mono">
              <span className="text-[#E07A4A]">&lt;/&gt;</span> index.html
            </span>
          </div>
          <div className="py-3 px-4 text-[clamp(11px,1.25vw,15px)] leading-[2] overflow-x-auto font-mono whitespace-pre">
            <div>
              <span style={{ color: C.bracket }}>&lt;</span>
              <span style={{ color: C.tag }}>head</span>
              <span style={{ color: C.bracket }}>&gt;</span>
            </div>
            <div
              data-testid="plug-link-line"
              data-connected={connected ? 'true' : 'false'}
              className="pl-4 transition-opacity"
              style={connected ? undefined : { opacity: 0.35, textDecoration: 'line-through' }}
            >
              <span style={{ color: C.bracket }}>&lt;</span>
              <span style={{ color: C.tag }}>link</span>{' '}
              <span style={{ color: C.attr }}>rel</span>
              <span style={{ color: C.bracket }}>=</span>
              <span style={{ color: C.value }}>&quot;stylesheet&quot;</span>{' '}
              <span style={{ color: C.attr }}>href</span>
              <span style={{ color: C.bracket }}>=</span>
              <span style={{ color: C.value }}>&quot;{spec?.cable_name}&quot;</span>
              <span style={{ color: C.bracket }}>&gt;</span>
            </div>
            <div>
              <span style={{ color: C.bracket }}>&lt;/</span>
              <span style={{ color: C.tag }}>head</span>
              <span style={{ color: C.bracket }}>&gt;</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          data-testid="plug-cable"
          onClick={toggle}
          className={`inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full px-5 text-sm max-sm:w-full ${TACTILE_CTA} ${TOUCH_SURFACE}`}
        >
          <Cable className="w-4 h-4 flex-shrink-0" />
          {connected ? copy.text(spec?.on_label) : copy.text(spec?.off_label)}
        </button>
      </div>
    </SceneFrame>
  );
}
