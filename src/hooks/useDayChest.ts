/** The chest of a stamped day. componente -> hook -> service -> `tera-chest`. Every failure reads as "no chest". */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { isGuestAccessToken } from '@/services/guestSession.service';
import { NO_CHESTS, getMyChests, settleChest } from '@/services/teraChest.service';
import type { ChestList } from '@/types/tera';
import { chestPhase, chestPollMs, type ChestPhase } from '@/utils/dayChest';
import type { Chest } from '@/types/tera';

function useLearnerId(): string | null {
  const { session } = useAuth();
  return session && !isGuestAccessToken(session.access_token) ? session.user.id : null;
}

/** The learner's chests and whether the feature is on. Asked early (with the lesson) so its end already knows. */
export function useMyChests(): ChestList {
  const userId = useLearnerId();
  return useQuery({ queryKey: queryKeys.tera.chests(userId ?? ''), queryFn: getMyChests, enabled: Boolean(userId), retry: false, staleTime: 60_000 }).data ?? NO_CHESTS;
}

/** `active`: the day is stamped on chain, so its chest may be asked for. Polls while the block is awaited. */
export function useDayChest(lessonId: string | undefined, active: boolean): { phase: ChestPhase | null; chest: Chest | null } {
  const userId = useLearnerId();
  const queryClient = useQueryClient();
  const featureOn = useMyChests().enabled;
  const query = useQuery({
    queryKey: queryKeys.tera.dayChest(userId ?? '', lessonId ?? ''),
    queryFn: () => settleChest(lessonId as string),
    enabled: Boolean(userId && lessonId && active && featureOn),
    retry: false,
    staleTime: Infinity,
    refetchInterval: (q) => chestPollMs(q.state.data, q.state.dataUpdateCount),
  });
  const chest = query.data ?? null;
  const minted = chest?.status === 'minted';
  useEffect(() => {
    if (!minted || !userId) return;
    // The wardrobe, the shop and the certifications page list what the learner holds: a new Tera is in it now.
    void queryClient.invalidateQueries({ queryKey: queryKeys.tera.chests(userId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.shop.all });
  }, [minted, userId, queryClient]);
  return { phase: active ? chestPhase({ featureOn, answered: query.isFetched, chest }) : null, chest };
}
