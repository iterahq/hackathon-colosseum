import { CheckCircle2, Circle, Pencil, XCircle } from 'lucide-react';
import type { ClassAnswerState } from '@/types/liveClass';

/**
 * How one row reports on the CURRENT activity.
 *
 * `showDetail` is what keeps correctness off the learners' screens: without it a
 * wrong answer reads as simply "respondeu" (aula1 Opção A — a learner never sees
 * who got it right or wrong). `working` is the professor-only middle state: the
 * learner has local work but hasn't submitted, which is exactly who they want to
 * pull to the stage.
 */
export function LiveRoomStateIcon({
  state,
  working = false,
  showDetail = false,
}: {
  state: ClassAnswerState;
  working?: boolean;
  showDetail?: boolean;
}) {
  if (state === 'done' || (state === 'wrong' && !showDetail)) {
    return <CheckCircle2 className="w-4 h-4 text-menta" />;
  }
  if (state === 'wrong') return <XCircle className="w-4 h-4 text-destructive/90" />;
  if (working) return <Pencil className="w-3.5 h-3.5 text-clay" data-testid="live-room-working" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />;
}
