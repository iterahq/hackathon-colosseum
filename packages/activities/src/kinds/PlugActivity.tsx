/**
 * `plug` — a scene-mechanics kind (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`, batch A).
 *
 * Ports `PlugBeat` (`itera-cenas-a1f3/_src/src/mechanics/PlugBeat.tsx`). ONE
 * page, one `stylesheet[]`: plugged in, every rule applies; pulled out, the
 * page renders bare (no rules at all) — the same page, not two authored
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
import { SCENE_PAGE_BACKGROUND } from './scene/sceneTheme.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
import { cssPropertyToReact } from './scene/cssPropertyToReact.js';

export function PlugActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as PlugSpec;
  const copy = useSceneText(spec);
  const elements = spec?.page?.elements ?? [];
  const gate = useSceneGate(activity, onComplete);
  const { record, open, solved } = gate;
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
    if (solved) return;
    if (connected) {
      setConnected(false);
      setEverPulled(true);
      record('cable_toggled', { connected: false });
      return;
    }
    setConnected(true);
    record('cable_toggled', { connected: true });
    if (everPulled) open({ cable: spec?.cable_name });
  }, [connected, everPulled, open, record, solved, spec?.cable_name]);

  return (
    <SceneFrame
      kind="plug"
      icon={Cable}
      label={t('activity.plug')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      stamp={copy.stamp}
      solved={solved}
    >
      <div
        className="rounded-xl overflow-hidden border border-black/10"
        style={{ background: SCENE_PAGE_BACKGROUND }}
        data-testid="plug-stage"
        data-connected={connected ? 'true' : 'false'}
      >
        <SceneBrowserBar url={copy.url} />
        <div className="flex flex-col gap-4 p-7 min-h-[160px]">
          {elements.map((el) => (
            <ScenePageElement key={el.id} element={el} style={styleFor.get(el.id)} />
          ))}
        </div>
      </div>
      <button
        type="button"
        data-testid="plug-cable"
        onClick={toggle}
        disabled={solved}
        className="inline-flex items-center gap-2 self-start rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        <Cable className="w-4 h-4" />
        {connected ? copy.text(spec?.on_label) : copy.text(spec?.off_label)}
      </button>
    </SceneFrame>
  );
}
