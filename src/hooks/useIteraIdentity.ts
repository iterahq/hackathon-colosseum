/**
 * Resolves the signed-in user's Itera-local identity for presence + writes:
 * the itera.users.id (via getIteraUserId) + a display name (profile → email).
 * Used by the live-class presence roster and the professor surface.
 */
import { useEffect, useState } from 'react';
import { getIteraUserId } from '@/services/iteraUser';
import { useProfile } from '@/hooks/useProfile';
import { useI18n } from '@/i18n';
import { useAuth } from '@/auth/AuthContext';
import type { IteraIdentity } from '@/types/iteraIdentity';

export type { IteraIdentity } from '@/types/iteraIdentity';

export function useIteraIdentity(): IteraIdentity {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { t } = useI18n();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getIteraUserId().then((id) => {
      if (!alive) return;
      setUserId(id);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const name =
    profile?.displayName ?? user?.email?.split('@')[0] ?? t('role.learner');

  return { userId, name, avatarUrl: profile?.avatarUrl ?? null, loading };
}
