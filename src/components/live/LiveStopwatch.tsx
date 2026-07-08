import { Clock } from 'lucide-react';
import { useStopwatch } from '@/hooks/useStopwatch';
import { formatMmss } from '@/utils/formatMmss';

interface LiveStopwatchProps {
  startedAt: number;
}

export function LiveStopwatch({ startedAt }: LiveStopwatchProps) {
  const elapsed = useStopwatch(startedAt);
  return (
    <div
      className="inline-flex items-center gap-2 px-3 h-9 rounded-full border border-border bg-card text-sm font-mono tabular-nums text-muted-foreground"
      data-testid="live-stopwatch"
      role="timer"
    >
      <Clock className="w-4 h-4" />
      {formatMmss(elapsed)}
    </div>
  );
}
