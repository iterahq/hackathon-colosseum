import { hexAlpha } from '@/utils/hexAlpha';
import { darken } from './skillTreeUnitPalette';
import type { UnitTone } from '@/types/unitTone';

/**
 * A unit's banner on top of the trail: a solid card in the unit's tone. The
 * eyebrow names the weekly cadence (each unit ships as one week) and the badge
 * reuses data `SkillTree` already builds (`TreeSection.doneCount`/`total`).
 */
export function SkillTreeUnitHeader({
  title,
  doneCount,
  total,
  tone,
  weekLabel,
  top,
  height,
  inset,
}: {
  title: string;
  doneCount: number;
  total: number;
  tone: UnitTone;
  weekLabel: string;
  top: number;
  height: number;
  inset: number;
}) {
  return (
    <div
      data-testid="unit-banner"
      className="absolute z-3 flex items-center gap-3 rounded-[18px] px-[18px]"
      style={{
        left: inset,
        right: inset,
        top,
        height,
        backgroundColor: tone.base,
        color: tone.onBase,
        boxShadow: `0 6px 0 ${darken(tone.base, 45)}`,
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-wider opacity-75">{weekLabel}</span>
        <span className="font-display text-2xl font-bold leading-none line-clamp-2">{title}</span>
      </div>
      <span
        className="whitespace-nowrap rounded-lg px-2.5 py-1.5 font-mono text-xs font-semibold"
        style={{ backgroundColor: hexAlpha(tone.onBase, 16) }}
      >
        {doneCount}/{total}
      </span>
    </div>
  );
}
