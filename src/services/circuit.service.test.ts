import { describe, expect, it } from 'vitest';
import { toCircuitCounter, toCircuitShare, toPurchaseCircuit } from './circuit.service';

describe('circuit normalisers', () => {
  it('reads the public counter with the wallet share', () => {
    expect(
      toCircuitCounter({
        as_of: '2026-10-11T14:00:00.000Z',
        total_lamports: 1_100_000,
        total_usd_cents: 20,
        purchases: 2,
        stamps_funded: 220,
        purchase_lamports: 2_200_000,
        share_percent: 50,
        stamp_fee_lamports: 5000,
        outside: { total_lamports: 550_000, purchases: 1, stamps_funded: 110, test_accounts_left_out: 1 },
        shop: { min_usd_cents: 20, max_usd_cents: 1000, items: 40 },
        treasury_explorer_url: 'https://e/t',
        authority_explorer_url: 'https://e/a',
        wallet: { lamports: 550_000, stamps_funded: 110 },
      })
    ).toEqual({
      lamports: 1_100_000,
      stampsFunded: 220,
      purchases: 2,
      asOf: '2026-10-11T14:00:00.000Z',
      purchaseLamports: 2_200_000,
      sharePercent: 50,
      stampFeeLamports: 5000,
      outside: { lamports: 550_000, stampsFunded: 110, purchases: 1, testAccountsLeftOut: 1 },
      shop: { minUsdCents: 20, maxUsdCents: 1000, items: 40 },
      treasuryExplorerUrl: 'https://e/t',
      authorityExplorerUrl: 'https://e/a',
      wallet: { lamports: 550_000, stampsFunded: 110 },
    });
  });

  it('reads an empty or malformed answer as zero', () => {
    expect(toCircuitCounter(null)).toEqual({ lamports: 0, stampsFunded: 0, purchases: 0, asOf: null, purchaseLamports: 0, sharePercent: 50, stampFeeLamports: 5000, outside: null, shop: null, treasuryExplorerUrl: null, authorityExplorerUrl: null, wallet: null });
    expect(toCircuitShare({ lamports: -5, stamps_funded: 'x' })).toEqual({ lamports: 0, stampsFunded: 0 });
  });

  it('reads the share of a purchase when its transfer was sent or is about to be', () => {
    expect(toPurchaseCircuit({ status: 'sent', lamports: 550_000, stamps_funded: 110, explorer_url: 'https://e/tx' })).toEqual({ status: 'sent', stampsFunded: 110, explorerUrl: 'https://e/tx' });
    expect(toPurchaseCircuit({ status: 'pending', lamports: 550_000, stamps_funded: 110, explorer_url: null })).toEqual({ status: 'pending', stampsFunded: 110, explorerUrl: null });
    expect(toPurchaseCircuit({ status: 'pending', lamports: 0, stamps_funded: 0 })).toBeNull();
    for (const status of ['skipped', 'failed']) expect(toPurchaseCircuit({ status, stamps_funded: 110 })).toBeNull();
    expect(toPurchaseCircuit(undefined)).toBeNull();
  });
});
