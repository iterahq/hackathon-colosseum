import type { SolanaWallet } from '@supabase/supabase-js';

export type WalletId = 'phantom' | 'solflare' | 'backpack' | 'other';

/** An injected provider as Sign in with Solana takes it (`signInWithWeb3`), plus the flags the wallets set on themselves. */
export type SolanaSignInProvider = SolanaWallet & {
  connect?: (...args: unknown[]) => Promise<unknown>;
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
};

export interface InjectedWallet {
  id: WalletId;
  name: string;
  provider: SolanaSignInProvider;
}

/** Where the known wallets announce themselves on `window`. */
export interface WalletWindow {
  phantom?: { solana?: unknown };
  solflare?: unknown;
  backpack?: { solana?: unknown } | SolanaSignInProvider;
  solana?: unknown;
}
