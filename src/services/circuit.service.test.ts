import { describe, expect, it } from 'vitest';
import { toCircuitCounter, toCircuitShare, toPurchaseCircuit } from './circuit.service';

describe('circuit normalisers', () => {
  it('reads the public counter with the wallet share', () => {
    expect(
      toCircuitCounter({ total_lamports: 1_100_000, total_usd_cents: 20, purchases: 2, stamps_funded: 220, treasury_explorer_url: 'https://e/t', authority_explorer_url: 'https://e/a', wallet: { lamports: 550_000, stamps_funded: 110 } })
    ).toEqual({ lamports: 1_100_000, stampsFunded: 220, purchases: 2, treasuryExplorerUrl: 'https://e/t', authorityExplorerUrl: 'https://e/a', wallet: { lamports: 550_000, stampsFunded: 110 } });
  });

  it('reads an empty or malformed answer as zero', () => {
    expect(toCircuitCounter(null)).toEqual({ lamports: 0, stampsFunded: 0, purchases: 0, treasuryExplorerUrl: null, authorityExplorerUrl: null, wallet: null });
    expect(toCircuitShare({ lamports: -5, stamps_funded: 'x' })).toEqual({ lamports: 0, stampsFunded: 0 });
  });

  it('claims stamps for a purchase only when its transfer was sent', () => {
    expect(toPurchaseCircuit({ status: 'sent', lamports: 550_000, stamps_funded: 110, explorer_url: 'https://e/tx' })).toEqual({ status: 'sent', stampsFunded: 110, explorerUrl: 'https://e/tx' });
    for (const status of ['pending', 'skipped', 'failed']) expect(toPurchaseCircuit({ status, stamps_funded: 110 })).toBeNull();
    expect(toPurchaseCircuit(undefined)).toBeNull();
  });
});
