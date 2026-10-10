import { describe, expect, it } from 'vitest';
import { toGift, toReferralStatus } from '@/services/gift.service';

describe('gift wire shapes', () => {
  it('reads the gift block of purchase-confirm and of the inbox', () => {
    const gift = toGift({
      id: 'g1',
      from: { wallet: 'FROM', name: 'Duda' },
      to: { wallet: 'TO', name: null },
      recipient: { lives: 6, max_lives: 5, companion_explorer_url: 'https://explorer/address/A' },
      payment_explorer_url: 'https://explorer/tx/P',
      mirror_tx_signature: 'M',
      mirror_explorer_url: 'https://explorer/tx/M',
    });
    expect(gift).toEqual({
      id: 'g1',
      fromWallet: 'FROM',
      fromName: 'Duda',
      toWallet: 'TO',
      toName: null,
      recipientLives: 6,
      recipientMax: 5,
      companionExplorerUrl: 'https://explorer/address/A',
      paymentExplorerUrl: 'https://explorer/tx/P',
      mirrorSignature: 'M',
      mirrorExplorerUrl: 'https://explorer/tx/M',
    });
  });

  it('answers null when there is no gift', () => {
    expect(toGift(undefined)).toBeNull();
    expect(toGift({ id: 'g1' })).toBeNull();
  });

  it('reads the referral status and counts by itself when the counters are missing', () => {
    const status = toReferralStatus({ code: 'bcdf2345', invited: [{ status: 'rewarded', at: 'a' }, { status: 'pending', at: 'b' }, { status: 'odd', at: 'c' }] });
    expect(status).toMatchObject({ code: 'bcdf2345', rewardedCount: 1, pendingCount: 2 });
    expect(() => toReferralStatus({})).toThrow();
  });
});
