import { isSolanaAddress } from './address.ts';
import type { IteraClient } from './db.ts';
import { bearerToken } from './http.ts';
import { pickWallet, type ResolvedWallet, type WalletSource } from './wallet-link.ts';

export interface Caller {
  iteraUserId: string;
  wallet: string | null;
  walletSource: WalletSource | null;
}

type AuthIdentities = Array<{ provider: string; identity_data?: Record<string, unknown> }> | undefined;

export type CallerFailure = 'unauthorized' | 'no_itera_profile';

/** The wallet the auth server attached to a user at sign-in. Never read from editable metadata. */
export function walletOf(identities: AuthIdentities): string | null {
  const web3 = (identities ?? []).find((entry) => entry.provider === 'web3');
  const claims = web3?.identity_data?.custom_claims as { chain?: string; address?: string } | undefined;
  return claims?.chain === 'solana' && isSolanaAddress(claims.address) ? claims.address : null;
}

export async function linkedWalletOf(db: IteraClient, iteraUserId: string): Promise<{ wallet: string; linked_at: string } | null> {
  const { data, error } = await db.from('user_wallets').select('wallet,linked_at').eq('user_id', iteraUserId).maybeSingle();
  if (error) throw new Error(`user_wallets: ${error.message}`);
  return data && isSolanaAddress(data.wallet) ? data : null;
}

/**
 * The learner's wallet, for every function that mints or charges: the web3
 * identity when there is one (no lookup at all), otherwise the wallet linked by
 * a verified signature (`link-wallet`), otherwise none.
 */
export async function resolveWallet(db: IteraClient, iteraUserId: string, identities: AuthIdentities): Promise<ResolvedWallet> {
  const identityWallet = walletOf(identities);
  if (identityWallet) return pickWallet(identityWallet, null);
  return pickWallet(null, (await linkedWalletOf(db, iteraUserId))?.wallet ?? null);
}

/** The itera user and wallet behind the bearer token. Nothing here comes from the request body. */
export async function resolveCaller(db: IteraClient, request: Request): Promise<Caller | CallerFailure> {
  const token = bearerToken(request);
  if (!token) return 'unauthorized';
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return 'unauthorized';

  const { data: identity, error: identityError } = await db
    .from('identities')
    .select('user_id')
    .eq('provider_subject', data.user.id)
    .limit(1)
    .maybeSingle();
  if (identityError) throw new Error(`identities: ${identityError.message}`);
  if (!identity) return 'no_itera_profile';
  const { wallet, source } = await resolveWallet(db, identity.user_id, data.user.identities);
  return { iteraUserId: identity.user_id, wallet, walletSource: source };
}

export function callerFailureStatus(failure: CallerFailure): number {
  return failure === 'unauthorized' ? 401 : 403;
}
