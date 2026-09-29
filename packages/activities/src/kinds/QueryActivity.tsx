/**
 * `query` — a scene-mechanics kind (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`, batch B).
 *
 * Ports `QueryBeat` (`itera-cenas-a1f3/_src/src/mechanics/QueryBeat.tsx`).
 * Toggle SQL clause chips on and off; the assembled `SELECT` grows in the
 * terminal and the table obeys live. Ungraded: there is no wrong toggle, only
 * a result that has not yet reached `goal`. The beat settles (holds for a
 * moment, like `dial`/`selector`) once the live result matches `goal` exactly.
 *
 * The interpreter is `runQuery` / `queryReachesGoal` from
 * `@iterahq/activity-spec/runtime` — one PURE interpreter rather than a
 * second, hand-written WHERE/ORDER BY/LIMIT. The read shape is `QuerySpec` in
 * `../specs.js`.
 */
import { useCallback, useMemo, useState } from 'react';
import { Database } from 'lucide-react';
import { runQuery, queryReachesGoal } from '@iterahq/activity-spec/runtime';
import { useActivityI18n } from '../context.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { QuerySpec } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { SCENE_CODE_BACKGROUND } from './scene/sceneTheme.js';
import { useGestureSettle } from './scene/useGestureSettle.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';

export function QueryActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as QuerySpec;
  const copy = useSceneText(spec);
  const gate = useSceneGate(activity, onComplete);
  const { record, open, solved } = gate;

  const [on, setOn] = useState<Set<string>>(new Set());
  const clauses = spec?.clauses ?? [];
  const table = spec?.table;

  const active = useMemo(() => clauses.filter((c) => on.has(c.id)), [clauses, on]);
  const result = useMemo(() => (table ? runQuery(table, active) : []), [table, active]);
  const reached = useMemo(
    () =>
      table && spec?.goal
        ? queryReachesGoal(table, active, { rowIds: spec.goal.row_ids, ordered: spec.goal.ordered })
        : false,
    [table, active, spec?.goal],
  );

  const complete = useCallback(() => open({ row_count: result.length }), [open, result.length]);
  useGestureSettle(reached && !solved, complete);

  const toggle = (id: string) => {
    if (solved) return;
    setOn((current) => {
      const next = new Set(current);
      const enabling = !next.has(id);
      if (enabling) next.add(id);
      else next.delete(id);
      record('clause_toggled', { clause_id: id, enabled: enabling });
      return next;
    });
  };

  return (
    <SceneFrame
      kind="query"
      icon={Database}
      label={t('activity.query')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      stamp={copy.stamp}
      solved={solved}
    >
      <div className="grid md:grid-cols-[1fr_1.2fr] gap-5 items-start" data-testid="query-stage">
        <div className="flex flex-col gap-3">
          <div
            className="rounded-xl border border-white/10 p-4 flex flex-col gap-0.5"
            style={{ background: SCENE_CODE_BACKGROUND, fontFamily: "'JetBrains Mono', monospace" }}
            data-testid="query-sql"
          >
            <span className="text-[#C084FC] text-[13px]">{spec?.base_sql}</span>
            {active.map((clause) => (
              <span key={clause.id} className="text-[#F2C66D] text-[13px] pl-4">
                {clause.type === 'where' && `WHERE ${clause.column} ${clause.cmp} ${JSON.stringify(clause.value)}`}
                {clause.type === 'order_by' && `ORDER BY ${clause.column} ${clause.dir.toUpperCase()}`}
                {clause.type === 'limit' && `LIMIT ${clause.n}`}
              </span>
            ))}
            <span className="text-white/40 text-[13px]">;</span>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('activity.query')}>
            {clauses.map((clause) => (
              <button
                key={clause.id}
                type="button"
                data-testid={`query-clause-${clause.id}`}
                aria-pressed={on.has(clause.id)}
                disabled={solved}
                onClick={() => toggle(clause.id)}
                className={`rounded-full border px-3.5 py-1.5 font-mono text-sm transition-colors ${on.has(clause.id) ? 'border-[#F2C66D] bg-[#F2C66D]/15 text-[#F2C66D]' : 'border-border text-muted-foreground hover:border-foreground/40'}`}
              >
                {copy.text(clause.chip)}
              </button>
            ))}
          </div>
          <span
            className={`text-xs ${reached ? 'text-evergreen' : 'text-muted-foreground'}`}
            data-testid="query-goal-state"
            data-reached={reached}
          >
            {reached ? t('activity.query.goalReached') : t('activity.query.goalPending')}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <table className="w-full text-sm border-collapse" data-testid="query-table">
            <caption className="text-left text-xs text-muted-foreground mb-1">{table?.name}</caption>
            <thead>
              <tr>
                {(table?.columns ?? []).map((col) => (
                  <th key={col} className="text-left font-mono text-xs text-muted-foreground border-b border-border pb-1 pr-3">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.map((row) => (
                <tr key={row.id} data-testid={`query-row-${row.id}`}>
                  {row.cells.map((cell, i) => (
                    <td key={i} className="font-mono text-xs py-1 pr-3 border-b border-border/50">
                      {cell === null ? <span className="italic text-muted-foreground">NULL</span> : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <span className="font-mono text-xs text-muted-foreground text-right">
            {result.length} / {table?.rows.length ?? 0}
          </span>
        </div>
      </div>
    </SceneFrame>
  );
}
