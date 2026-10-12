/** Wire -> app: the origin block every Tera object carries (`learner-profile.avatars[]`, owned `shop-items`, `credential-verify`). */
import type { TeraOrigin, TeraOriginKind } from '@/types/tera';

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const KINDS: readonly TeraOriginKind[] = ['earned', 'bought', 'sponsor'];
const HEX = /^#[0-9a-f]{6}$/i;

/** Null when the object says nothing about its origin: the caller draws the Tera as it did before origins existed. */
export function toTeraOrigin(v: unknown): TeraOrigin | null {
  const r = row(v);
  const kind = KINDS.find((k) => k === r.origin);
  if (!kind) return null;
  const proof = row(r.proof);
  const earned = row(r.earned);
  const sponsor = row(r.sponsor);
  const asset = text(proof.asset) || text(r.asset) || text(r.asset_address);
  return {
    kind,
    // Only a bought Tera may change hands, whatever the flag says.
    transferable: kind === 'bought' && r.transferable !== false,
    proof: asset ? { asset, explorerUrl: text(proof.explorer_url) || text(r.explorer_url) || null } : null,
    earned: kind === 'earned' && text(earned.certification) ? { certification: text(earned.certification), trail: text(earned.trail), day: typeof earned.day === 'number' ? earned.day : 0, tier: text(earned.tier), chestId: text(earned.chest_id) } : null,
    sponsor: kind === 'sponsor' && text(sponsor.brand) ? { brand: text(sponsor.brand), accent: HEX.test(text(sponsor.accent)) ? text(sponsor.accent) : '#F4EDE2', bountySlug: text(sponsor.bounty_slug), bountyTitle: text(sponsor.bounty_title), payoutTx: text(sponsor.payout_tx) } : null,
  };
}
