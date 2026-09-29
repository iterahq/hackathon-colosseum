import type { NodeState } from '@/types/skillTree';
import type { UnitTone } from '@/types/unitTone';

export const NODE_LABEL_WIDTH = 148;

export function SkillTreeNodeLabel({
  dayLabel,
  title,
  kindLabel,
  state,
  primary,
  tone,
}: {
  dayLabel: string;
  title: string;
  kindLabel: string;
  state: NodeState;
  primary: boolean;
  tone: UnitTone;
}) {
  const locked = state === 'locked';
  return (
    <div className="flex justify-center pointer-events-none" style={{ width: NODE_LABEL_WIDTH }}>
      <div className="flex flex-col items-center text-center rounded-lg bg-background px-2 py-1">
      <span
        className={`text-[13px] leading-none ${primary ? 'font-bold' : 'font-semibold'} ${
          locked ? 'text-muted-foreground' : 'text-foreground'
        }`}
        style={primary ? { color: tone.hi } : undefined}
      >
        {dayLabel}
      </span>
      <span className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground leading-none">
        {kindLabel}
      </span>
      <span
        className={`mt-1 text-xs font-medium leading-tight line-clamp-2 ${
          locked ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        {title}
      </span>
      </div>
    </div>
  );
}
