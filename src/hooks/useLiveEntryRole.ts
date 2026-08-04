/**
 * Escolha de papel do admin ao entrar numa aula ao vivo.
 * componente → hook → store puro (`utils/liveEntryRole`).
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMembership } from '@/hooks/useMembership';
import { isTenantAdmin } from '@/services/membership.service';
import {
  liveEntryPath,
  readLiveEntryRole,
  shouldAskLiveEntryRole,
  writeLiveEntryRole,
  type LiveEntryRole,
} from '@/utils/liveEntryRole';

export function useLiveEntryRole(sessionId: string | null | undefined) {
  const navigate = useNavigate();
  const { data: memberships, isPending, fetchStatus } = useMembership();
  const [, bump] = useState(0);

  // `enabled: false` (anônimo / supabase não configurado) mantém a query em
  // `pending` para sempre — sem o fetchStatus a aula nunca sairia do loading.
  const resolving = isPending && fetchStatus !== 'idle';
  const isAdmin = isTenantAdmin(memberships ?? []);
  const role = readLiveEntryRole(sessionId);

  const choose = useCallback(
    (next: LiveEntryRole) => {
      if (!sessionId) return;
      writeLiveEntryRole(sessionId, next);
      bump((v) => v + 1);
      navigate(liveEntryPath(sessionId, next), { replace: true });
    },
    [sessionId, navigate]
  );

  return {
    role,
    isAdmin,
    resolving,
    asking: !resolving && shouldAskLiveEntryRole({ isAdmin, chosenRole: role }),
    choose,
  };
}
