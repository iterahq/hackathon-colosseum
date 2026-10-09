import { isSolanaAddress } from './address.ts';
import type { IteraClient } from './db.ts';
import { bearerToken } from './http.ts';

export interface Caller {
  iteraUserId: string;
  wallet: string | null;
}

export type CallerFailure = 'unauthorized' | 'no_itera_profile';

/** The wallet the auth server attached to a user at sign-in. Never read from editable metadata. */
export function walletOf(identities: Array<{ provider: string; identity_data?: Record<string, unknown> }> | undefined): string | null {
  const web3 = (identities ?? []).find((entry) => entry.provider === 'web3');
  const claims = web3?.identity_data?.custom_claims as { chain?: string; address?: string } | undefined;
  return claims?.chain === 'solana' && isSolanaAddress(claims.address) ? claims.address : null;
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
  return { iteraUserId: identity.user_id, wallet: walletOf(data.user.identities) };
}

export function callerFailureStatus(failure: CallerFailure): number {
  return failure === 'unauthorized' ? 401 : 403;
}
