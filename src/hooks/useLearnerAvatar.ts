import { useEffect } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useCompanion } from '@/hooks/useCompanion';
import { useCrystals } from '@/hooks/useCrystals';
import { DEFAULT_AVATAR, type LearnerAvatar } from '@/types/avatar';
import { readCachedTheme } from '@/utils/appTheme';

const cacheKey = (userId: string) => `itera.avatar.last.${userId}`;

function readLast(userId: string): LearnerAvatar | null {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey(userId)) ?? 'null') as LearnerAvatar | null;
    return raw && typeof raw.key === 'string' && typeof raw.chipUrl === 'string' ? raw : null;
  } catch {
    return null;
  }
}

/**
 * The signed-in learner's avatar. While the companion loads it is the last one this learner wore
 * (never the default Tera for someone who wears another), then the live one with the profile border.
 * The border comes from the companion's avatar block, else from the `theme` of `GET /crystals`, else the cache.
 */
export function useLearnerAvatar(): LearnerAvatar {
  const { session } = useAuth();
  const userId = session?.user?.id ?? 'anon';
  const live = useCompanion().data?.avatar ?? null;
  const theme = useCrystals().data?.theme ?? null;

  useEffect(() => {
    if (!live || userId === 'anon') return;
    try {
      localStorage.setItem(cacheKey(userId), JSON.stringify({ ...live, border: undefined }));
    } catch {
      /* private mode */
    }
  }, [live, userId]);

  const avatar = live ?? (userId === 'anon' ? null : readLast(userId)) ?? DEFAULT_AVATAR;
  const border = live && live.border !== undefined ? live.border : theme ? (theme.border?.border ?? null) : userId === 'anon' ? null : (readCachedTheme()?.border ?? null);
  return border ? { ...avatar, border } : avatar;
}
