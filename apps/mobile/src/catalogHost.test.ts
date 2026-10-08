import { describe, expect, it, vi } from 'vitest';
import type { BackendAnswer } from './backendProbe';
import { createCatalogHost, isVisitor, loadCatalog } from './catalogHost';
import type { NativeBackend } from './nativeBackend';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const ok = (value: unknown): BackendAnswer => ({ kind: 'ok', value, status: 200 });
const LABELS: Record<string, string> = { 'label.lesson': 'Lição', 'label.lessons': 'Lições', 'label.unit': 'Unidade', 'label.units': 'Unidades', 'label.activity': 'Atividade', 'label.activities': 'Atividades' };
const t = (key: string) => LABELS[key] ?? key;
const ROWS = [
  { id: 'p1', slug: 'html-do-zero', title_i18n: { pt: 'HTML do zero: sua primeira página', en: 'HTML from zero' }, unit_count: 1, lesson_count: 2, activity_count: 9, already_enrolled: false },
  { id: 'p2', slug: 'css', title_i18n: { pt: 'CSS' }, unit_count: 2, lesson_count: 1, activity_count: 1, already_enrolled: true },
];

function fakeBackend(answers: { programs?: BackendAnswer; subscriptions?: BackendAnswer; enroll?: BackendAnswer } = {}) {
  let session: ((signedIn: boolean) => void) | null = null;
  const rpc = vi.fn(async (name: string): Promise<BackendAnswer> => (name === 'enroll_in_program' ? (answers.enroll ?? ok([{ out_enrolled: true }])) : (answers.programs ?? ok(ROWS))));
  const rows = vi.fn(async (): Promise<BackendAnswer> => answers.subscriptions ?? ok([{ is_active: true }]));
  const backend: NativeBackend = {
    rpc,
    rows,
    onSession: (listener) => {
      session = listener;
      return () => {
        session = null;
      };
    },
  };
  return { backend, rpc, rows, emit: (signedIn: boolean) => session?.(signedIn) };
}

const hostOf = (fake: ReturnType<typeof fakeBackend>, enabled = true) => {
  const openProgram = vi.fn();
  return { host: createCatalogHost({ backend: fake.backend, t, locale: 'pt', enabled, openProgram }), openProgram };
};

describe('isVisitor', () => {
  it('only an active row of my_subscription is access', () => {
    expect(isVisitor([{ is_active: true }])).toBe(false);
    expect(isVisitor([{ is_active: false }, { is_active: true }])).toBe(false);
    expect(isVisitor([{ is_active: false }])).toBe(true);
    expect(isVisitor([{ is_active: 'true' }])).toBe(true);
    expect(isVisitor([])).toBe(true);
    expect(isVisitor(null)).toBe(true);
  });
});

describe('loadCatalog', () => {
  it('reads the catalog RPC and the subscription view, nothing else', async () => {
    const fake = fakeBackend();
    const loaded = await loadCatalog(fake.backend);
    expect(loaded.kind === 'ready' && loaded.value.programs.map((p) => p.slug)).toEqual(['html-do-zero', 'css']);
    expect(fake.rpc.mock.calls).toEqual([['catalog_programs']]);
    expect(fake.rows.mock.calls).toEqual([['my_subscription', 'select=is_active']]);
  });

  it('a failed subscription read is an error, never a visitor', async () => {
    expect(await loadCatalog(fakeBackend({ subscriptions: { kind: 'failed', status: 500 } }).backend)).toEqual({ kind: 'error', unreachable: false });
    expect(await loadCatalog(fakeBackend({ programs: { kind: 'failed', status: null } }).backend)).toEqual({ kind: 'error', unreachable: true });
    expect(await loadCatalog(fakeBackend({ programs: { kind: 'no-session' } }).backend)).toEqual({ kind: 'signed-out' });
  });
});

