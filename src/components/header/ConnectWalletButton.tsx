import { useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { detectInjectedWallets } from '@/utils/solanaWallets';

interface Props {
  className?: string;
  testId?: string;
  /** Rendered instead of the button when this browser has no Phantom. */
  fallback?: ReactNode;
  onConnected?: () => void;
  /** `noWallet`: the provider vanished between detection and the click. */
  onError?: (noWallet: boolean) => void;
}

/** The one way in: signs in with the injected Phantom wallet. */
export function ConnectWalletButton({ className, testId = 'connect-wallet', fallback = null, onConnected, onError }: Props) {
  const { t } = useI18n();
  const { signInWithSolana } = useAuth();
  const [busy, setBusy] = useState(false);
  const phantom = useMemo(() => detectInjectedWallets().find((wallet) => wallet.id === 'phantom') ?? null, []);

  if (!phantom) return <>{fallback}</>;

  const connect = async () => {
    setBusy(true);
    const { error, noWallet } = await signInWithSolana(phantom.provider);
    setBusy(false);
    if (error) onError?.(Boolean(noWallet));
    else onConnected?.();
  };

  return (
    <button type="button" disabled={busy} onClick={() => void connect()} className={className} data-testid={testId}>
      {busy ? t('common.loading') : t('door.connect')}
    </button>
  );
}
