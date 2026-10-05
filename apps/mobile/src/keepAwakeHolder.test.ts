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
});
