const BASE = 'https://explorer.solana.com';

export const txUrl = (signature: string): string => `${BASE}/tx/${encodeURIComponent(signature)}?cluster=devnet`;
export const addressUrl = (address: string): string => `${BASE}/address/${encodeURIComponent(address)}?cluster=devnet`;

/** The transaction when there is one, the asset otherwise. */
export const chainUrl = (signature: string | null, asset: string | null): string | null =>
  signature ? txUrl(signature) : asset ? addressUrl(asset) : null;

/** `7xKpAbc...3Fa` -> `7xKp…3Fa` */
export const shortAddress = (address: string): string => (address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-3)}` : address);
