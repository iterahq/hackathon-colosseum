import { describe, expect, it, vi } from 'vitest';
import type { LearnerProfile, ProfileLookup } from '@/types/learnerProfile';
import { readStampedProfile, stampReadState } from './stampRead';

const stamp = { asset: 'asset-1', daysDone: 1, trail: 0, day: 1 };
const lookup = (daysDone: number, verified: boolean, claim: 'verified' | 'recorded' | 'open'): ProfileLookup => ({
  status: 'ok',
  profile: {
    certifications: daysDone > 0 ? [{ asset: 'asset-1', verified, daysDone }] : [],
    capabilities: { nodes: [{ id: 'html-tags', trail: 0, day: 1, status: claim }] },
  } as unknown as LearnerProfile,
});
const sleep = vi.fn(async () => {});

describe('readStampedProfile', () => {
  it('hands over the first read that carries the stamp', async () => {
    const read = vi.fn(async () => lookup(1, true, 'verified'));
    const result = await readStampedProfile(read, stamp, { sleep });
    expect(result.caught).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('reads again while the answer is older than the stamp, and never hands the older answer over', async () => {
    const answers = [lookup(0, false, 'open'), lookup(1, false, 'recorded'), lookup(1, true, 'recorded'), lookup(1, true, 'verified')];
    const read = vi.fn(async () => answers.shift()!);
    const result = await readStampedProfile(read, stamp, { attempts: 4, sleep });
    expect(read).toHaveBeenCalledTimes(4);
    expect(result.caught).toBe(true);
    expect(result.lookup).toEqual(lookup(1, true, 'verified'));
  });

  it('gives up without a profile when no read catches up or the read keeps failing', async () => {
    const stale = await readStampedProfile(async () => lookup(0, false, 'open'), stamp, { attempts: 3, sleep });
    expect(stale).toEqual({ lookup: null, caught: false });
    const failing = vi.fn(async () => {
      throw new Error('502');
    });
    expect(await readStampedProfile(failing, stamp, { attempts: 2, sleep })).toEqual({ lookup: null, caught: false });
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('accepts a day whose claim was never recorded, since nothing is waiting for the chain', async () => {
    expect((await readStampedProfile(async () => lookup(1, true, 'open'), stamp, { sleep })).caught).toBe(true);
  });
});

describe('stampReadState', () => {
  const base = { expected: true, pending: false, fetching: false, failed: false, caught: undefined as boolean | undefined };
  it('is off without a confirmed stamp', () => {
    expect(stampReadState({ ...base, expected: false, pending: true })).toBe('off');
  });
  it('is reading until an answer arrives, and again during a re-read', () => {
    expect(stampReadState({ ...base, pending: true })).toBe('reading');
    expect(stampReadState({ ...base, caught: false, fetching: true })).toBe('reading');
  });
  it('is caught once the read carries the stamp, behind when it did not', () => {
    expect(stampReadState({ ...base, caught: true })).toBe('caught');
    expect(stampReadState({ ...base, caught: false })).toBe('behind');
    expect(stampReadState({ ...base, failed: true })).toBe('behind');
  });
});
