const BASE = 'https://explorer.solana.com';

export const txUrl = (signature: string): string => `${BASE}/tx/${encodeURIComponent(signature)}?cluster=devnet`;
export const addressUrl = (address: string): string => `${BASE}/address/${encodeURIComponent(address)}?cluster=devnet`;

/** The transaction when there is one, the asset otherwise. */
export const chainUrl = (signature: string | null, asset: string | null): string | null =>
  signature ? txUrl(signature) : asset ? addressUrl(asset) : null;

/** The asset page (the one that draws the certificate image) when there is an asset, its transaction otherwise. */
export const assetFirstUrl = (asset: string | null, signature: string | null): string | null =>
  asset ? addressUrl(asset) : signature ? txUrl(signature) : null;

/** `7xKpAbc...3Fa` -> `7xKp…3Fa` */
export const shortAddress = (address: string): string => (address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-3)}` : address);

export type ExplorerKind = 'tx' | 'address';
export interface ExplorerLinkOption {
  id: 'solana' | 'solscan' | 'solanafm';
  label: string;
  url: string;
}

/** The same transaction or account in three independent explorers, all on devnet. */
export function explorerLinks(kind: ExplorerKind, value: string): ExplorerLinkOption[] {
  const id = encodeURIComponent(value);
  return [
    { id: 'solana', label: 'Solana Explorer', url: kind === 'tx' ? txUrl(value) : addressUrl(value) },
    { id: 'solscan', label: 'Solscan', url: `https://solscan.io/${kind === 'tx' ? 'tx' : 'account'}/${id}?cluster=devnet` },
    { id: 'solanafm', label: 'SolanaFM', url: `https://solana.fm/${kind === 'tx' ? 'tx' : 'address'}/${id}?cluster=devnet-solana` },
  ];
}

/** What a Solana Explorer link points at, so a caller that only holds the href can offer the alternatives. */
export function parseExplorerUrl(href: string): { kind: ExplorerKind; value: string } | null {
  try {
    const url = new URL(href);
    if (url.hostname !== 'explorer.solana.com') return null;
    const [, kind, value] = url.pathname.split('/');
    if ((kind !== 'tx' && kind !== 'address') || !value) return null;
    return { kind, value: decodeURIComponent(value) };
  } catch {
    return null;
  }
}
