import type { StampExpectation } from '@/types/loop';
import { LoopBoundary } from './LoopBoundary';
import { LoopPanelBody } from './LoopPanelBody';

/** Under the end of a lesson: what this day proved on chain and which paid bounties that opens. Every state is honest. */
export function LoopPanel({ trail, day, stamp }: { trail?: number | null; day?: number | null; stamp?: StampExpectation | null }) {
  return (
    <LoopBoundary>
      <LoopPanelBody trail={trail} day={day} stamp={stamp} />
    </LoopBoundary>
  );
}
