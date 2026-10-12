import { useMemo } from 'react';
import { useBountyBoard } from '@/hooks/useBounties';
import { useLearnerProfile } from '@/hooks/useLearnerProfile';
import { useI18n } from '@/i18n';
import type { Capabilities, LearnerProfile } from '@/types/learnerProfile';
import type { LoopView } from '@/types/loop';
import { loopView } from '@/utils/loopView';

export type LoopStatus = 'no-wallet' | 'loading' | 'error' | 'ready';

/** What a wallet has proven and what that opens: the public profile plus the public bounty board, nothing else. */
export function useLoopView(wallet: string | null, { stamped = null }: { stamped?: LearnerProfile | null } = {}) {
  const { locale } = useI18n();
  const profile = useLearnerProfile(wallet ?? '', locale);
  const board = useBountyBoard();
  // `stamped`: the read that followed a stamp just confirmed. It wins over whatever the shared query holds.
  const learner: LearnerProfile | null = stamped ?? (profile.data?.status === 'ok' ? profile.data.profile : null);
  const capabilities: Capabilities | null = learner?.capabilities ?? null;
  const view: LoopView = useMemo(() => loopView(learner, board.data?.bounties ?? []), [learner, board.data]);
  const status: LoopStatus = !wallet
    ? 'no-wallet'
    : (!stamped && profile.isPending) || board.isPending
      ? 'loading'
      : (!stamped && profile.isError) || board.isError || !learner
        ? 'error'
        : 'ready';
  const retry = () => {
    void profile.refetch();
    void board.refetch();
  };
  return { status, view, capabilities, learner, retry };
}
