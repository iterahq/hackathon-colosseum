import { GitBranch } from 'lucide-react';
import { hexAlpha } from '@/utils/hexAlpha';
import type { UnitTone } from '@/types/unitTone';

/**
 * A unit's header card in the skill tree: a colored rail marks the section
 * change, the "Week N" eyebrow names the weekly cadence (each unit ships as
 * one week), and the done/total count reuses data `SkillTree` already builds
 * (`TreeSection.doneCount`/`total`) — no new query.
 */
export function SkillTreeUnitHeader({
  index,
  title,
  doneCount,
  total,
  tone,
  weekLabel,
  lessonsLabel,
}: {
  index: number;
  title: string;
  doneCount: number;
  total: number;
  tone: UnitTone;
  weekLabel: string;
  lessonsLabel: string;
}) {
  return (
    <div className="relative rounded-2xl border border-border bg-card px-5 py-4 my-6 overflow-hidden">
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: tone.base }} />
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl font-display font-bold flex items-center justify-center"
          style={{ backgroundColor: tone.soft, border: `1px solid ${hexAlpha(tone.base, 30)}`, color: tone.hi }}
        >
          {index + 1}
        </div>
        <div className="min-w-0">
          <div
            className="font-mono text-[11px] uppercase tracking-wider flex items-center gap-1.5"
            style={{ color: tone.hi }}
          >
            <GitBranch className="w-3 h-3" /> {weekLabel}
          </div>
          <div className="font-display font-semibold truncate">{title}</div>
        </div>
        <span className="ml-auto font-mono text-xs text-muted-foreground whitespace-nowrap">
          {doneCount}/{total} {lessonsLabel}
        </span>
      </div>
    </div>
  );
}
