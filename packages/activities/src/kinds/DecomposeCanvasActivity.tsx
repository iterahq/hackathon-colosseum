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
import { Puzzle, RotateCcw } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import { priorGatePayload } from '../internal/priorAnswer.js';
import type { ActivityCompleteHandler, ActivityCompletion, PortableActivity } from '../renderer.js';
import type { DecomposeCanvasSpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
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
  const [hint, setHint] = useState<string | null>(null);

  const toggle = (id: string) => {
    if (solved) return;
    setHint(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const lasso = (ids: string[]) => {
    if (solved) return;
    setHint(null);
    setSelected((current) => new Set([...current, ...ids]));
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
    setHint(null);
  };

  const verify = () => {
    if (solved) return;
    const verdict = judgeDecomposition(spec, leaves, assignment);
    if (verdict.ok) {
      setHint(null);
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
      setHint(t('activity.decomposeCanvas.unassigned', { count: verdict.unassigned.length }));
      return;
    }
    record('wrong_try', { rule: `${verdict.reason}#${verdict.index}` });
    setHint(copy.text(verdict.hint ?? spec?.wrong_hint) || t('activity.decomposeCanvas.wrongHint'));
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
      <div className="flex flex-col gap-4" data-testid="decompose-stage">
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
            <p className="text-sm text-muted-foreground" data-testid="decompose-instruction">
              {selected.size === 0
                ? t('activity.decomposeCanvas.selectHint')
                : t('activity.decomposeCanvas.selected', { count: selected.size })}
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('activity.decomposeCanvas')}>
              {parts.map((part, i) => {
                const color = partColor(part, i);
                return (
                  <button
                    key={part.id}
                    type="button"
                    data-testid={`decompose-part-${part.id}`}
                    onClick={() => assign(part.id)}
                    disabled={selected.size === 0}
                    className="inline-flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
                    style={{ borderColor: color, background: `${color}1F` }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                    {copy.text(part.label)}
                  </button>
                );
              })}
            </div>
            <WrongHint text={hint} />
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={reset}
                disabled={assignedCount === 0}
                data-testid="decompose-reset"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" />
                {t('activity.decomposeCanvas.reset')}
              </button>
              <button
                type="button"
                onClick={verify}
                disabled={assignedCount === 0}
                data-testid="decompose-verify"
                className="rounded-full bg-[#6366F1] px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_#4338CA] disabled:opacity-40"
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
