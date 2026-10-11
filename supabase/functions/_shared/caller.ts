import { isSolanaAddress } from './address.ts';
import type { IteraClient } from './db.ts';
import { bearerToken } from './http.ts';
import { unverifiedSubject } from './jwt-subject.ts';
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

interface IdentityWithWallet {
  userId: string;
  linkedWallet: string | null;
}

type WalletRows = Array<{ wallet: unknown }> | { wallet: unknown } | null | undefined;

const walletIn = (rows: WalletRows): string | null => {
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row && isSolanaAddress(row.wallet) ? row.wallet : null;
};

/** The itera profile behind an auth user id, with the wallet linked to it, in ONE read. */
async function identityWithWallet(db: IteraClient, subject: string): Promise<IdentityWithWallet | null> {
  const { data, error } = await db
    .from('identities')
    .select('user_id, users!inner(user_wallets(wallet))')
    .eq('provider_subject', subject)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`identities: ${error.message}`);
  if (!data) return null;
  const users = data.users as { user_wallets?: WalletRows } | Array<{ user_wallets?: WalletRows }> | null;
  const user = Array.isArray(users) ? users[0] : users;
  return { userId: data.user_id as string, linkedWallet: walletIn(user?.user_wallets) };
}

/**
 * The itera user and wallet behind the bearer token. Nothing here comes from the request body.
 * The profile lookup starts from the token's unverified `sub` while the auth server verifies the
 * token, and its result is used only when the server confirms that same user id; otherwise the
 * lookup is repeated with the verified id. The auth server and the database sit in different
 * regions, so the two reads in flight together save one round trip on every call.
 */
export async function resolveCaller(db: IteraClient, request: Request): Promise<Caller | CallerFailure> {
  const token = bearerToken(request);
  if (!token) return 'unauthorized';
  const subject = unverifiedSubject(token);
  // `undefined`: the early read failed or was not attempted; `null`: no profile for that id.
  const early: Promise<IdentityWithWallet | null | undefined> = subject ? identityWithWallet(db, subject).catch(() => undefined) : Promise.resolve(undefined);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return 'unauthorized';

  let identity = subject === data.user.id ? await early : undefined;
  if (identity === undefined) identity = await identityWithWallet(db, data.user.id);
  if (!identity) return 'no_itera_profile';
  const identityWallet = walletOf(data.user.identities);
  const { wallet, source } = identityWallet ? pickWallet(identityWallet, null) : pickWallet(null, identity.linkedWallet);
  return { iteraUserId: identity.userId, wallet, walletSource: source };
}

export function callerFailureStatus(failure: CallerFailure): number {
  return failure === 'unauthorized' ? 401 : 403;
}
