import type { NodeState } from '@/types/skillTree';

export function SkillTreeNodeLabel({
  title,
  kindLabel,
  state,
}: {
  title: string;
  kindLabel: string;
  state: NodeState;
}) {
  return (
    <div className="mt-1.5 flex flex-col items-center text-center max-w-[160px]">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground leading-none">
        {kindLabel}
      </span>
      <span
        className={`mt-0.5 text-xs font-medium leading-tight line-clamp-2 ${
          state === 'locked' ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        {title}
      </span>
    </div>
  );
}