describe('createCatalogHost', () => {
  it('loading, then the cards of the web model in pt: Enroll for a member, Open once in', async () => {
    const { host } = hostOf(fakeBackend());
    host.subscribe(() => {});
    expect(host.snapshot()).toEqual({ gate: 'open', list: { kind: 'loading' } });
    await tick();
    const { list } = host.snapshot();
    expect(list.kind === 'ready' && list.programs.map((p) => [p.headline, p.subline, p.counts.lessons, p.action.kind])).toEqual([
      ['HTML do zero', 'sua primeira página', '2 lições', 'enroll'],
      ['CSS', null, '1 lição', 'open'],
    ]);
    expect(host.snapshot()).toBe(host.snapshot());
  });

  it('an account with no active subscription is sent back to the web gate: no card is drawn, and enroll does nothing', async () => {
    const fake = fakeBackend({ subscriptions: ok([]) });
    const { host } = hostOf(fake);
    host.subscribe(() => {});
    await tick();
    expect(host.snapshot()).toEqual({ gate: 'no-access', list: { kind: 'loading' } });
    host.enroll('p1');
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });

  it('empty, error with retry, and signed out', async () => {
    const empty = hostOf(fakeBackend({ programs: ok([]) })).host;
    empty.subscribe(() => {});
    await tick();
    expect(empty.snapshot().list).toEqual({ kind: 'empty' });

    const fake = fakeBackend({ programs: { kind: 'failed', status: null } });
    const failed = hostOf(fake).host;
    failed.subscribe(() => {});
    await tick();
    expect(failed.snapshot()).toEqual({ gate: 'open', list: { kind: 'error', unreachable: true } });
    failed.retry();
    expect(failed.snapshot().list).toEqual({ kind: 'loading' });
    expect(fake.rpc).toHaveBeenCalledTimes(2);

    const out = hostOf(fakeBackend({ programs: { kind: 'no-session' } })).host;
    out.subscribe(() => {});
    await tick();
    expect(out.snapshot().gate).toBe('signed-out');
  });

  it('a sign-out while the screen is up closes it at once', async () => {
    const fake = fakeBackend();
    const { host } = hostOf(fake);
    const seen = vi.fn();
    host.subscribe(seen);
    await tick();
    fake.emit(false);
    expect(host.snapshot().gate).toBe('signed-out');
    expect(seen).toHaveBeenCalled();
  });

  it('enroll: pending on that card, then the course opens and the list is read again', async () => {
    const fake = fakeBackend();
    const { host, openProgram } = hostOf(fake);
    host.subscribe(() => {});
    await tick();
    host.enroll('p1');
    const pending = host.snapshot().list;
    expect(pending.kind === 'ready' && pending.programs[0].action).toEqual({ kind: 'enroll', pending: true, failed: false });
    expect(fake.rpc).toHaveBeenLastCalledWith('enroll_in_program', { p_program_id: 'p1' });
    await tick();
    expect(openProgram).toHaveBeenCalledWith('html-do-zero');
    expect(fake.rpc.mock.calls.filter(([name]) => name === 'catalog_programs')).toHaveLength(2);
  });

  it('a failed enroll is shown on the card and opens nothing', async () => {
    const { host, openProgram } = hostOf(fakeBackend({ enroll: { kind: 'failed', status: 403 } }));
    host.subscribe(() => {});
    await tick();
    host.enroll('p1');
    await tick();
    const { list } = host.snapshot();
    expect(list.kind === 'ready' && list.programs[0].action).toEqual({ kind: 'enroll', pending: false, failed: true });
    expect(openProgram).not.toHaveBeenCalled();
  });

  it('a build that does not open the route reads nothing', async () => {
    const fake = fakeBackend();
    const { host } = hostOf(fake, false);
    host.subscribe(() => {});
    host.enroll('p1');
    host.retry();
    await tick();
    expect(host.snapshot()).toEqual({ gate: 'closed', list: { kind: 'loading' } });
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.rows).not.toHaveBeenCalled();
  });
});

