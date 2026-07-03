/**
 * Resolves the signed-in user's Itera-local identity for presence + writes:
 * the itera.users.id (via getIteraUserId) + a display name (profile → email).
 * Used by the live-class presence roster and the professor surface.
 */
import { useEffect, useState } from 'react';
import { getIteraUserId } from '@/services/iteraUser';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/auth/AuthContext';

export interface IteraIdentity {
  userId: string | null;
  name: string;
  loading: boolean;
}

export function useIteraIdentity(): IteraIdentity {
  const { user } = useAuth();
  const { data: profile } = useProfile();
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
    profile?.displayName ?? user?.email?.split('@')[0] ?? 'Aluno';

  return { userId, name, loading };
}
