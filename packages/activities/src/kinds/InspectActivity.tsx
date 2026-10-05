/**
 * `inspect` — a scene kind (2026-09-24, plan
 * `20260924-itera-scene-animacoes-interativas`).
 *
 * The page on one side, its source on the other. Pointing at either lights its
 * twin and draws a live wire between them; each first find fills a chip with
 * `<tag> = name`. Finding every element opens the gate. Ungraded; silent.
 */
import { useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MousePointerClick } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { InspectSpec, ScenePageElementSpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { SceneCodeLine } from './scene/SceneCodeLine.js';
import { ScenePageElement } from './scene/ScenePageElement.js';
import { InspectTarget } from './scene/InspectTarget.js';
import { ConnectorWire } from './scene/ConnectorWire.js';
import { DiscoveryChips } from './scene/DiscoveryChips.js';
import { SCENE_PAGE_BACKGROUND } from './scene/sceneTheme.js';
import { useConnectorPath } from './scene/useConnectorPath.js';
import { useDiscoveries } from './scene/useDiscoveries.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';

export function InspectActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as InspectSpec;
  const copy = useSceneText(spec);
  const elements = useMemo(() => spec?.page?.elements ?? [], [spec]);
  const ids = useMemo(() => elements.map((el) => el.id), [elements]);
  const gate = useSceneGate(activity, onComplete);
  const { record, open } = gate;
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<string, HTMLElement>());
  const codeRefs = useRef(new Map<string, HTMLElement>());
  const { active, found, discover, release } = useDiscoveries({
    ids,
    solved: gate.solved,
    onFound: useCallback((id: string) => record('element_found', { element_id: id }), [record]),
    onAll: useCallback((count: number) => open({ found: count }), [open]),
  });
  const path = useConnectorPath(
    containerRef,
    active ? pageRefs.current.get(active) ?? null : null,
    active ? codeRefs.current.get(active) ?? null : null,
  );
  const nameOf = (el: ScenePageElementSpec) => copy.text(el.name);
  const activeElement = elements.find((el) => el.id === active);

  const target = (el: ScenePageElementSpec, side: 'page' | 'code') => (
    <InspectTarget
      key={el.id}
      side={side}
      label={t(side === 'page' ? 'activity.inspect.pageTarget' : 'activity.inspect.codeTarget', { name: nameOf(el) })}
      active={active === el.id}
      dimmed={side === 'code' && !!active && active !== el.id}
      onEnter={() => discover(el.id)}
      onLeave={release}
      bindRef={(node) => {
        if (node) (side === 'page' ? pageRefs : codeRefs).current.set(el.id, node);
      }}
    >
      {side === 'page' ? <ScenePageElement element={el} /> : <SceneCodeLine element={el} />}
    </InspectTarget>
  );

  return (
    <SceneFrame
      kind="inspect"
      icon={MousePointerClick}
      label={t('activity.inspect')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      stamp={copy.stamp}
      solved={gate.solved}
    >
      <div ref={containerRef} className="relative grid md:grid-cols-2 gap-8 md:gap-14" data-testid="inspect-stage">
        <div className="rounded-xl p-6 flex flex-col gap-4" style={{ background: SCENE_PAGE_BACKGROUND }}>
          {elements.map((el) => target(el, 'page'))}
        </div>
        <div className="rounded-xl bg-[#0E0D0B] border border-white/10 p-5 flex flex-col justify-center gap-3 text-[clamp(11px,1.2vw,14px)] overflow-x-auto">
          {elements.map((el) => target(el, 'code'))}
        </div>
        <ConnectorWire path={path} id={active} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 min-h-[34px]" aria-live="polite">
        <DiscoveryChips elements={elements} found={found} nameOf={nameOf} />
        <AnimatePresence mode="wait">
          {activeElement && activeElement.job && (
            <motion.span
              key={activeElement.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm text-muted-foreground"
            >
              <span className="text-evergreen font-mono">&lt;{activeElement.tag}&gt;</span>{' '}
              {t('activity.inspect.is')} {copy.text(activeElement.job)}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </SceneFrame>
  );
}
