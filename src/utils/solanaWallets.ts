/**
 * The Solana wallets injected into this page. Phantom, Solflare and Backpack each announce themselves under
 * their own namespace and most also fill the shared `window.solana`; a wallet we do not know by name is
 * still offered through that shared object. Sign-in itself is Supabase's Sign in with Solana, which takes
 * any provider that can sign a message.
 */
import type { InjectedWallet, SolanaSignInProvider, WalletId, WalletWindow } from '@/types/solanaWallet';

const isProvider = (p: unknown): p is SolanaSignInProvider =>
  !!p && typeof p === 'object' && (typeof (p as SolanaSignInProvider).signIn === 'function' || typeof (p as SolanaSignInProvider).signMessage === 'function');

export function detectInjectedWallets(win: unknown = typeof window === 'undefined' ? undefined : window): InjectedWallet[] {
  const w = (win ?? {}) as WalletWindow;
  const found: InjectedWallet[] = [];
  const seen = new Set<unknown>();
  const add = (id: WalletId, name: string, candidate: unknown) => {
    if (!isProvider(candidate) || seen.has(candidate)) return;
    seen.add(candidate);
    found.push({ id, name, provider: candidate });
  };
  add('phantom', 'Phantom', w.phantom?.solana);
  add('solflare', 'Solflare', w.solflare);
  const backpack = w.backpack && typeof w.backpack === 'object' && 'solana' in w.backpack ? (w.backpack as { solana?: unknown }).solana : w.backpack;
  add('backpack', 'Backpack', backpack);
  const shared = w.solana as SolanaSignInProvider | undefined;
  if (isProvider(shared) && !seen.has(shared)) {
    if (shared.isPhantom) add('phantom', 'Phantom', shared);
    else if (shared.isSolflare) add('solflare', 'Solflare', shared);
    else if (shared.isBackpack) add('backpack', 'Backpack', shared);
    else add('other', 'Solana wallet', shared);
  }
  return found;
}

/** A phone or tablet browser, where no extension can inject a wallet: the wallet app's own browser is the way in. */
export function isMobileBrowser(nav: { userAgent?: string; maxTouchPoints?: number } | undefined = typeof navigator === 'undefined' ? undefined : navigator, coarsePointer = false): boolean {
  if (!nav) return false;
  if (/Android|iPhone|iPad|iPod|Mobile|Silk/i.test(nav.userAgent ?? '')) return true;
  return coarsePointer && (nav.maxTouchPoints ?? 0) > 1;
}

export const PHANTOM_INSTALL_URL = 'https://phantom.app/download';
export const SOLFLARE_INSTALL_URL = 'https://solflare.com/download';
export const BACKPACK_INSTALL_URL = 'https://backpack.app/download';
