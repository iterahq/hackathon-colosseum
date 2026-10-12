import type { StampExpectation } from '@/types/loop';
import type { ProfileLookup } from '@/types/learnerProfile';
import { stampShown } from '@/utils/loopView';

export const STAMP_READ_ATTEMPTS = 4;
export const STAMP_READ_WAIT_MS = 2_000;

export interface StampRead {
  lookup: ProfileLookup | null;
  /** The read carries the stamp. False: every attempt came back older than the stamp, or failed. */
  caught: boolean;
}

export type StampReadState = 'off' | 'reading' | 'caught' | 'behind';

interface Options {
  attempts?: number;
  waitMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Reads the profile past every cache until it carries the stamp the server just confirmed. A node that has
 * not seen the transaction yet answers with the older state: that answer is never handed to the screen.
 */
export async function readStampedProfile(read: () => Promise<ProfileLookup>, stamp: StampExpectation, { attempts = STAMP_READ_ATTEMPTS, waitMs = STAMP_READ_WAIT_MS, sleep = pause }: Options = {}): Promise<StampRead> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(waitMs);
    try {
      const lookup = await read();
      if (lookup.status === 'ok' && stampShown(lookup.profile, stamp)) return { lookup, caught: true };
    } catch {
      /* counted as an attempt that did not catch up */
    }
  }
  return { lookup: null, caught: false };
}

export function stampReadState(input: { expected: boolean; pending: boolean; fetching: boolean; failed: boolean; caught: boolean | undefined }): StampReadState {
  if (!input.expected) return 'off';
  if (input.caught && !input.failed) return 'caught';
  if (input.pending || input.fetching) return 'reading';
  return 'behind';
}
