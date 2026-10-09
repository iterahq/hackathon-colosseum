import type { User } from '@supabase/supabase-js';
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

/** Which top-level nav item owns a pathname; null outside the learner area. */
export function activeNavOf(pathname: string): NavId | null {
  if (pathname === '/') return 'trails';
  if (pathname === '/catalog' || pathname.startsWith('/catalog/') || pathname.startsWith('/program/') || pathname.startsWith('/course/')) return 'courses';
  if (pathname === '/passport' || pathname.startsWith('/passport/')) return 'passport';
  if (pathname === '/artifacts' || pathname.startsWith('/artifacts/')) return 'files';
  if (pathname === '/shop' || pathname.startsWith('/shop/')) return 'shop';
  return null;
}

export const initialsOf = (name: string): string =>
  name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
