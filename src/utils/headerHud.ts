import type { User } from '@supabase/supabase-js';
import { FOCUS_BUILD } from '@/config/focus';
import { isGeneratedTeraName } from '@/utils/crystals';
import type { LevelView, NavId, WalletIdentity } from '@/types/headerHud';

export const XP_PER_LEVEL = 200;

/** Level from total XP: flat 200 XP per level, level 1 at 0 XP. */
export function levelOf(xp: number): LevelView {
  const safe = Math.max(0, Math.floor(xp));
  const level = Math.floor(safe / XP_PER_LEVEL) + 1;
  const into = safe % XP_PER_LEVEL;
  return { level, into, span: XP_PER_LEVEL, ratio: into / XP_PER_LEVEL };
}

/** `7xKp…3fQa` — the first and last characters of a base58 address. */
export function shortAddress(address: string, head = 4, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/** The Solana wallet behind a web3 sign-in, read from the user's identities; null for email users. */
export function walletOf(user: Pick<User, 'identities'> | null | undefined): WalletIdentity | null {
  for (const identity of user?.identities ?? []) {
    if (identity.provider !== 'web3') continue;
    const claims = identity.identity_data?.custom_claims as Record<string, unknown> | undefined;
    const address = claims?.address;
    if (typeof address !== 'string' || !address) continue;
    return {
      address,
      chain: typeof claims?.chain === 'string' ? claims.chain : 'solana',
      network: typeof claims?.network === 'string' ? claims.network : null,
    };
  }
  return null;
}

/** Which top-level nav item owns a pathname; null outside the learner area. A program page is a trail page when the courses are hidden. */
export function activeNavOf(pathname: string, focus = FOCUS_BUILD): NavId | null {
  if (pathname === '/') return 'trails';
  if (pathname.startsWith('/program/')) return focus ? 'trails' : 'courses';
  if (pathname === '/catalog' || pathname.startsWith('/catalog/') || pathname.startsWith('/course/')) return 'courses';
  if (pathname === '/passport' || pathname.startsWith('/passport/')) return 'passport';
  if (pathname === '/certifications' || pathname.startsWith('/certifications/')) return 'passport';
  if (pathname === '/world' || pathname.startsWith('/world/')) return 'world';
  if (pathname === '/artifacts' || pathname.startsWith('/artifacts/')) return 'files';
  if (pathname === '/shop' || pathname.startsWith('/shop/')) return 'shop';
  if (pathname === '/bounties' || pathname.startsWith('/bounties/')) return 'bounties';
  if (pathname === '/talent' || pathname.startsWith('/talent/')) return 'talent';
  if (pathname === '/verify' || pathname.startsWith('/verify/')) return 'verify';
  return null;
}

export const initialsOf = (name: string): string =>
  name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

/** The name to greet: the learner's nickname, or null when it is missing, a (shortened) wallet address or a name provisioning generated. */
export function greetingName(displayName: string | null | undefined): string | null {
  const name = displayName?.trim() ?? '';
  if (!name || isGeneratedTeraName(name)) return null;
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(name)) return null;
  if (/^[1-9A-HJ-NP-Za-km-z]{3,8}(…|\.{2,3})[1-9A-HJ-NP-Za-km-z]{3,8}$/.test(name)) return null;
  return name;
}
