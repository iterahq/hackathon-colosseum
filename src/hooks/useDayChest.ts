/** The chest of a stamped day. componente -> hook -> service -> `tera-chest`. Every failure reads as "no chest". */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useLocale } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { isGuestAccessToken } from '@/services/guestSession.service';
import { NO_CHESTS, getMyChests, settleChest } from '@/services/teraChest.service';
import type { Chest, ChestList } from '@/types/tera';
import { chestOfLesson, chestPhase, chestPollMs, type ChestPhase } from '@/utils/dayChest';

function useLearnerId(): string | null {
  const { session } = useAuth();
  return session && !isGuestAccessToken(session.access_token) ? session.user.id : null;
}

/** The learner's chests and whether the feature is on. A read: it never opens a chest. `fresh` reads again on mount. */
export function useMyChestsQuery(fresh = false) {
  const userId = useLearnerId();
  // The chest names its trail: it is read in the language on screen.
  const locale = useLocale();
  return useQuery({ queryKey: queryKeys.tera.chests(userId ?? '', locale), queryFn: () => getMyChests(locale), enabled: Boolean(userId), retry: false, staleTime: 60_000, ...(fresh ? { refetchOnMount: 'always' as const } : {}) });
}

/** Asked early (with the lesson) so its end already knows whether chests are on. */
export function useMyChests(): ChestList {
  return useMyChestsQuery().data ?? NO_CHESTS;
}

export interface DayChestState {
  phase: ChestPhase | null;
  chest: Chest | null;
  /** An old day with no chest yet: opening it is the learner's own click, never a side effect of looking. */
  canOpen: boolean;
  /** The learner asked and the day has no chest to give. */
  nothing: boolean;
  opening: boolean;
  /** The learner pressed the button in this visit: what comes out is shown as a reveal, not as something found. */
  justOpened: boolean;
  open: () => void;
}

/**
 * `mode: 'stamped'`: the day was stamped in this visit, so its chest is asked for at once and followed until it opens.
 * `mode: 'found'`: a day finished earlier. Its chest is LOOKED UP in the learner's list; one that is still opening is
 * followed; a day with no chest is only offered, and asked for when the learner presses the button.
 */
export function useDayChest(lessonId: string | undefined, active: boolean, mode: 'stamped' | 'found' = 'stamped'): DayChestState {
  const userId = useLearnerId();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const list = useMyChestsQuery(mode === 'found');
  const featureOn = (list.data ?? NO_CHESTS).enabled;
  const known = mode === 'found' ? chestOfLesson(list.data?.chests ?? [], lessonId) : null;
  const [asked, setAsked] = useState(false);
  const settled = known?.status === 'minted' || known?.status === 'failed';
  // A day found again asks the server only for a chest that already exists and is still opening, or after the click.
  const ask = mode === 'stamped' || asked || (known !== null && !settled);
  const query = useQuery({
    queryKey: queryKeys.tera.dayChest(userId ?? '', lessonId ?? '', locale),
    queryFn: () => settleChest(lessonId as string, locale),
    enabled: Boolean(userId && lessonId && active && featureOn && ask),
    retry: false,
    staleTime: Infinity,
    refetchInterval: (q) => chestPollMs(q.state.data, q.state.dataUpdateCount),
  });
  const chest = query.data ?? known;
  const minted = chest?.status === 'minted';
  useEffect(() => {
    if (!minted || !userId || known?.status === 'minted') return;
    // The wardrobe, the shop and the certifications page list what the learner holds: a new Tera is in it now.
    void queryClient.invalidateQueries({ queryKey: queryKeys.tera.chests(userId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.shop.all });
  }, [minted, userId, queryClient, known?.status]);
  const idle = { canOpen: false, nothing: false, opening: false, justOpened: asked, open: () => setAsked(true) };
  if (!active || !featureOn) return { phase: null, chest: null, ...idle };
  if (mode === 'stamped') return { phase: chestPhase({ featureOn, answered: query.isFetched, chest }), chest, ...idle };
  if (chest) return { phase: chestPhase({ featureOn, answered: true, chest }), chest, ...idle };
  if (!list.isFetched || list.isFetching) return { phase: null, chest: null, ...idle };
  if (!asked) return { phase: null, chest: null, ...idle, canOpen: true };
  return { phase: null, chest: null, ...idle, opening: !query.isFetched, nothing: query.isFetched };
}
