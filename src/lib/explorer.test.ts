import { describe, expect, it } from 'vitest';
import { addressUrl, chainUrl, explorerLinks, parseExplorerUrl, shortAddress, txUrl } from '@/lib/explorer';

describe('explorer links', () => {
  it('points to devnet', () => {
    expect(txUrl('sig1')).toBe('https://explorer.solana.com/tx/sig1?cluster=devnet');
    expect(addressUrl('A1')).toBe('https://explorer.solana.com/address/A1?cluster=devnet');
  });

  it('prefers the transaction and falls back to the asset', () => {
    expect(chainUrl('sig1', 'A1')).toContain('/tx/sig1');
    expect(chainUrl(null, 'A1')).toContain('/address/A1');
    expect(chainUrl(null, null)).toBeNull();
  });

  it('shortens long addresses only', () => {
    expect(shortAddress('7xKpQrstuvwxyz3Fa')).toBe('7xKp…3Fa');
    expect(shortAddress('abc')).toBe('abc');
  });

  it('offers three explorers, every one on devnet', () => {
    const links = explorerLinks('tx', 'sig1');
    expect(links.map((link) => link.id)).toEqual(['solana', 'solscan', 'solanafm']);
    expect(links.map((link) => link.url)).toEqual([
      'https://explorer.solana.com/tx/sig1?cluster=devnet',
      'https://solscan.io/tx/sig1?cluster=devnet',
      'https://solana.fm/tx/sig1?cluster=devnet-solana',
    ]);
    expect(explorerLinks('address', 'A1').map((link) => link.url)).toEqual([
      'https://explorer.solana.com/address/A1?cluster=devnet',
      'https://solscan.io/account/A1?cluster=devnet',
      'https://solana.fm/address/A1?cluster=devnet-solana',
    ]);
  });

  it('reads back what an explorer link points at', () => {
    expect(parseExplorerUrl(txUrl('sig1'))).toEqual({ kind: 'tx', value: 'sig1' });
    expect(parseExplorerUrl(addressUrl('A1'))).toEqual({ kind: 'address', value: 'A1' });
    expect(parseExplorerUrl('https://solscan.io/tx/sig1')).toBeNull();
    expect(parseExplorerUrl('https://explorer.solana.com/block/1')).toBeNull();
    expect(parseExplorerUrl('not a url')).toBeNull();
  });
});
