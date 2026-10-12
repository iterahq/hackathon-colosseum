export const HEADLINE_MAX = 120;

/** Lamports as a plain SOL decimal with no trailing zeros: 20000000 -> "0.02". */
export function lamportsToSol(lamports: number): string {
  const whole = Math.floor(lamports / 1_000_000_000);
  const fraction = String(Math.round(lamports % 1_000_000_000)).padStart(9, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}

/** The address a company writes to start a paid mission for this wallet. */
export function missionHref(wallet: string): string {
  return `/bounties/post?to=${encodeURIComponent(wallet)}`;
}

/** The refusal code a call carried, mapped to a message key of the opt-in card. */
export function optInErrorKey(code: string | null): string {
  const known = ['invalid_headline', 'wallet_taken', 'contact_required', 'invalid_contact', 'profile_private'];
  return code && known.includes(code) ? `talent.optin.error.${code}` : 'talent.optin.error.generic';
}

export function parseMinDays(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 1000 ? n : 0;
}
