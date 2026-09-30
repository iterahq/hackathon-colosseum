/**
 * `state_lab` — a system kind (2026-09-30, Tainan's Week 1 proposal).
 *
 * Left: the explicit state and the controls that change it. Right: the
 * interface drawn from that state. Every change re-renders the interface; the
 * beat completes once every goal holds at the same time. No free-form code
 * editing — that is `code_editor_checks`.
 *
 * ⚠️ Mirrors the `@iterahq/activity-spec` read shape locally (`StateLabSpec`
 * in `../specs.js`) — see the release-gate note there.
 */
import { useState } from 'react';
import { CircleCheck, Circle, Database, Minus, Plus } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { StateLabControlSpec, StateLabSpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { SCENE_CODE_BACKGROUND } from './scene/sceneTheme.js';
import { useGestureSettle } from './scene/useGestureSettle.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
import { SystemView } from './system/SystemView.js';
import { applyControl, cloneJson, type State } from './system/stateOps.js';
import { deepEqual, getPath, setPath } from './system/viewModel.js';

export function StateLabActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as StateLabSpec;
  const copy = useSceneText(spec);
  const { record, open, solved } = useSceneGate(activity, onComplete);
  const goals = spec?.goals ?? [];

  const [state, setState] = useState<State>(() => {
    const initial = cloneJson(spec?.state ?? {});
    return activity.status === 'done' ? goals.reduce<State>((s, g) => setPath(s, g.path, g.equals), initial) : initial;
  });
  const [changed, setChanged] = useState(0);

  const holds = goals.map((goal) => deepEqual(getPath(state, goal.path), goal.equals));
  const allHold = goals.length > 0 && holds.every(Boolean);
  useGestureSettle(allHold && !solved && changed > 0, () => open({ goals: goals.length }));

  const operate = (control: StateLabControlSpec, value?: string) => {
    if (solved) return;
    setState((current) => applyControl(current, control, value));
    setChanged((n) => n + 1);
    record('state_changed', { control_id: control.id });
  };

  const controlButton = 'inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10 disabled:opacity-50';

  return (
    <SceneFrame
      kind="state_lab"
      icon={Database}
      label={t('activity.stateLab')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      stamp={copy.stamp}
      solved={solved}
    >
      <div className="grid gap-4 md:grid-cols-2" data-testid="state-lab-stage">
        <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-white/10 p-4" style={{ background: SCENE_CODE_BACKGROUND }}>
          <span className="text-xs font-mono uppercase tracking-wider text-white/50">{t('activity.stateLab.state')}</span>
          <pre
            key={changed}
            data-testid="state-lab-json"
            className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-[#F2C66D] [overflow-wrap:anywhere]"
          >
            {JSON.stringify(state, null, 2)}
          </pre>
          <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
            {(spec?.controls ?? []).map((control) => {
              const text = copy.text(control.label) || control.path;
              if (control.type === 'toggle') {
                const on = getPath(state, control.path) === true;
                return (
                  <button
                    key={control.id}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    disabled={solved}
                    onClick={() => operate(control)}
                    data-testid={`state-lab-control-${control.id}`}
                    className={`${controlButton} justify-between`}
                  >
                    <span className="flex flex-col">
                      <span>{text}</span>
                      <span className="font-mono text-[11px] text-white/45">
                        {control.path}: {String(on)}
                      </span>
                    </span>
                    <span
                      className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
                      style={{ background: on ? '#3FD17F' : 'rgba(255,255,255,0.2)' }}
                    >
                      <span
                        className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
                        style={{ left: on ? 18 : 2 }}
                      />
                    </span>
                  </button>
                );
              }
              if (control.type === 'text') {
                const value = getPath(state, control.path);
                return (
                  <label key={control.id} className="flex flex-col gap-1 text-sm text-white/90">
                    <span>{text}</span>
                    <input
                      type="text"
                      value={value == null ? '' : String(value)}
                      disabled={solved}
                      onChange={(event) => operate(control, event.currentTarget.value)}
                      data-testid={`state-lab-control-${control.id}`}
                      className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 font-mono text-[13px] text-white outline-none focus:border-[#6366F1]"
                    />
                  </label>
                );
              }
              const Icon = control.type === 'add_item' ? Plus : Minus;
              return (
                <button
                  key={control.id}
                  type="button"
                  disabled={solved}
                  onClick={() => operate(control)}
                  data-testid={`state-lab-control-${control.id}`}
                  className={controlButton}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {text}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {spec?.view && <SystemView view={spec.view} state={state} testId="state-lab-view" />}
          <div className="flex flex-col gap-1.5" data-testid="state-lab-goals">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{t('activity.stateLab.goals')}</span>
            {goals.map((goal, i) => (
              <div
                key={`${goal.path}-${i}`}
                data-testid={`state-lab-goal-${i}`}
                data-met={holds[i] ? 'true' : 'false'}
                className="flex items-center gap-2 text-sm"
              >
                {holds[i] ? (
                  <CircleCheck className="h-4 w-4 shrink-0 text-[#3FD17F]" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className={holds[i] ? 'text-foreground' : 'text-muted-foreground'}>{copy.text(goal.label)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}
