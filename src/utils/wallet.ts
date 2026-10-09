import type { User } from '@supabase/supabase-js';

const addressOf = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') return null;
  const d = data as { address?: unknown; custom_claims?: { address?: unknown } };
  const found = d.custom_claims?.address ?? d.address;
  return typeof found === 'string' && found ? found : null;
};

/** The Solana address of a user signed in with a wallet (Supabase `web3` identity), else null. */
export function walletOf(user: User | null | undefined): string | null {
  if (!user) return null;
  const identity = user.identities?.find((i) => i.provider === 'web3');
  return addressOf(identity?.identity_data) ?? addressOf(user.user_metadata);
}