// The cases of the adversarial review of #656 (findings 2 and 3): an enrollment belongs to one learner and one visit.
describe('createCatalogHost: an enrollment never crosses a session change or a visit', () => {
  function held() {
    let session: Array<(signedIn: boolean) => void> = [];
    let release: (answer: BackendAnswer) => void = () => {};
    const rpc = vi.fn((name: string): Promise<BackendAnswer> => (name === 'enroll_in_program' ? new Promise((resolve) => (release = resolve)) : Promise.resolve(ok(ROWS))));
    const backend: NativeBackend = {
      rpc,
      rows: vi.fn(async () => ok([{ is_active: true }])),
      onSession: (listener) => {
        session.push(listener);
        return () => {
          session = session.filter((l) => l !== listener);
        };
      },
    };
    const openProgram = vi.fn();
    const host = createCatalogHost({ backend, t, locale: 'pt', enabled: true, openProgram });
    const action = () => {
      const { list } = host.snapshot();
      return list.kind === 'ready' ? list.programs[0].action : list.kind;
    };
    const enrolls = () => rpc.mock.calls.filter(([name]) => name === 'enroll_in_program').length;
    return { host, rpc, openProgram, action, enrolls, emit: (signedIn: boolean) => session.forEach((l) => l(signedIn)), release: (answer: BackendAnswer) => release(answer) };
  }
  const IDLE = { kind: 'enroll', pending: false, failed: false };

  it('an enrollment learner A left in flight does not navigate learner B, nor read B\'s list again', async () => {
    const f = held();
    f.host.subscribe(() => {});
    await tick();
    f.host.enroll('p1');
    f.emit(false);
    f.emit(true);
    await tick();
    const reads = f.rpc.mock.calls.length;
    f.release(ok([{ out_enrolled: true }]));
    await tick();
    expect(f.openProgram).not.toHaveBeenCalled();
    expect(f.rpc.mock.calls.length).toBe(reads);
    expect(f.action()).toEqual(IDLE);
  });

  it('a failed enrollment of learner A is not shown to learner B', async () => {
    const f = held();
    f.host.subscribe(() => {});
    await tick();
    f.host.enroll('p1');
    f.release({ kind: 'failed', status: 500 });
    await tick();
    expect(f.action()).toEqual({ kind: 'enroll', pending: false, failed: true });
    f.emit(false);
    f.emit(true);
    await tick();
    expect(f.action()).toEqual(IDLE);
  });

  it('an enrollment of learner A still out does not block learner B: the card is idle and B\'s tap is sent', async () => {
    const f = held();
    f.host.subscribe(() => {});
    await tick();
    f.host.enroll('p1');
    f.emit(false);
    f.emit(true);
    await tick();
    expect(f.action()).toEqual(IDLE);
    f.host.enroll('p1');
    expect(f.enrolls()).toBe(2);
  });

  it('the failed mark clears when the screen leaves and comes back, and on a retry', async () => {
    const f = held();
    const off = f.host.subscribe(() => {});
    await tick();
    f.host.enroll('p1');
    f.release({ kind: 'failed', status: 500 });
    await tick();
    off();
    f.host.subscribe(() => {});
    await tick();
    expect(f.action()).toEqual(IDLE);
    f.host.enroll('p1');
    f.release({ kind: 'failed', status: 500 });
    await tick();
    expect(f.action()).toEqual({ kind: 'enroll', pending: false, failed: true });
    f.host.retry();
    await tick();
    expect(f.action()).toEqual(IDLE);
  });

  it('an enrollment that answers after the screen left opens nothing', async () => {
    const f = held();
    const off = f.host.subscribe(() => {});
    await tick();
    f.host.enroll('p1');
    off();
    f.release(ok([{ out_enrolled: true }]));
    await tick();
    expect(f.openProgram).not.toHaveBeenCalled();
  });

  it('two courses enroll at once, each with its own state', async () => {
    const f = held();
    f.host.subscribe(() => {});
    await tick();
    f.host.enroll('p1');
    f.host.enroll('p2');
    f.host.enroll('p1');
    expect(f.enrolls()).toBe(2);
    expect(f.action()).toEqual({ kind: 'enroll', pending: true, failed: false });
  });
});

