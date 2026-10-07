import { describe, expect, it } from 'vitest';
import { KEEP_AWAKE_TAG, createKeepAwakeClaims, createKeepAwakeHolder } from './keepAwakeHolder';

function spies(opts: { failActivate?: boolean; failDeactivate?: boolean } = {}) {
  const calls: string[] = [];
  return {
    calls,
    effects: {
      activate: async (tag: string) => {
        calls.push(`activate:${tag}`);
        if (opts.failActivate) throw new Error('activate failed');
      },
      deactivate: async (tag: string) => {
        calls.push(`deactivate:${tag}`);
        if (opts.failDeactivate) throw new Error('deactivate failed');
      },
    },
  };
}

describe('createKeepAwakeHolder', () => {
  it('holds with the tag, and a second hold is a no-op', async () => {
    const s = spies();
    const holder = createKeepAwakeHolder(s.effects);
    expect(await holder.set(true)).toBe(true);
    expect(await holder.set(true)).toBe(true);
    expect(holder.held()).toBe(true);
    expect(s.calls).toEqual([`activate:${KEEP_AWAKE_TAG}`]);
  });

  it('releasing what is not held calls nothing', async () => {
    const s = spies();
    const holder = createKeepAwakeHolder(s.effects);
    await holder.releaseAll();
    expect(await holder.set(false)).toBe(false);
    expect(s.calls).toEqual([]);
  });

  it('releaseAll releases a hold and is idempotent', async () => {
    const s = spies();
    const holder = createKeepAwakeHolder(s.effects);
    await holder.set(true);
    await holder.releaseAll();
    await holder.releaseAll();
    expect(holder.held()).toBe(false);
    expect(s.calls).toEqual([`activate:${KEEP_AWAKE_TAG}`, `deactivate:${KEEP_AWAKE_TAG}`]);
  });

  it('runs the platform calls in the order they were asked, even when a release follows a hold that has not settled', async () => {
    const order: string[] = [];
    let finishActivate: () => void = () => undefined;
    const holder = createKeepAwakeHolder({
      activate: () =>
        new Promise<void>((resolve) => {
          order.push('activate:start');
          finishActivate = () => (order.push('activate:end'), resolve());
        }),
      deactivate: () => void order.push('deactivate'),
    });
    const hold = holder.set(true);
    const release = holder.releaseAll();
    await Promise.resolve();
    expect(order).toEqual(['activate:start']);
    finishActivate();
    await Promise.all([hold, release]);
    expect(order).toEqual(['activate:start', 'activate:end', 'deactivate']);
    expect(holder.held()).toBe(false);
  });

  it('a failing activate rejects and leaves nothing held', async () => {
    const holder = createKeepAwakeHolder(spies({ failActivate: true }).effects);
    await expect(holder.set(true)).rejects.toThrow('activate failed');
    expect(holder.held()).toBe(false);
  });

  it('a failing release never throws and stays held, so the next release retries', async () => {
    const s = spies({ failDeactivate: true });
    const holder = createKeepAwakeHolder(s.effects);
    await holder.set(true);
    await expect(holder.releaseAll()).resolves.toBeUndefined();
    expect(holder.held()).toBe(true);
    await holder.releaseAll();
    expect(s.calls.filter((c) => c.startsWith('deactivate'))).toHaveLength(2);
  });
});

describe('createKeepAwakeHolder: a second on:true while the first activate is pending', () => {
  // PINS THE CURRENT BEHAVIOUR, WHICH IS UNDER QUESTION (PR "Found, not changed", keepAwakeHolder.ts `if (on === held) return chain.then(() => on)`):
  // the second caller is told `true` although the activate it waited for failed and nothing is held. If this is fixed, the
  // second call should reject (or resolve false) and this test should change with it.
  it('resolves true for the second caller even when the pending activate then fails, and nothing is held', async () => {
    let fail: (error: Error) => void = () => undefined;
    const holder = createKeepAwakeHolder({
      activate: () => new Promise<void>((_resolve, reject) => (fail = reject)),
      deactivate: () => undefined,
    });
    const first = holder.set(true);
    const firstOutcome = first.then(() => 'resolved', () => 'rejected');
    const second = holder.set(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fail(new Error('activate failed'));
    expect(await firstOutcome).toBe('rejected');
    expect(await second).toBe(true);
    expect(holder.held()).toBe(false);
  });
});

describe('createKeepAwakeClaims', () => {
  it('one platform lock for many owners: it ends with the last claim, and a release drops only its own', async () => {
    const s = spies();
    const claims = createKeepAwakeClaims(s.effects);
    const a = claims.owner('a');
    const b = claims.owner('b');
    await a.set(true);
    await b.set(true);
    await a.releaseAll();
    expect(a.held()).toBe(false);
    expect(b.held()).toBe(true);
    expect(s.calls).toEqual([`activate:${KEEP_AWAKE_TAG}`]);
    await b.releaseAll();
    await b.releaseAll();
    expect(s.calls).toEqual([`activate:${KEEP_AWAKE_TAG}`, `deactivate:${KEEP_AWAKE_TAG}`]);
  });

  it('a failing activate leaves no claim', async () => {
    const a = createKeepAwakeClaims(spies({ failActivate: true }).effects).owner('a');
    await expect(a.set(true)).rejects.toThrow('activate failed');
    expect(a.held()).toBe(false);
  });

  it('a failing release of a held claim never throws, keeps the claim, and the next release retries and ends it', async () => {
    const opts = { failDeactivate: true };
    const s = spies(opts);
    const a = createKeepAwakeClaims(s.effects).owner('a');
    await a.set(true);
    await expect(a.releaseAll()).resolves.toBeUndefined();
    expect(a.held()).toBe(true);
    opts.failDeactivate = false;
    await a.releaseAll();
    expect(a.held()).toBe(false);
    expect(s.calls.filter((c) => c.startsWith('deactivate'))).toHaveLength(2);
  });

  it('a failing release rejects through set(false) and does not drop the claim of another owner', async () => {
    const opts = { failDeactivate: true };
    const claims = createKeepAwakeClaims(spies(opts).effects);
    const a = claims.owner('a');
    const b = claims.owner('b');
    await a.set(true);
    await b.set(true);
    await expect(a.set(false)).resolves.toBe(false);
    expect(b.held()).toBe(true);
    await expect(b.set(false)).rejects.toThrow('deactivate failed');
    expect(b.held()).toBe(true);
  });

  // PINS THE CURRENT BEHAVIOUR, WHICH IS UNDER QUESTION (same cause as the holder test above): the second on:true of one owner,
  // asked while its first activate is pending, resolves true after that activate failed, and the owner holds nothing.
  it('a second on:true of one owner while the first activate is pending resolves true although the activate fails', async () => {
    let fail: (error: Error) => void = () => undefined;
    const a = createKeepAwakeClaims({ activate: () => new Promise<void>((_resolve, reject) => (fail = reject)), deactivate: () => undefined }).owner('a');
    const first = a.set(true).then(() => 'resolved', () => 'rejected');
    const second = a.set(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fail(new Error('activate failed'));
    expect(await first).toBe('rejected');
    expect(await second).toBe(true);
    expect(a.held()).toBe(false);
  });
});
