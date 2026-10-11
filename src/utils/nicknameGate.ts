import type { User } from '@supabase/supabase-js';
import { isGeneratedTeraName } from '@/utils/crystals';

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
  // Provisioning gives a wallet learner "Tera <Word> <3 digits>": friendly, but not a name they chose.
  return name === '' || ADDRESS_LIKE.test(name) || isGeneratedTeraName(name);
}

/** The account-level mark that the question was already put to this learner. Lives in the auth user's metadata, so it follows the account to any browser. */
export const NICKNAME_ASKED_FLAG = 'nickname_asked';

export function wasNicknameAsked(user: Pick<User, 'user_metadata'> | null | undefined): boolean {
  return user?.user_metadata?.[NICKNAME_ASKED_FLAG] === true;
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

const GENERATED_WORDS: ReadonlyArray<readonly [pt: string, en: string]> = [
  ['Curioso', 'Curious'], ['Focado', 'Focused'], ['Veloz', 'Swift'], ['Criativo', 'Creative'], ['Atento', 'Alert'],
  ['Valente', 'Brave'], ['Sereno', 'Calm'], ['Esperto', 'Clever'], ['Ligeiro', 'Quick'], ['Firme', 'Steady'],
  ['Brilhante', 'Bright'], ['Paciente', 'Patient'], ['Ousado', 'Bold'], ['Tranquilo', 'Easygoing'], ['Sagaz', 'Sharp'],
  ['Dedicado', 'Dedicated'], ['Animado', 'Lively'], ['Constante', 'Constant'], ['Engenhoso', 'Inventive'], ['Gentil', 'Kind'],
];

/**
 * The name provisioning gave a wallet learner ("Tera Ousado 477"), in the
 * language of the account ("Tera Bold 477"). `null` when it is not a generated
 * name or is already in that language.
 */
export function generatedNameIn(displayName: string | null | undefined, locale: 'pt' | 'en'): string | null {
  const match = /^Tera\s+([\p{L}]+)\s+(\d{3})$/u.exec((displayName ?? '').trim());
  if (!match) return null;
  const pair = GENERATED_WORDS.find(([pt, en]) => pt === match[1] || en === match[1]);
  if (!pair) return null;
  const word = locale === 'en' ? pair[1] : pair[0];
  return word === match[1] ? null : `Tera ${word} ${match[2]}`;
}
