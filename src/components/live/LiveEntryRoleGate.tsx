import { lazy, Suspense, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useLiveEntryRole } from '@/hooks/useLiveEntryRole';

const LiveEntryRoleModal = lazy(() => import('@/components/live/LiveEntryRoleModal').then((m) => ({ default: m.LiveEntryRoleModal })));

/**
 * Porta de entrada de `/live/:sessionId` para quem é admin do tenant.
 *
 * A pergunta substitui a página em vez de aparecer por cima dela: montar a
 * sessão do aluno atrás do modal já colocaria o admin na presença da sala (e no
 * ranking) antes de ele escolher o lado.
 */
export function LiveEntryRoleGate({ children }: { children: ReactNode }) {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { t } = useI18n();
  const { asking, resolving, choose } = useLiveEntryRole(sessionId);

  if (resolving) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        {t('live.connecting')}
      </div>
    );
  }

  if (asking)
    return (
      <Suspense fallback={null}>
        <LiveEntryRoleModal onChoose={choose} />
      </Suspense>
    );

  return <>{children}</>;
}
