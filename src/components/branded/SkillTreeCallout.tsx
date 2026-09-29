import { darken } from './skillTreeUnitPalette';
import type { UnitTone } from '@/types/unitTone';

const RING_TRACK = '#262320';
const MAX_TICKS = 12;

export function SkillTreeCallout({
  eyebrow,
  title,
  ctaLabel,
  activitiesDone,
  activitiesTotal,
  tone,
  left,
  top,
  width,
  tailLeft,
  onOpen,
}: {
  eyebrow: string;
  title: string;
  ctaLabel: string;
  activitiesDone: number;
  activitiesTotal: number;
  tone: UnitTone;
  left: number;
  top: number;
  width: number;
  tailLeft: number;
  onOpen: () => void;
}) {
  const ticks = Math.min(activitiesTotal, MAX_TICKS);
  const filled = activitiesTotal > MAX_TICKS ? Math.round((activitiesDone / activitiesTotal) * ticks) : activitiesDone;
  return (
    <div
      data-testid="tree-callout"
      className="absolute z-[4] box-border flex flex-col gap-1.5 rounded-2xl bg-obsidiana px-3.5 pt-3 pb-3.5 shadow-[0_16px_44px_rgba(0,0,0,0.65)]"
      style={{ left, top, width, border: `1px solid ${tone.base}` }}
    >
      <span
        aria-hidden="true"
        className="absolute h-4 w-4 rotate-45 bg-obsidiana"
        style={{
          left: tailLeft - 8,
          top: -9,
          borderLeft: `1px solid ${tone.base}`,
          borderTop: `1px solid ${tone.base}`,
        }}
      />
      <span className="font-mono text-[11px]" style={{ color: tone.hi }}>
        {`> ${eyebrow}`}
      </span>
      <span className="font-display text-[22px] font-bold leading-[1.05] line-clamp-2">{title}</span>
      {ticks > 0 && (
        <div className="my-0.5 flex gap-1" aria-hidden="true">
          {Array.from({ length: ticks }, (_, i) => (
            <span
              key={i}
              className="h-[5px] flex-1 rounded-[3px]"
              style={{ backgroundColor: i < filled ? tone.base : RING_TRACK }}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="mt-1 h-11 rounded-xl text-[15px] font-semibold active:translate-y-1"
        style={{
          backgroundColor: tone.base,
          color: tone.onBase,
          boxShadow: `0 5px 0 ${darken(tone.base, 45)}`
        }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
