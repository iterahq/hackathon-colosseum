/**
 * `xray` — a scene kind (2026-09-24, plan
 * `20260924-itera-scene-animacoes-interativas`).
 *
 * The page sits on top of its own source; the pointer is a lens that punches
 * through it. Every source line sits under the element it draws. Sweeping
 * `coverage_goal` of the stage opens the gate: the guide reacts and the stamp
 * names the idea. The page and the lens stay live after that, so the learner
 * keeps looking under any part of the page. Ungraded; silent.
 */
import { useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ScanLine } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { XraySpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { SceneBrowserBar } from './scene/SceneBrowserBar.js';
import { XrayRows } from './scene/XrayRows.js';
import { XrayLens, XRAY_LENS_RADIUS } from './scene/XrayLens.js';
import { XrayHint } from './scene/XrayHint.js';
import { ScanMeter } from './scene/ScanMeter.js';
import { SCENE_CODE_BACKGROUND, SCENE_PAGE_BACKGROUND } from './scene/sceneTheme.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
import { DEFAULT_COVERAGE_GOAL, useXrayScan } from './scene/useXrayScan.js';
import { TOUCH_SURFACE } from '../components/touchSurface.js';

const GRID_BACKGROUND =
  'linear-gradient(rgba(63,209,127,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(63,209,127,.06) 1px, transparent 1px)';

export function XrayActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as XraySpec;
  const copy = useSceneText(spec);
  const elements = spec?.page?.elements ?? [];
  const stageRef = useRef<HTMLDivElement>(null);
  const gate = useSceneGate(activity, onComplete);
  const { open } = gate;
  const goal = spec?.coverage_goal ?? DEFAULT_COVERAGE_GOAL;
  const onGoal = useCallback(() => open({ coverage_goal: goal }), [open, goal]);
  const { lens, progress, scan, scanKey, clearLens } = useXrayScan(stageRef, goal, gate.solved, onGoal);
  const r = XRAY_LENS_RADIUS;
  const mask =
    lens
      ? `radial-gradient(circle ${r}px at ${lens.x}px ${lens.y}px, transparent 0 ${r - 2}px, #000 ${r}px)`
      : undefined;

  return (
    <SceneFrame
      kind="xray"
      icon={ScanLine}
      label={t('activity.xray')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      stamp={copy.stamp}
      solved={gate.solved}
    >
      <div
        ref={stageRef}
        data-testid="xray-stage"
        role="application"
        tabIndex={0}
        aria-label={t('activity.xray.stage')}
        aria-description={t('activity.xray.keyboard')}
        onPointerMove={scan}
        onPointerDown={scan}
        onPointerLeave={clearLens}
        onKeyDown={scanKey}
        onBlur={clearLens}
        className={`relative w-full aspect-[4/5] max-sm:aspect-square sm:aspect-[16/9] max-h-[460px] rounded-2xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-evergreen ${TOUCH_SURFACE}`}
        style={{ touchAction: 'none', cursor: lens ? 'none' : 'crosshair' }}
      >
        <div
          className="absolute inset-0"
          style={{ background: SCENE_CODE_BACKGROUND, backgroundImage: GRID_BACKGROUND, backgroundSize: '24px 24px' }}
        >
          <XrayRows elements={elements} layer="code" />
        </div>
        <div
          className="absolute inset-0"
          data-testid="xray-page"
          style={{ background: SCENE_PAGE_BACKGROUND, WebkitMaskImage: mask, maskImage: mask }}
        >
          <div className="absolute top-0 inset-x-0">
            <SceneBrowserBar url={copy.url} />
          </div>
          <XrayRows elements={elements} layer="page" />
        </div>
        {lens && <XrayLens x={lens.x} y={lens.y} label={t('activity.xray.lens')} />}
        <AnimatePresence>{!lens && !gate.solved && progress === 0 && <XrayHint />}</AnimatePresence>
      </div>
      <ScanMeter
        progress={progress}
        label={gate.solved ? t('activity.xray.done') : t('activity.xray.progress', { pct: Math.round(progress * 100) })}
      />
    </SceneFrame>
  );
}
