import { Loader2 } from 'lucide-react';
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

function GhostGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor" aria-hidden="true" className="mr-2.5 shrink-0" data-testid="connect-wallet-glyph">
      <path d="M12 2C7 2 3.5 5.8 3.5 10.8V20a1.3 1.3 0 0 0 2.1 1l1.6-1.3a1 1 0 0 1 1.3 0l1.5 1.2a1.3 1.3 0 0 0 1.6 0l1.5-1.2a1 1 0 0 1 1.3 0l1.6 1.3a1.3 1.3 0 0 0 2.1-1v-9.2C20.5 5.8 17 2 12 2Zm-2.6 8.2a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Zm5.2 0a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Z" fillRule="evenodd" />
    </svg>
  );
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
    <button
      type="button"
      disabled={busy}
      aria-busy={busy}
      data-state={busy ? 'busy' : 'idle'}
      onClick={() => void connect()}
      className={className}
      data-testid={testId}
    >
      {busy ? <Loader2 className="mr-2.5 h-5 w-5 shrink-0 animate-spin" aria-hidden="true" /> : <GhostGlyph />}
      {busy ? t('door.connecting') : t('door.connect')}
    </button>
  );
}
