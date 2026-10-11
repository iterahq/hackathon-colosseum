import { sha256Hex } from './sha256.ts';

/** How long a pass graded for a visitor can still be claimed with its own time. */
export const GUEST_RECEIPT_TTL_MS = 30 * 24 * 60 * 60_000;

/**
 * What a visitor's passing answer gets back: when the server graded it, signed.
 * A sign-in sends it with the replayed answer, so the completion is recorded at
 * the moment the answer was really graded and not at the moment of the replay.
 */
export interface GuestReceipt {
  graded_at: string;
  sig: string;
}

function signature(secret: string, activityId: string, gradedAt: string): string {
  return sha256Hex(`${secret}\n${sha256Hex(`${secret}\nguest-receipt\n${activityId}\n${gradedAt}`)}`);
}

export function signGuestReceipt(secret: string, activityId: string, gradedAt: Date): GuestReceipt {
  const at = gradedAt.toISOString();
  return { graded_at: at, sig: signature(secret, activityId, at) };
}

/** The moment a receipt proves, in ms; `null` when it is not this server's, not this activity's, from the future or too old. */
export function guestReceiptTime(secret: string, activityId: string, receipt: unknown, now: Date): number | null {
  if (typeof receipt !== 'object' || receipt === null) return null;
  const { graded_at: gradedAt, sig } = receipt as Record<string, unknown>;
  if (typeof gradedAt !== 'string' || typeof sig !== 'string' || gradedAt.length > 40) return null;
  const at = new Date(gradedAt).getTime();
  if (Number.isNaN(at) || new Date(at).toISOString() !== gradedAt) return null;
  if (at > now.getTime() || now.getTime() - at > GUEST_RECEIPT_TTL_MS) return null;
  return signature(secret, activityId, gradedAt) === sig ? at : null;
}

/**
 * When each claimed answer was completed. A receipt's own time is used as it
 * is. An answer with no receipt (a reading step is never sent for grading)
 * takes the time the browser says, only when that lies between two signed
 * times: the browser's word can order the steps, never stretch the day.
 * Everything else is `now`.
 */
export function claimTimes(items: ReadonlyArray<{ receiptAt: number | null; settledAt: number | null }>, now: Date): number[] {
  const signed = items.map((item) => item.receiptAt).filter((at): at is number => at !== null);
  const first = signed.length > 0 ? Math.min(...signed) : null;
  const last = signed.length > 0 ? Math.max(...signed) : null;
  return items.map((item) => {
    if (item.receiptAt !== null) return item.receiptAt;
    if (first !== null && last !== null && item.settledAt !== null && item.settledAt >= first && item.settledAt <= last) return item.settledAt;
    return now.getTime();
  });
}
