/**
 * `event_trace` — a system kind (2026-09-30, Tainan's Week 1 proposal).
 *
 * The learner fires a real event on the interface; execution freezes; one tap
 * per step walks event → action → state → render, each lighting up on the
 * system. `lenses` only adds read-only panels (structure, state, flow) — same
 * input, same judge. Prediction is NOT part of this kind: it is its own
 * activity, because one kind takes one input.
 *
 * ⚠️ Mirrors the `@iterahq/activity-spec` read shape locally
 * (`EventTraceSpec` in `../specs.js`) — see the release-gate note there.
 */
import { useState, type KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Cog, Database, Monitor, MousePointerClick, Pause, Zap } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { EventTraceLens, EventTracePanel, EventTraceSpec, EventTraceStepSpec, ViewNode } from '../specs.js';
import { useNarrowViewport } from '../components/useNarrowViewport.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { SCENE_CODE_BACKGROUND } from './scene/sceneTheme.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
import { SystemView } from './system/SystemView.js';
import { baseId } from './system/viewModel.js';
import { useLensBadges } from './useLensBadges.js';

const LENS_ICON: Record<EventTraceLens, LucideIcon> = {
  event: MousePointerClick,
  action: Cog,
  state: Database,
  render: Monitor,
};

const LENS_COLOR: Record<EventTraceLens, string> = {
  event: '#F59E0B',
  action: '#8B5CF6',
  state: '#3FD17F',
  render: '#38BDF8',
};

function stateAt(initial: Record<string, unknown>, steps: readonly EventTraceStepSpec[], index: number) {
  let state = initial;
  for (let i = 0; i <= index && i < steps.length; i += 1) state = steps[i].state_after ?? state;
  return state;
}

function StructureOutline({ node, lit, depth = 0 }: { node: ViewNode; lit: string | undefined; depth?: number }) {
  const active = lit !== undefined && baseId(lit) === node.id;
  const children = node.type === 'box' ? node.children : node.type === 'list' ? [node.item] : [];
  return (
    <>
      <div
        className="font-mono text-[12px] leading-6"
        style={{ paddingLeft: depth * 12, color: active ? '#F59E0B' : 'rgba(255,255,255,0.65)', fontWeight: active ? 700 : 400 }}
      >
        {node.type} <span className="text-white/35">#{node.id}</span>
      </div>
      {children.map((child) => (
        <StructureOutline key={child.id} node={child} lit={lit} depth={depth + 1} />
      ))}
    </>
  );
}

