/**
 * `decompose_canvas` — a system kind (2026-09-30, Tainan's Week 1 proposal).
 *
 * The learner sees a working interface, selects its leaves (tap, or a mouse
 * lasso) and names the part each group belongs to. The judge is a set of
 * constraints (`must_group` / `must_separate`), never a unique answer key.
 *
 * ⚠️ Mirrors the `@iterahq/activity-spec` read shape locally
 * (`DecomposeCanvasSpec` in `../specs.js`) — see the release-gate note there.
 */
import { useMemo, useState } from 'react';
import { Eraser, Puzzle, RotateCcw, X } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import { TACTILE_CTA } from '../components/tactile.js';
import { priorGatePayload } from '../internal/priorAnswer.js';
import type { ActivityCompleteHandler, ActivityCompletion, PortableActivity } from '../renderer.js';
import type { DecomposeCanvasSpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
import { useWrongHint } from './scene/useWrongHint.js';
import { WrongHint } from './scene/WrongHint.js';
import { SystemView, type SystemRegion } from './system/SystemView.js';
import {
  judgeDecomposition,
  partColor,
  partDepth,
  partFamily,
  regionSegments,
  restorableAssignment,
} from './system/decomposeJudge.js';
import { renderedLeafIds } from './system/viewModel.js';

export function DecomposeCanvasActivity({
  activity,
  onComplete,
  priorAnswer,
}: {
  activity: PortableActivity;
  onComplete: ActivityCompleteHandler;
  /** A finished attempt handed back: a `done` render redraws the learner's own parts. */
  priorAnswer?: ActivityCompletion;
}) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as DecomposeCanvasSpec;
  const copy = useSceneText(spec);
  const { record, open, solved } = useSceneGate(activity, onComplete);
  const parts = useMemo(() => spec?.parts ?? [], [spec?.parts]);
  const leaves = useMemo(() => (spec?.view ? renderedLeafIds(spec.view, spec.state ?? {}) : []), [spec?.view, spec?.state]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignment, setAssignment] = useState<Record<string, string>>(() =>
    activity.status === 'done' && spec
      ? (restorableAssignment(priorGatePayload(priorAnswer, 'assignment'), spec, leaves) ?? {})
      : {},
  );
  const { showHint, clearHint, hintProps } = useWrongHint();

  const toggle = (id: string) => {
    if (solved) return;
    clearHint();
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const lasso = (ids: string[]) => {
    if (solved) return;
    clearHint();
    setSelected((current) => {
      // A full re-lasso over already selected leaves toggles them off.
      if (ids.length > 0 && ids.every((id) => current.has(id))) return new Set([...current].filter((id) => !ids.includes(id)));
      return new Set([...current, ...ids]);
    });
  };

  const clearSelection = () => {
    clearHint();
    setSelected(new Set());
  };

  const selectedAssigned = [...selected].filter((id) => assignment[id]);

  // Records no action on purpose: the trace vocabulary is closed and Reset records none either.
  const unassign = () => {
    if (solved || selectedAssigned.length === 0) return;
    setAssignment((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !selectedAssigned.includes(id))));
    setSelected(new Set());
  };

  const assign = (partId: string) => {
    if (solved || selected.size === 0) return;
    const ids = [...selected];
    setAssignment((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, partId])) }));
    setSelected(new Set());
    record('part_assigned', { part_id: partId, node_ids: ids });
  };

  const reset = () => {
    setAssignment({});
    setSelected(new Set());
    clearHint();
  };

  const verify = () => {
    if (solved) return;
    const verdict = judgeDecomposition(spec, leaves, assignment);
    if (verdict.ok) {
      clearHint();
      setSelected(new Set());
      // The pairs are what a `done` render replays (`priorAnswer`) — authored ids only.
      open({
        parts: new Set(Object.values(assignment)).size,
        assignment: leaves.filter((leaf) => assignment[leaf]).map((leaf) => [leaf, assignment[leaf]]),
      });
      return;
    }
    if (verdict.reason === 'unassigned') {
      record('wrong_try', { rule: 'require_all_assigned' });
      showHint(t('activity.decomposeCanvas.unassigned', { count: verdict.unassigned.length }));
      return;
    }
    record('wrong_try', { rule: `${verdict.reason}#${verdict.index}` });
    showHint(copy.text(verdict.hint ?? spec?.wrong_hint) || t('activity.decomposeCanvas.wrongHint'));
  };

  const regions: SystemRegion[] = parts
    .map((part, i) => {
      const family = partFamily(parts, part.id);
      const members = leaves.filter((leaf) => assignment[leaf] && family.has(assignment[leaf]));
      return {
        id: part.id,
        label: copy.text(part.label),
        color: partColor(part, i),
        // A container part wraps its sub-parts in one outline; any other part
        // outlines each repeated list item on its own.
        segments: regionSegments(members, leaves, family.size === 1),
        depth: partDepth(parts, part.id),
      };
    })
    .filter((region) => region.segments.length > 0);

  const assignedCount = Object.keys(assignment).length;

  return (
    <SceneFrame
      kind="decompose_canvas"
      icon={Puzzle}
      label={t('activity.decomposeCanvas')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      stamp={copy.stamp}
      solved={solved}
    >
      <div className="flex flex-col gap-4 max-sm:gap-3" data-testid="decompose-stage">
        {spec?.view && (
          <SystemView
            view={spec.view}
            state={spec.state ?? {}}
            selectable={!solved}
            selected={solved ? undefined : selected}
            onTap={toggle}
            onLasso={lasso}
            regions={regions}
          />
        )}
        {!solved && (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground" data-testid="decompose-instruction">
                {selected.size === 0
                  ? t('activity.decomposeCanvas.selectHint')
                  : t('activity.decomposeCanvas.selected', { count: selected.size })}
              </p>
              <button
                type="button"
                onClick={clearSelection}
                tabIndex={selected.size === 0 ? -1 : 0}
                aria-hidden={selected.size === 0}
                data-testid="decompose-clear-selection"
                aria-label={t('activity.decomposeCanvas.clearSelection')}
                className={`shrink-0 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline max-sm:grid max-sm:h-11 max-sm:w-11 max-sm:place-items-center max-sm:rounded-full max-sm:border max-sm:border-border ${
                  selected.size === 0 ? 'invisible' : ''
                }`}
              >
                <span className="max-sm:hidden">{t('activity.decomposeCanvas.clearSelection')}</span>
                <X className="hidden h-4 w-4 max-sm:block" aria-hidden />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 max-sm:-mx-1 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-1 max-sm:pb-1" role="group" aria-label={t('activity.decomposeCanvas')}>
              {parts.map((part, i) => {
                const color = partColor(part, i);
                return (
                  <button
                    key={part.id}
                    type="button"
                    data-testid={`decompose-part-${part.id}`}
                    onClick={() => assign(part.id)}
                    disabled={selected.size === 0}
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border-2 border-b-4 px-3.5 py-2 text-sm font-semibold transition-[transform,opacity] duration-100 active:translate-y-[2px] active:border-b-2 disabled:opacity-50 disabled:active:translate-y-0 disabled:active:border-b-4"
                    style={{ borderColor: color, background: `${color}1F` }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                    {copy.text(part.label)}
                  </button>
                );
              })}
              <button
                type="button"
                data-testid="decompose-unassign"
                onClick={unassign}
                disabled={selectedAssigned.length === 0}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border-2 border-b-4 border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground/80 transition-[transform,opacity] duration-100 active:translate-y-[2px] active:border-b-2 disabled:opacity-50 disabled:active:translate-y-0 disabled:active:border-b-4"
              >
                <Eraser className="h-4 w-4" aria-hidden />
                {t('activity.decomposeCanvas.unassign')}
              </button>
            </div>
            <WrongHint {...hintProps} />
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={reset}
                disabled={assignedCount === 0}
                data-testid="decompose-reset"
                className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" />
                {t('activity.decomposeCanvas.reset')}
              </button>
              <button
                type="button"
                onClick={verify}
                disabled={assignedCount === 0}
                data-testid="decompose-verify"
                className={`h-12 rounded-full px-8 text-sm ${TACTILE_CTA}`}
              >
                {t('activity.decomposeCanvas.verify')}
              </button>
            </div>
          </>
        )}
      </div>
    </SceneFrame>
  );
}
