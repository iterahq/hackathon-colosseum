import { describe, expect, it } from 'vitest';
import { GUEST_RECEIPT_TTL_MS, claimTimes, guestReceiptTime, signGuestReceipt } from './guest-receipt.ts';

const SECRET = 'lesson-seal:test';
const ACTIVITY = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-10-11T17:00:00.000Z');
const earlier = new Date('2026-10-11T16:50:00.000Z');

describe('guest receipt', () => {
  it('proves the time the server signed', () => {
    const receipt = signGuestReceipt(SECRET, ACTIVITY, earlier);
    expect(guestReceiptTime(SECRET, ACTIVITY, receipt, now)).toBe(earlier.getTime());
  });

  it('is refused for another activity, another time, another key', () => {
    const receipt = signGuestReceipt(SECRET, ACTIVITY, earlier);
    expect(guestReceiptTime(SECRET, OTHER, receipt, now)).toBeNull();
    expect(guestReceiptTime(SECRET, ACTIVITY, { ...receipt, graded_at: '2026-10-11T10:00:00.000Z' }, now)).toBeNull();
    expect(guestReceiptTime('lesson-seal:other', ACTIVITY, receipt, now)).toBeNull();
  });

  it('is refused from the future, when too old, and when malformed', () => {
    expect(guestReceiptTime(SECRET, ACTIVITY, signGuestReceipt(SECRET, ACTIVITY, new Date(now.getTime() + 1000)), now)).toBeNull();
    expect(guestReceiptTime(SECRET, ACTIVITY, signGuestReceipt(SECRET, ACTIVITY, new Date(now.getTime() - GUEST_RECEIPT_TTL_MS - 1)), now)).toBeNull();
    expect(guestReceiptTime(SECRET, ACTIVITY, null, now)).toBeNull();
    expect(guestReceiptTime(SECRET, ACTIVITY, { graded_at: 'yesterday', sig: 'x' }, now)).toBeNull();
    expect(guestReceiptTime(SECRET, ACTIVITY, { graded_at: 5, sig: 'x' }, now)).toBeNull();
  });
});

describe('claimTimes', () => {
  const t = (seconds: number) => earlier.getTime() + seconds * 1000;

  it('keeps signed times and lets the browser order the steps between them', () => {
    const times = claimTimes(
      [
        { receiptAt: t(0), settledAt: t(0) },
        { receiptAt: null, settledAt: t(30) },
        { receiptAt: t(60), settledAt: t(61) },
      ],
      now,
    );
    expect(times).toEqual([t(0), t(30), t(60)]);
  });

  it('never lets an unsigned time stretch the day', () => {
    const times = claimTimes(
      [
        { receiptAt: t(10), settledAt: null },
        { receiptAt: null, settledAt: t(-3600) },
        { receiptAt: null, settledAt: t(4000) },
        { receiptAt: t(20), settledAt: null },
      ],
      now,
    );
    expect(times).toEqual([t(10), now.getTime(), now.getTime(), t(20)]);
  });

  it('is now for everything when nothing is signed', () => {
    expect(claimTimes([{ receiptAt: null, settledAt: t(5) }, { receiptAt: null, settledAt: null }], now)).toEqual([now.getTime(), now.getTime()]);
  });
});
