import type { SponsorFaucetResult } from '@/services/bounty.service';

/** The message key for each answer of the sponsor faucet. */
export function faucetKey(result: SponsorFaucetResult): string {
  if (result.kind === 'sent') return 'bounty.faucet.sent';
  if (result.kind === 'unavailable') return 'bounty.faucet.unavailable';
  return result.reason === 'other' ? 'bounty.faucet.unavailable' : `bounty.faucet.${result.reason}`;
}
