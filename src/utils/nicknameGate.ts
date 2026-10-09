import type { User } from '@supabase/supabase-js';

const ADDRESS_LIKE = /^.{4}…[A-Za-z0-9]{4}$/;
const SKIP_PREFIX = 'itera.nickname.skipped:';

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 24;

export function isWalletUser(user: Pick<User, 'app_metadata' | 'identities'> | null | undefined): boolean {
  if (!user) return false;
  if (user.app_metadata?.provider === 'web3') return true;
  return (user.identities ?? []).some((identity) => identity.provider === 'web3');
}

export function isAddressLikeName(displayName: string | null | undefined): boolean {
  const name = (displayName ?? '').trim();
  return name === '' || ADDRESS_LIKE.test(name);
}

export interface NicknameGateInput {
  user: Pick<User, 'app_metadata' | 'identities'> | null | undefined;
  /** null while loading or when the profile could not be read: never block. */
  profile: { displayName: string | null } | null | undefined;
  skipped: boolean;
}

export function shouldShowNicknameGate({ user, profile, skipped }: NicknameGateInput): boolean {
  if (skipped || !profile) return false;
  return isWalletUser(user) && isAddressLikeName(profile.displayName);
}

export type NicknameResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'length' | 'email' };

export function normalizeNickname(raw: string): NicknameResult {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.includes('@')) return { ok: false, reason: 'email' };
  if ([...value].length < NICKNAME_MIN || [...value].length > NICKNAME_MAX) {
    return { ok: false, reason: 'length' };
  }
  return { ok: true, value };
}

export function nicknameSkipKey(authUid: string): string {
  return `${SKIP_PREFIX}${authUid}`;
}

export function readNicknameSkipped(authUid: string | undefined): boolean {
  if (!authUid) return false;
  try {
    return localStorage.getItem(nicknameSkipKey(authUid)) === '1';
  } catch {
    return false;
  }
}

export function rememberNicknameSkipped(authUid: string): void {
  try {
    localStorage.setItem(nicknameSkipKey(authUid), '1');
  } catch {
    // Storage unavailable: the step simply shows again next time.
  }
}
