import { describe, expect, it, vi } from 'vitest';
import { createScreenStore, failureOf, type Loaded } from './screenStore';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function session() {
  let listener: ((signedIn: boolean) => void) | null = null;
  return {
    on: (l: (signedIn: boolean) => void) => {
      listener = l;
      return () => {
        listener = null;
      };
    },
    emit: (signedIn: boolean) => listener?.(signedIn),
    bound: () => listener !== null,
  };
}

describe('failureOf', () => {
  it('no session beats an error; an error with no status is unreachable; all ok is null', () => {
    expect(failureOf([{ kind: 'ok', value: 1, status: 200 }])).toBeNull();
    expect(failureOf([{ kind: 'failed', status: 500 }, { kind: 'no-session' }])).toEqual({ kind: 'signed-out' });
    expect(failureOf([{ kind: 'not-configured' }])).toEqual({ kind: 'signed-out' });
    expect(failureOf([{ kind: 'ok', value: 1, status: 200 }, { kind: 'failed', status: 500 }])).toEqual({ kind: 'error', unreachable: false });
    expect(failureOf([{ kind: 'failed', status: null }])).toEqual({ kind: 'error', unreachable: true });
  });
});

describe('createScreenStore', () => {
  it('reads nothing until a listener arrives, then goes from loading to the answer', async () => {
    const load = vi.fn(async (): Promise<Loaded<number>> => ({ kind: 'ready', value: 1 }));
    const store = createScreenStore(load, session().on);
    expect(load).not.toHaveBeenCalled();
    expect(store.snapshot()).toEqual({ kind: 'loading' });
    const seen = vi.fn();
    store.subscribe(seen);
    expect(load).toHaveBeenCalledTimes(1);
    await tick();
    expect(store.snapshot()).toEqual({ kind: 'ready', value: 1 });
    expect(seen).toHaveBeenCalled();
    expect(store.snapshot()).toBe(store.snapshot());
  });

  it('a retry shows loading again; a quiet reload keeps what is on screen until the answer', async () => {
    let value = 1;
    const store = createScreenStore(async (): Promise<Loaded<number>> => ({ kind: 'ready', value }), session().on);
    store.subscribe(() => {});
    await tick();
    value = 2;
    store.reload(true);
    expect(store.snapshot()).toEqual({ kind: 'ready', value: 1 });
    await tick();
    expect(store.snapshot()).toEqual({ kind: 'ready', value: 2 });
    store.reload();
    expect(store.snapshot()).toEqual({ kind: 'loading' });
  });

  it('a read that throws is an error, never a hang', async () => {
    const store = createScreenStore<number>(async () => Promise.reject(new Error('x')), session().on);
    store.subscribe(() => {});
    await tick();
    expect(store.snapshot()).toEqual({ kind: 'error', unreachable: false });
  });

  it('a sign-out drops the data at once and outruns a read in flight; another learner reads again', async () => {
    const s = session();
    let answer: (value: Loaded<number>) => void = () => {};
    const load = vi.fn(() => new Promise<Loaded<number>>((resolve) => (answer = resolve)));
    const store = createScreenStore(load, s.on);
    store.subscribe(() => {});
    const first = answer;
    s.emit(false);
    expect(store.snapshot()).toEqual({ kind: 'signed-out' });
    first({ kind: 'ready', value: 1 });
    await tick();
    expect(store.snapshot()).toEqual({ kind: 'signed-out' });
    s.emit(true);
    expect(load).toHaveBeenCalledTimes(2);
    answer({ kind: 'ready', value: 2 });
    await tick();
    expect(store.snapshot()).toEqual({ kind: 'ready', value: 2 });
  });

  it('when the last listener leaves it stops following the session and ignores the read in flight', async () => {
    const s = session();
    let answer: (value: Loaded<number>) => void = () => {};
    const store = createScreenStore(() => new Promise<Loaded<number>>((resolve) => (answer = resolve)), s.on);
    const off = store.subscribe(() => {});
    expect(s.bound()).toBe(true);
    off();
    expect(s.bound()).toBe(false);
    answer({ kind: 'ready', value: 1 });
    await tick();
    expect(store.snapshot()).toEqual({ kind: 'loading' });
  });
});