export function EventTraceActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as EventTraceSpec;
  const copy = useSceneText(spec);
  const { record, open, solved } = useSceneGate(activity, onComplete);
  const steps = spec?.steps ?? [];
  const lenses = spec?.lenses ?? [];
  const alreadyDone = activity.status === 'done';

  const [index, setIndex] = useState(alreadyDone ? steps.length - 1 : -1);
  const fired = index >= 0;
  const state = fired ? stateAt(spec?.state ?? {}, steps, index) : (spec?.state ?? {});
  const step = fired ? steps[index] : undefined;
  const last = index >= steps.length - 1;

  const reach = (next: number) => {
    setIndex(next);
    record('step_visited', { index: next });
    if (next >= steps.length - 1) open({ steps: steps.length });
  };

  const fire = (nodeId: string) => {
    if (solved || fired || !spec?.trigger || nodeId !== spec.trigger.node) return;
    record('event_triggered', { node_id: nodeId });
    reach(0);
  };

  const advance = () => {
    if (solved || !fired || last) return;
    reach(index + 1);
  };

  const narrow = useNarrowViewport();
  const [picked, setPicked] = useState<EventTracePanel | undefined>();
  const activeLens = lenses.includes(picked as EventTracePanel) ? (picked as EventTracePanel) : lenses[0];
  const isNew = useLensBadges<EventTracePanel>(activeLens, {
    structure: step?.highlight ?? '',
    state: JSON.stringify(state),
    flow: String(index),
  });

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const move = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (move === 0 || !activeLens) return;
    event.preventDefault();
    const next = lenses[(lenses.indexOf(activeLens) + move + lenses.length) % lenses.length];
    setPicked(next);
    document.getElementById(`event-trace-tab-${activity.id}-${next}`)?.focus();
  };

  const renderPanel = (lens: EventTracePanel) => (
    <>
      <span className="text-xs font-mono uppercase tracking-wider text-white/50">{t(`activity.eventTrace.panel.${lens}`)}</span>
      {lens === 'state' && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-[#F2C66D] [overflow-wrap:anywhere] max-sm:max-h-36">
          {JSON.stringify(state, null, 2)}
        </pre>
      )}
      {lens === 'structure' && spec?.view && (
        <div className="max-h-48 overflow-auto max-sm:max-h-36">
          <StructureOutline node={spec.view} lit={step?.highlight} />
        </div>
      )}
      {lens === 'flow' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {steps.map((s, i) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span
                className="rounded-md px-2 py-1 font-mono text-[11px]"
                style={{
                  background: i === index ? LENS_COLOR[s.lens] : 'rgba(255,255,255,0.08)',
                  color: i === index ? '#0E0D0B' : 'rgba(255,255,255,0.7)',
                }}
              >
                {t(`activity.eventTrace.lens.${s.lens}`)}
              </span>
              {i < steps.length - 1 && <ArrowRight className="h-3 w-3 text-white/30" />}
            </span>
          ))}
        </div>
      )}
    </>
  );

  const inputValues = spec?.trigger?.input ? { [spec.trigger.input.node]: spec.trigger.input.value } : undefined;
  const highlight = step?.highlight ? [step.highlight] : [];

  return (
    <SceneFrame
      kind="event_trace"
      icon={Zap}
      label={t('activity.eventTrace')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      stamp={copy.stamp}
      solved={solved}
    >
      <div className="grid gap-4 max-sm:gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" data-testid="event-trace-stage">
        <div className="flex flex-col gap-2">
          {spec?.view && (
            <SystemView
              view={spec.view}
              state={state}
              highlight={highlight}
              tappable={!fired && spec.trigger ? new Set([spec.trigger.node]) : undefined}
              onTap={fire}
              inputValues={inputValues}
              testId="event-trace-view"
            />
          )}
          {!fired && (
            <p className="text-sm text-muted-foreground" data-testid="event-trace-instruction">
              {t('activity.eventTrace.trigger')}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {fired && !solved && (
            <span
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300"
              data-testid="event-trace-frozen"
            >
              <Pause className="h-3.5 w-3.5" />
              {t('activity.eventTrace.frozen')}
            </span>
          )}
          <ol className="flex flex-col gap-2 max-sm:flex-row max-sm:gap-1.5" data-testid="event-trace-steps">
            {steps.map((s, i) => {
              const Icon = LENS_ICON[s.lens] ?? Zap;
              const color = LENS_COLOR[s.lens] ?? '#6366F1';
              const seen = i <= index;
              const current = i === index;
              return (
                <li
                  key={s.id}
                  data-testid={`event-trace-step-${s.id}`}
                  data-state={current ? 'current' : seen ? 'seen' : 'hidden'}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-300 max-sm:min-h-[52px] max-sm:gap-2 max-sm:px-1.5 max-sm:py-1.5 ${
                    current ? 'max-sm:min-w-0 max-sm:flex-1' : 'max-sm:w-11 max-sm:shrink-0 max-sm:justify-center'
                  }`}
                  style={{
                    borderColor: current ? color : 'hsl(var(--border))',
                    background: current ? `${color}1A` : undefined,
                    opacity: seen ? 1 : 0.35,
                  }}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${color}26`, color }}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className={`flex min-w-0 flex-col ${current ? '' : 'max-sm:sr-only'}`}>
                    <span className="text-[11px] font-mono uppercase tracking-wider" style={{ color }}>
                      {i + 1}. {t(`activity.eventTrace.lens.${s.lens}`)}
                    </span>
                    <span className="truncate text-sm font-semibold max-sm:line-clamp-2 max-sm:whitespace-normal max-sm:text-[13px] max-sm:leading-tight">
                      {seen ? copy.text(s.label) : '…'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          {fired && !solved && !last && (
            <button
              type="button"
              onClick={advance}
              data-testid="event-trace-next"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#6366F1] px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_#4338CA]"
            >
              {t('activity.eventTrace.next')}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
        {lenses.length > 0 && narrow && activeLens && (
          <div className="flex flex-col gap-2" data-testid="event-trace-lenses">
            <div role="tablist" className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${lenses.length}, minmax(0, 1fr))` }}>
              {lenses.map((lens) => {
                const active = lens === activeLens;
                return (
                  <button
                    key={lens}
                    type="button"
                    role="tab"
                    id={`event-trace-tab-${activity.id}-${lens}`}
                    aria-selected={active}
                    aria-controls={`event-trace-tabpanel-${activity.id}`}
                    tabIndex={active ? 0 : -1}
                    data-testid={`event-trace-tab-${lens}`}
                    data-new={isNew(lens) ? 'true' : undefined}
                    onClick={() => setPicked(lens)}
                    onKeyDown={onTabKey}
                    className={`relative inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-mono uppercase tracking-wider transition-colors ${
                      active ? 'border-white/30 bg-white/10 text-white' : 'border-white/10 text-white/60'
                    }`}
                  >
                    {t(`activity.eventTrace.panel.${lens}`)}
                    {isNew(lens) && (
                      <>
                        <span aria-hidden className="h-2 w-2 rounded-full bg-[#F59E0B]" />
                        <span className="sr-only">{t('activity.eventTrace.updated')}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            <div
              role="tabpanel"
              id={`event-trace-tabpanel-${activity.id}`}
              aria-labelledby={`event-trace-tab-${activity.id}-${activeLens}`}
              data-testid={`event-trace-panel-${activeLens}`}
              className="flex min-h-[8.5rem] flex-col gap-2 rounded-xl border border-white/10 p-3"
              style={{ background: SCENE_CODE_BACKGROUND }}
            >
              {renderPanel(activeLens)}
            </div>
          </div>
        )}
        {lenses.length > 0 && !narrow && (
          <div className="grid gap-3 sm:grid-cols-2 md:col-span-2 lg:grid-cols-3" data-testid="event-trace-lenses">
            {lenses.map((lens) => (
              <div
                key={lens}
                data-testid={`event-trace-panel-${lens}`}
                className="flex flex-col gap-2 rounded-xl border border-white/10 p-3"
                style={{ background: SCENE_CODE_BACKGROUND }}
              >
                {renderPanel(lens)}
              </div>
            ))}
          </div>
        )}
      </div>
    </SceneFrame>
  );
}
