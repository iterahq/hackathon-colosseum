import { describe, expect, it, vi } from 'vitest';
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
  // Every caller gets the outcome of the activation it depends on: the second shares the first's platform call, success or failure.
  it('rejects the second caller too when the pending activate then fails, and nothing is held', async () => {
    let fail: (error: Error) => void = () => undefined;
    const holder = createKeepAwakeHolder({
      activate: () => new Promise<void>((_resolve, reject) => (fail = reject)),
      deactivate: () => undefined,
    });
    const first = holder.set(true);
    const firstOutcome = first.then(() => 'resolved', () => 'rejected');
    const second = holder.set(true);
    const secondOutcome = second.then(() => 'resolved', () => 'rejected');
    await new Promise((resolve) => setTimeout(resolve, 0));
    fail(new Error('activate failed'));
    expect(await firstOutcome).toBe('rejected');
    expect(await secondOutcome).toBe('rejected');
    expect(holder.held()).toBe(false);
  });

  it('resolves the second caller true when the pending activate succeeds, with one platform call', async () => {
    let done: () => void = () => undefined;
    const activate = vi.fn(() => new Promise<void>((resolve) => (done = resolve)));
    const holder = createKeepAwakeHolder({ activate, deactivate: () => undefined });
    const first = holder.set(true);
    const second = holder.set(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    done();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(holder.held()).toBe(true);
  });

  it('after the failure settled, a new on:true tries again and a release resolves false without an error', async () => {
    let calls = 0;
    const holder = createKeepAwakeHolder({ activate: () => (++calls === 1 ? Promise.reject(new Error('once')) : undefined), deactivate: () => undefined });
    await expect(holder.set(true)).rejects.toThrow('once');
    await expect(holder.set(false)).resolves.toBe(false);
    await expect(holder.set(true)).resolves.toBe(true);
    expect(holder.held()).toBe(true);
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

  // The second on:true of one owner, asked while its first activate is pending, gets the outcome of that activate.
  it('a second on:true of one owner while the first activate is pending rejects when the activate fails, and the owner holds nothing', async () => {
    let fail: (error: Error) => void = () => undefined;
    const a = createKeepAwakeClaims({ activate: () => new Promise<void>((_resolve, reject) => (fail = reject)), deactivate: () => undefined }).owner('a');
    const first = a.set(true).then(() => 'resolved', () => 'rejected');
    const second = a.set(true).then(() => 'resolved', () => 'rejected');
    await new Promise((resolve) => setTimeout(resolve, 0));
    fail(new Error('activate failed'));
    expect(await first).toBe('rejected');
    expect(await second).toBe('rejected');
    expect(a.held()).toBe(false);
  });
});
