import { barFill } from '@/utils/trailDashboard';

interface Props {
  done: number;
  total: number;
  color: string;
  slots?: number;
  className?: string;
}

/** Segmented bar of the dashboard: `slots` ticks, the first ones lit by the share done. */
export function CourseProgressBar({ done, total, color, slots = 12, className = '' }: Props) {
  const fill = barFill(done, total, slots);
  return (
    <span className={`flex gap-1 ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      {Array.from({ length: slots }, (_, i) => (
        <span key={i} className="h-1.5 flex-1 rounded-sm" style={{ background: i < fill ? color : '#262320' }} />
      ))}
    </span>
  );
}
