import { useLoopView } from '@/hooks/useLoopView';
import { usePassportView } from '@/hooks/usePassportView';
import { useWalletLink } from '@/hooks/useWalletLink';
import type { ProgressStory } from '@/types/progressStory';
import { progressStory } from '@/utils/progressStory';

/**
 * The one progress story every signed-in surface leads with: days stamped out of the days in the trails,
 * capabilities proven on chain out of the graph. Reads nothing new: the trail dashboard, the achievements
 * and the wallet's public profile are the same queries the dashboard already holds.
 */
export function useProgressStory(): ProgressStory {
  const { wallet } = useWalletLink();
  const passport = usePassportView();
  const loop = useLoopView(wallet ?? null);
  return progressStory({ pages: passport.pages, pending: passport.isPending, wallet, capabilities: loop.capabilities });
}
